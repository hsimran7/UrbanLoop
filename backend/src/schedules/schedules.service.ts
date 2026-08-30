import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { realtimeEventEmitter } from '../realtime/realtime.event-emitter';
import {
  BinType,
  DayOfWeek,
  ScheduleStatus,
  ExceptionType,
  UserRole,
  PropertyStatus,
} from '@prisma/client';

export interface ResolvedOccurrence {
  propertyId: string;
  propertyName: string;
  areaId: string;
  areaName: string;
  wasteType: BinType;
  collectionDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  source: 'REGULAR' | 'RESCHEDULED' | 'SPECIAL';
  scheduleId?: string;
  exceptionId?: string;
  changeReason?: string;
}

@Injectable()
export class SchedulesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // Domain Event Hook
  private async emitEvent(event: string, payload: any) {
    console.log(
      `\n==================================================\n` +
      `[EVENT ARCHITECTURE] Emitted Domain Event: ${event}\n` +
      `Payload: ${JSON.stringify(payload, null, 2)}\n` +
      `==================================================\n`
    );
    if (payload.areaId) {
      realtimeEventEmitter.emit('scheduleUpdated', { areaId: payload.areaId });
      await this.notifyCitizens(payload.areaId, event);
    }
  }

  private async notifyCitizens(areaId: string, eventType: string) {
    const properties = await this.prisma.property.findMany({
      where: { areaId },
      select: { ownerId: true, area: { select: { name: true } } }
    });
    
    if (properties.length === 0) return;
    
    const ownerIds = Array.from(new Set(properties.map(p => p.ownerId)));
    const areaName = properties[0].area.name;

    const actionText = eventType === 'SCHEDULE_CREATED' ? 'New Collection Schedule created'
                     : eventType === 'SCHEDULE_UPDATED' ? 'Collection Schedule updated'
                     : eventType === 'SCHEDULE_STATUS_CHANGED' ? 'Collection Schedule status changed'
                     : 'Collection Schedule exception added';

    for (const ownerId of ownerIds) {
      await this.prisma.notification.create({
        data: {
          userId: ownerId,
          title: 'Collection Schedule Updated',
          body: `Area: ${areaName}\nNotice: ${actionText}. Check dashboard for the latest timings.`,
          type: 'SYSTEM'
        }
      });
      realtimeEventEmitter.emit('notification', {
        userId: ownerId,
        title: 'Collection Schedule Updated',
        body: `Area: ${areaName}\nNotice: ${actionText}. Check dashboard for the latest timings.`,
        type: 'SYSTEM'
      });
    }

    realtimeEventEmitter.emit('notificationCreated', { type: 'SCHEDULE_UPDATE', areaId });
  }

  // Resolves the administrative scope and city's timezone
  async getAreaTimezone(areaId: string): Promise<string> {
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      include: {
        ward: {
          include: {
            city: true,
          },
        },
      },
    });
    if (!area) {
      throw new NotFoundException('Selected Area does not exist.');
    }
    return area.ward.city.timezone || 'Asia/Kolkata';
  }

  // Conflict validation: Check for overlapping times & date ranges
  async checkScheduleConflict(
    areaId: string,
    wasteType: BinType,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    effectiveFrom: Date,
    effectiveUntil: Date | null,
    excludeScheduleId?: string,
  ): Promise<void> {
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time.');
    }

    if (effectiveUntil && effectiveFrom >= effectiveUntil) {
      throw new BadRequestException('Effective from date must be before effective until date.');
    }

    const schedules = await this.prisma.collectionSchedule.findMany({
      where: {
        areaId,
        wasteType,
        dayOfWeek,
        status: ScheduleStatus.ACTIVE,
        id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
      },
    });

    for (const s of schedules) {
      // Check time overlap: startTime1 < endTime2 && startTime2 < endTime1
      const timeOverlap = startTime < s.endTime && s.startTime < endTime;

      // Check date range overlap (null represents open-ended)
      const sUntil = s.effectiveUntil ? s.effectiveUntil.getTime() : Infinity;
      const currentUntil = effectiveUntil ? effectiveUntil.getTime() : Infinity;
      const sFrom = s.effectiveFrom.getTime();
      const currentFrom = effectiveFrom.getTime();

      const dateOverlap = currentFrom <= sUntil && sFrom <= currentUntil;

      if (timeOverlap && dateOverlap) {
        throw new ConflictException(
          `Scheduling conflict: An active ${wasteType} collection is already scheduled for ${dayOfWeek} from ${s.startTime} to ${s.endTime} during this period.`,
        );
      }
    }
  }

  async createSchedule(dto: CreateScheduleDto, userId: string, ip?: string, ua?: string) {
    // Assert area exists
    await this.getAreaTimezone(dto.areaId);

    // Validate conflict
    await this.checkScheduleConflict(
      dto.areaId,
      dto.wasteType,
      dto.dayOfWeek,
      dto.startTime,
      dto.endTime,
      dto.effectiveFrom,
      dto.effectiveUntil || null,
    );

    const schedule = await this.prisma.collectionSchedule.create({
      data: {
        areaId: dto.areaId,
        wasteType: dto.wasteType,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        effectiveFrom: dto.effectiveFrom,
        effectiveUntil: dto.effectiveUntil || null,
        createdBy: userId,
        status: ScheduleStatus.ACTIVE,
      },
    });

    await this.auditService.log(userId, 'CREATE_SCHEDULE', ip, ua, {
      scheduleId: schedule.id,
      areaId: schedule.areaId,
      day: schedule.dayOfWeek,
    });

    await this.emitEvent('SCHEDULE_CREATED', { scheduleId: schedule.id, areaId: schedule.areaId });

    return schedule;
  }

  async findAll(user: { id: string; role: UserRole }) {
    return this.prisma.collectionSchedule.findMany({
      include: {
        area: {
          include: {
            ward: {
              include: {
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.collectionSchedule.findUnique({
      where: { id },
      include: {
        area: {
          include: {
            ward: {
              include: {
                city: true,
              },
            },
          },
        },
        exceptions: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found.');
    }

    return schedule;
  }

  async updateSchedule(
    id: string,
    dto: Partial<CreateScheduleDto>,
    userId: string,
    ip?: string,
    ua?: string,
  ) {
    const schedule = await this.findOne(id);

    const areaId = dto.areaId || schedule.areaId;
    const wasteType = dto.wasteType || schedule.wasteType;
    const dayOfWeek = dto.dayOfWeek || schedule.dayOfWeek;
    const startTime = dto.startTime || schedule.startTime;
    const endTime = dto.endTime || schedule.endTime;
    const effectiveFrom = dto.effectiveFrom || schedule.effectiveFrom;
    const effectiveUntil = dto.effectiveUntil !== undefined ? dto.effectiveUntil : schedule.effectiveUntil;

    // Check conflict
    await this.checkScheduleConflict(
      areaId,
      wasteType,
      dayOfWeek,
      startTime,
      endTime,
      new Date(effectiveFrom),
      effectiveUntil ? new Date(effectiveUntil) : null,
      id,
    );

    // Update safety: Validate existing exceptions
    if (schedule.exceptions && schedule.exceptions.length > 0) {
      const timezone = await this.getAreaTimezone(areaId);
      for (const ex of schedule.exceptions) {
        // Validation check for day of week match
        const localDay = this.getLocalDayOfWeek(ex.originalDate, timezone);
        if (localDay !== dayOfWeek) {
          throw new BadRequestException(
            `Update rejected: Existing exception on ${this.getLocalDateString(ex.originalDate, timezone)} is not on the new day of week (${dayOfWeek}).`,
          );
        }
        // Validation check for effective date range
        const exTime = ex.originalDate.getTime();
        const fromTime = new Date(effectiveFrom).getTime();
        const untilTime = effectiveUntil ? new Date(effectiveUntil).getTime() : Infinity;

        if (exTime < fromTime || exTime > untilTime) {
          throw new BadRequestException(
            `Update rejected: Existing exception on ${this.getLocalDateString(ex.originalDate, timezone)} falls outside the new effective period.`,
          );
        }
      }
    }

    const updated = await this.prisma.collectionSchedule.update({
      where: { id },
      data: {
        areaId,
        wasteType,
        dayOfWeek,
        startTime,
        endTime,
        effectiveFrom: new Date(effectiveFrom),
        effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : null,
      },
    });

    await this.auditService.log(userId, 'UPDATE_SCHEDULE', ip, ua, {
      scheduleId: id,
      updates: dto,
    });

    await this.emitEvent('SCHEDULE_UPDATED', { scheduleId: id, areaId: updated.areaId });

    return updated;
  }

  async updateStatus(id: string, status: ScheduleStatus, userId: string, ip?: string, ua?: string) {
    const schedule = await this.findOne(id);

    // If activating, verify conflicts
    if (status === ScheduleStatus.ACTIVE) {
      await this.checkScheduleConflict(
        schedule.areaId,
        schedule.wasteType,
        schedule.dayOfWeek,
        schedule.startTime,
        schedule.endTime,
        schedule.effectiveFrom,
        schedule.effectiveUntil,
        id,
      );
    }

    const updated = await this.prisma.collectionSchedule.update({
      where: { id },
      data: { status },
    });

    await this.auditService.log(userId, 'UPDATE_SCHEDULE_STATUS', ip, ua, {
      scheduleId: id,
      status,
    });

    await this.emitEvent('SCHEDULE_STATUS_CHANGED', { scheduleId: id, status, areaId: updated.areaId });

    return updated;
  }

  async createException(dto: CreateExceptionDto, userId: string, ip?: string, ua?: string) {
    // Assert area exists
    await this.getAreaTimezone(dto.areaId);

    // Exception Target Validations
    if (dto.type === ExceptionType.CANCELLED || dto.type === ExceptionType.RESCHEDULED) {
      if (!dto.scheduleId) {
        throw new BadRequestException('scheduleId is required for cancellation or rescheduling exceptions.');
      }
      const schedule = await this.prisma.collectionSchedule.findUnique({
        where: { id: dto.scheduleId },
      });
      if (!schedule) {
        throw new NotFoundException('Target Collection Schedule not found.');
      }
      if (schedule.areaId !== dto.areaId) {
        throw new BadRequestException('Target schedule belongs to a different Area.');
      }

      // Assert originalDate matches schedule day of week
      const timezone = await this.getAreaTimezone(dto.areaId);
      const exDay = this.getLocalDayOfWeek(dto.originalDate, timezone);
      if (exDay !== schedule.dayOfWeek) {
        throw new BadRequestException(
          `Exception originalDate falls on a ${exDay}, which does not match schedule recurring day (${schedule.dayOfWeek}).`,
        );
      }
    }

    if (dto.type === ExceptionType.RESCHEDULED) {
      if (!dto.replacementDate || !dto.replacementStartTime || !dto.replacementEndTime) {
        throw new BadRequestException('Rescheduling exceptions require a replacement date and start/end times.');
      }
      if (dto.replacementStartTime >= dto.replacementEndTime) {
        throw new BadRequestException('Replacement start time must be before end time.');
      }
    }

    if (dto.type === ExceptionType.SPECIAL_COLLECTION) {
      if (!dto.wasteType) {
        throw new BadRequestException('SPECIAL_COLLECTION exceptions require a wasteType.');
      }
      if (!dto.replacementStartTime || !dto.replacementEndTime) {
        throw new BadRequestException('SPECIAL_COLLECTION exceptions require start and end times.');
      }
      if (dto.replacementStartTime >= dto.replacementEndTime) {
        throw new BadRequestException('Replacement start time must be before end time.');
      }
    }

    const exception = await this.prisma.scheduleException.create({
      data: {
        areaId: dto.areaId,
        scheduleId: dto.scheduleId || null,
        originalDate: dto.originalDate,
        replacementDate: dto.replacementDate || null,
        replacementStartTime: dto.replacementStartTime || null,
        replacementEndTime: dto.replacementEndTime || null,
        reason: dto.reason,
        type: dto.type,
        wasteType: dto.wasteType || null,
        createdBy: userId,
      },
    });

    await this.auditService.log(userId, 'CREATE_SCHEDULE_EXCEPTION', ip, ua, {
      exceptionId: exception.id,
      type: exception.type,
      areaId: exception.areaId,
    });

    // Emit event succeeds only after DB commits
    const eventType =
      dto.type === ExceptionType.CANCELLED
        ? 'SCHEDULE_CANCELLED'
        : dto.type === ExceptionType.RESCHEDULED
        ? 'SCHEDULE_RESCHEDULED'
        : 'SPECIAL_COLLECTION_CREATED';

    await this.emitEvent(eventType, { exceptionId: exception.id, areaId: exception.areaId });

    return exception;
  }

  // Citizen Scheduling Occurrence Resolution engine
  async getCitizenSchedules(citizenId: string, startDate: Date, endDate: Date): Promise<any> {
    const verifiedProperties = await this.prisma.property.findMany({
      where: {
        ownerId: citizenId,
        status: PropertyStatus.VERIFIED,
      },
      include: {
        area: {
          include: {
            ward: {
              include: {
                city: true,
              },
            },
          },
        },
      },
    });

    const results = [];

    for (const property of verifiedProperties) {
      const areaId = property.areaId;
      const timezone = property.area.ward.city.timezone || 'Asia/Kolkata';

      // Query active recurring schedules for area
      const areaSchedules = await this.prisma.collectionSchedule.findMany({
        where: {
          areaId,
          propertyId: null,
          binId: null,
          status: ScheduleStatus.ACTIVE,
          effectiveFrom: { lte: endDate },
        },
      });

      const propertyBins = this.prisma.bin
        ? await this.prisma.bin.findMany({
            where: { collectionPoint: { propertyId: property.id } }
          })
        : [];
      const binIds = propertyBins.map(b => b.id);

      const overrideSchedules = await this.prisma.collectionSchedule.findMany({
        where: {
          OR: [
            { propertyId: property.id },
            { binId: { in: binIds } }
          ],
          status: ScheduleStatus.ACTIVE,
          effectiveFrom: { lte: endDate },
        }
      });

      const combinedSchedulesMap = new Map<string, typeof areaSchedules[0]>();
      
      areaSchedules.forEach(s => {
        combinedSchedulesMap.set(`${s.dayOfWeek}-${s.wasteType}`, s);
      });

      overrideSchedules.forEach(s => {
        combinedSchedulesMap.set(`${s.dayOfWeek}-${s.wasteType}`, s);
      });

      const schedules = Array.from(combinedSchedulesMap.values());

      // Query exceptions active for area
      const exceptions = await this.prisma.scheduleException.findMany({
        where: {
          areaId,
          OR: [
            { originalDate: { gte: startDate, lte: endDate } },
            { replacementDate: { gte: startDate, lte: endDate } },
          ],
        },
        include: {
          schedule: true,
        },
      });

      const propertyOccurrences: ResolvedOccurrence[] = [];

      // Loop through each calendar day in date range
      const current = new Date(startDate);
      while (current <= endDate) {
        const localDateStr = this.getLocalDateString(current, timezone); // YYYY-MM-DD
        const localDayOfWeek = this.getLocalDayOfWeek(current, timezone) as DayOfWeek;

        // Process recurring schedules matching local day of week
        for (const s of schedules) {
          if (s.dayOfWeek !== localDayOfWeek) continue;

          // Check effective dates
          if (current < s.effectiveFrom) continue;
          if (s.effectiveUntil && current > s.effectiveUntil) continue;

          // Check exceptions matching s.id and local date string
          const matchingException = exceptions.find(
            (ex) =>
              ex.scheduleId === s.id &&
              this.getLocalDateString(ex.originalDate, timezone) === localDateStr,
          );

          if (matchingException) {
            // Cancelled or Rescheduled original occurrence is suppressed
            continue;
          }

          // Otherwise, regular occurrence is valid
          propertyOccurrences.push({
            propertyId: property.id,
            propertyName: property.address,
            areaId: property.areaId,
            areaName: property.area.name,
            wasteType: s.wasteType,
            collectionDate: localDateStr,
            startTime: s.startTime,
            endTime: s.endTime,
            source: 'REGULAR',
            scheduleId: s.id,
          });
        }

        // Add special collections active on this day
        const specials = exceptions.filter(
          (ex) =>
            ex.type === ExceptionType.SPECIAL_COLLECTION &&
            this.getLocalDateString(ex.originalDate, timezone) === localDateStr,
        );

        for (const ex of specials) {
          propertyOccurrences.push({
            propertyId: property.id,
            propertyName: property.address,
            areaId: property.areaId,
            areaName: property.area.name,
            wasteType: ex.wasteType || BinType.OTHER,
            collectionDate: localDateStr,
            startTime: ex.replacementStartTime!,
            endTime: ex.replacementEndTime!,
            source: 'SPECIAL',
            exceptionId: ex.id,
            changeReason: ex.reason,
          });
        }

        // Add rescheduled replacements occurring on this day
        const reschedules = exceptions.filter(
          (ex) =>
            ex.type === ExceptionType.RESCHEDULED &&
            ex.replacementDate &&
            this.getLocalDateString(ex.replacementDate, timezone) === localDateStr,
        );

        for (const ex of reschedules) {
          propertyOccurrences.push({
            propertyId: property.id,
            propertyName: property.address,
            areaId: property.areaId,
            areaName: property.area.name,
            wasteType: ex.schedule?.wasteType || ex.wasteType || BinType.OTHER,
            collectionDate: localDateStr,
            startTime: ex.replacementStartTime!,
            endTime: ex.replacementEndTime!,
            source: 'RESCHEDULED',
            scheduleId: ex.scheduleId || undefined,
            exceptionId: ex.id,
            changeReason: ex.reason,
          });
        }

        // Move to next day
        current.setDate(current.getDate() + 1);
      }

      // Sort occurrences chronologically
      propertyOccurrences.sort((a, b) => {
        const dateCompare = a.collectionDate.localeCompare(b.collectionDate);
        if (dateCompare !== 0) return dateCompare;
        return a.startTime.localeCompare(b.startTime);
      });

      results.push({
        propertyId: property.id,
        address: property.address,
        areaId: property.areaId,
        areaName: property.area.name,
        occurrences: propertyOccurrences,
      });
    }

    return results;
  }

  // Timezone helper: format Date to local date YYYY-MM-DD
  getLocalDateString(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  // Timezone helper: extract local DayOfWeek
  getLocalDayOfWeek(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });
    return formatter.format(date).toUpperCase();
  }
}
