import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import { BinStateService } from '../bins/bin-state.service';
import { CreateResponsibilityDto } from './dto/create-responsibility.dto';
import { GenerateAssignmentsDto } from './dto/generate-assignments.dto';
import {
  VerifyBinDto,
  CollectTargetDto,
  MissTargetDto,
  SkipTargetDto,
  CorrectTargetDto,
} from './dto/execution.dto';
import {
  BinType,
  DayOfWeek,
  ScheduleStatus,
  ExceptionType,
  WorkerEmploymentStatus,
  WorkerShiftStatus,
  AssignmentStatus,
  GenerationSource,
  TargetStatus,
  AddedReason,
  TeamServiceAssignmentStatus,
  CollectionEventType,
  CollectionVerification,
  CollectionEvidence,
  UserRole,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { realtimeEventEmitter } from '../realtime/realtime.event-emitter';

export interface CoverageWarning {
  type: 'UNASSIGNED_SERVICE_ZONE' | 'INACTIVE_TEAM' | 'NO_ACTIVE_WORKERS' | 'NO_VALID_SHIFT' | 'ZONE_NO_COLLECTION_POINTS' | 'COLLECTION_POINT_NO_ZONE';
  areaName: string;
  zoneName?: string;
  teamName?: string;
  wasteType?: BinType;
  details: string;
}

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private binStateService: BinStateService,
  ) {}

  // Resolve Timezone date helper
  private getLocalDateString(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  // Resolve Timezone Day of Week helper
  private getLocalDayOfWeek(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });
    return formatter.format(date).toUpperCase();
  }

  async createResponsibility(dto: CreateResponsibilityDto, adminId: string, ip?: string, ua?: string) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;

    if (effectiveUntil && effectiveFrom >= effectiveUntil) {
      throw new BadRequestException('Effective from date must be before effective until date.');
    }

    // Assert team and zone exist
    const team = await this.prisma.collectionTeam.findUnique({ where: { id: dto.teamId } });
    if (!team) throw new NotFoundException('Collection team not found.');

    const zone = await this.prisma.serviceZone.findUnique({ where: { id: dto.serviceZoneId } });
    if (!zone) throw new NotFoundException('Service zone not found.');

    // Overlap validation: same zone, same wasteType (or null/any), overlapping effective dates
    const existing = await this.prisma.teamServiceAssignment.findMany({
      where: {
        serviceZoneId: dto.serviceZoneId,
        status: TeamServiceAssignmentStatus.ACTIVE,
      },
    });

    for (const r of existing) {
      // Check waste type overlap
      const typeOverlap = !dto.wasteType || !r.wasteType || dto.wasteType === r.wasteType;
      if (!typeOverlap) continue;

      const rFrom = new Date(r.effectiveFrom).getTime();
      const rUntil = r.effectiveUntil ? new Date(r.effectiveUntil).getTime() : Infinity;

      const currentFrom = effectiveFrom.getTime();
      const currentUntil = effectiveUntil ? effectiveUntil.getTime() : Infinity;

      const dateOverlap = currentFrom < rUntil && rFrom < currentUntil;
      if (dateOverlap) {
        throw new ConflictException(
          `Conflict: Team service responsibility already exists for this zone/waste-type during this period.`,
        );
      }
    }

    const assignment = await this.prisma.teamServiceAssignment.create({
      data: {
        teamId: dto.teamId,
        serviceZoneId: dto.serviceZoneId,
        wasteType: dto.wasteType || null,
        effectiveFrom,
        effectiveUntil,
      },
    });

    await this.auditService.log(adminId, 'TEAM_RESPONSIBILITY_ASSIGNED', ip, ua, {
      responsibilityId: assignment.id,
      teamId: dto.teamId,
      zoneId: dto.serviceZoneId,
    });

    return assignment;
  }

  async listResponsibilities() {
    return this.prisma.teamServiceAssignment.findMany({
      include: {
        team: true,
        serviceZone: {
          include: {
            area: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // CORE ALGORITHM: Assignment Generation Engine
  async generateDailyAssignments(dto: GenerateAssignmentsDto, adminId: string, source: GenerationSource, ip?: string, ua?: string) {
    const targetDate = new Date(dto.date);
    const warnings: CoverageWarning[] = [];
    const createdAssignments = [];

    // Step 1: Resolve all Areas and their timezones
    const areas = await this.prisma.area.findMany({
      include: {
        ward: {
          include: {
            city: true,
          },
        },
      },
    });

    // Validate if any collection points don't have service zones assigned
    const unassignedCollectionPoints = await this.prisma.collectionPoint.findMany({
      where: {
        status: 'ACTIVE',
        serviceZoneId: null,
      },
      include: { area: true },
    });
    for (const cp of unassignedCollectionPoints) {
      warnings.push({
        type: 'COLLECTION_POINT_NO_ZONE',
        areaName: cp.area.name,
        details: `Collection point "${cp.name}" has no service zone assignment. It will not be collected.`,
      });
    }

    for (const area of areas) {
      const timezone = area.ward.city.timezone || 'Asia/Kolkata';
      const localDateStr = this.getLocalDateString(targetDate, timezone);
      const localDayOfWeek = this.getLocalDayOfWeek(targetDate, timezone) as DayOfWeek;

      // Query active recurring schedules for area
      const schedules = await this.prisma.collectionSchedule.findMany({
        where: {
          areaId: area.id,
          status: ScheduleStatus.ACTIVE,
          effectiveFrom: { lte: targetDate },
        },
      });

      // Query exceptions active for area on this date
      const exceptions = await this.prisma.scheduleException.findMany({
        where: {
          areaId: area.id,
          OR: [
            { originalDate: { gte: new Date(localDateStr + 'T00:00:00Z'), lte: new Date(localDateStr + 'T23:59:59Z') } },
            { replacementDate: { gte: new Date(localDateStr + 'T00:00:00Z'), lte: new Date(localDateStr + 'T23:59:59Z') } },
          ],
        },
        include: { schedule: true },
      });

      // Resolve scheduling occurrences for this Area on target date
      const occurrences: Array<{
        wasteType: BinType;
        startTime: string;
        endTime: string;
        scheduleId?: string;
        exceptionId?: string;
      }> = [];

      // Regular recurring schedules check
      for (const s of schedules) {
        if (s.dayOfWeek !== localDayOfWeek) continue;
        if (s.effectiveUntil && targetDate > s.effectiveUntil) continue;

        // Check if cancelled or rescheduled
        const matchingException = exceptions.find(
          (ex) =>
            ex.scheduleId === s.id &&
            this.getLocalDateString(ex.originalDate, timezone) === localDateStr,
        );

        if (matchingException) {
          // Suppress cancelled or rescheduled original occurrences
          continue;
        }

        occurrences.push({
          wasteType: s.wasteType,
          startTime: s.startTime,
          endTime: s.endTime,
          scheduleId: s.id,
        });
      }

      // Add rescheduled occurrences that replace on this day
      const reschedules = exceptions.filter(
        (ex) =>
          ex.type === ExceptionType.RESCHEDULED &&
          ex.replacementDate &&
          this.getLocalDateString(ex.replacementDate, timezone) === localDateStr,
      );
      for (const ex of reschedules) {
        occurrences.push({
          wasteType: ex.schedule?.wasteType || ex.wasteType || BinType.OTHER,
          startTime: ex.replacementStartTime!,
          endTime: ex.replacementEndTime!,
          scheduleId: ex.scheduleId || undefined,
          exceptionId: ex.id,
        });
      }

      // Add special collections
      const specials = exceptions.filter(
        (ex) =>
          ex.type === ExceptionType.SPECIAL_COLLECTION &&
          this.getLocalDateString(ex.originalDate, timezone) === localDateStr,
      );
      for (const ex of specials) {
        occurrences.push({
          wasteType: ex.wasteType || BinType.OTHER,
          startTime: ex.replacementStartTime!,
          endTime: ex.replacementEndTime!,
          exceptionId: ex.id,
        });
      }

      // For each resolved occurrence, build assignments
      for (const occ of occurrences) {
        // Find active service zones in this Area
        const serviceZones = await this.prisma.serviceZone.findMany({
          where: { areaId: area.id, status: 'ACTIVE' },
        });

        if (serviceZones.length === 0) {
          warnings.push({
            type: 'ZONE_NO_COLLECTION_POINTS',
            areaName: area.name,
            wasteType: occ.wasteType,
            details: `Area ${area.name} has a scheduled ${occ.wasteType} collection, but no active service zones exist.`,
          });
          continue;
        }

        // Find active shifts to cover this schedule occurrence time window
        const shifts = await this.prisma.shift.findMany({ where: { status: 'ACTIVE' } });
        let matchedShift = shifts.find((sh) => sh.startTime <= occ.startTime && sh.endTime >= occ.endTime);
        if (!matchedShift) {
          // If no shift perfectly covers it, fall back to first active shift
          matchedShift = shifts[0];
        }

        if (!matchedShift) {
          // If no active shifts exist at all, throw fatal error
          throw new BadRequestException('No active Shift definitions found in the system.');
        }

        for (const zone of serviceZones) {
          // Check if zone has collection points
          const cpCount = await this.prisma.collectionPoint.count({
            where: { serviceZoneId: zone.id, status: 'ACTIVE' },
          });
          if (cpCount === 0) {
            warnings.push({
              type: 'ZONE_NO_COLLECTION_POINTS',
              areaName: area.name,
              zoneName: zone.name,
              details: `Service zone "${zone.name}" has no active collection points.`,
            });
            continue;
          }

          // Find active TeamServiceAssignment responsible for zone & waste type
          const responsibility = await this.prisma.teamServiceAssignment.findFirst({
            where: {
              serviceZoneId: zone.id,
              status: TeamServiceAssignmentStatus.ACTIVE,
              effectiveFrom: { lte: targetDate },
              AND: [
                {
                  OR: [
                    { wasteType: occ.wasteType },
                    { wasteType: null },
                  ],
                },
                {
                  OR: [
                    { effectiveUntil: null },
                    { effectiveUntil: { gte: targetDate } },
                  ],
                },
              ],
            },
            include: { team: true },
          });

          if (!responsibility) {
            warnings.push({
              type: 'UNASSIGNED_SERVICE_ZONE',
              areaName: area.name,
              zoneName: zone.name,
              wasteType: occ.wasteType,
              details: `No team is assigned to service zone "${zone.name}" for ${occ.wasteType} collections.`,
            });
            continue;
          }

          const team = responsibility.team;

          // Validate Team Status
          if (team.status === 'INACTIVE') {
            warnings.push({
              type: 'INACTIVE_TEAM',
              areaName: area.name,
              zoneName: zone.name,
              teamName: team.name,
              details: `Team "${team.name}" responsible for zone "${zone.name}" is INACTIVE.`,
            });
            continue;
          }

          // Get active members of the team
          const activeMemberships = await this.prisma.teamMembership.findMany({
            where: {
              teamId: team.id,
              effectiveFrom: { lte: targetDate },
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gte: targetDate } },
              ],
            },
            include: {
              worker: true,
            },
          });

          const activeWorkers = activeMemberships.filter(
            (m) => m.worker.employmentStatus === WorkerEmploymentStatus.ACTIVE,
          );

          if (activeWorkers.length === 0) {
            warnings.push({
              type: 'NO_ACTIVE_WORKERS',
              areaName: area.name,
              zoneName: zone.name,
              teamName: team.name,
              details: `Team "${team.name}" assigned to zone "${zone.name}" has no active workers.`,
            });
          } else {
            // Check shift assignments for active team workers
            const workerIds = activeWorkers.map((w) => w.worker.id);
            const shiftAssignments = await this.prisma.workerShiftAssignment.findMany({
              where: {
                workerId: { in: workerIds },
                shiftId: matchedShift.id,
                workDate: {
                  gte: new Date(localDateStr + 'T00:00:00Z'),
                  lte: new Date(localDateStr + 'T23:59:59Z'),
                },
                status: { in: [WorkerShiftStatus.ASSIGNED, WorkerShiftStatus.CONFIRMED] },
              },
            });

            if (shiftAssignments.length === 0) {
              warnings.push({
                type: 'NO_VALID_SHIFT',
                areaName: area.name,
                zoneName: zone.name,
                teamName: team.name,
                details: `None of the active workers in Team "${team.name}" are assigned to "${matchedShift.name}" on this date.`,
              });
            }
          }

          // Fetch eligible bins (property VERIFIED, collectionPoint ACTIVE, bin type matches)
          const eligibleBins = await this.prisma.bin.findMany({
            where: {
              type: occ.wasteType,
              collectionPoint: {
                areaId: area.id,
                serviceZoneId: zone.id,
                status: 'ACTIVE',
                property: {
                  status: 'VERIFIED',
                },
              },
            },
            include: {
              collectionPoint: true,
              alerts: {
                where: { status: 'ACTIVE' },
              },
            },
          });

          if (eligibleBins.length === 0) {
            // No bins to collect, skip daily assignment creation
            continue;
          }

          // Transaction: Create assignment and target snapshots idempotently
          const assignment = await this.prisma.$transaction(async (tx) => {
            // Idempotent find or create daily assignment
            // Composite unique index: [assignmentDate, teamId, serviceZoneId, shiftId, wasteType]
            // Note: Date time values are normalized to target date midnight
            const assignmentDate = new Date(localDateStr + 'T00:00:00Z');

            let dailyAssign = await tx.dailyAssignment.findUnique({
              where: {
                assignmentDate_teamId_serviceZoneId_shiftId_wasteType: {
                  assignmentDate,
                  teamId: team.id,
                  serviceZoneId: zone.id,
                  shiftId: matchedShift!.id,
                  wasteType: occ.wasteType,
                },
              },
            });

            if (!dailyAssign) {
              dailyAssign = await tx.dailyAssignment.create({
                data: {
                  assignmentDate,
                  teamId: team.id,
                  serviceZoneId: zone.id,
                  areaId: area.id,
                  scheduleId: occ.scheduleId || null,
                  scheduleExceptionId: occ.exceptionId || null,
                  wasteType: occ.wasteType,
                  shiftId: matchedShift!.id,
                  status: AssignmentStatus.CREATED,
                  generationSource: source,
                  generatedAt: new Date(),
                },
              });
            }

            // Create targets snapshot idempotently
            for (const bin of eligibleBins) {
              const existingTarget = await tx.dailyAssignmentTarget.findUnique({
                where: {
                  assignmentId_collectionPointId_binId: {
                    assignmentId: dailyAssign.id,
                    collectionPointId: bin.collectionPointId,
                    binId: bin.id,
                  },
                },
              });

              if (!existingTarget) {
                await tx.dailyAssignmentTarget.create({
                  data: {
                    assignmentId: dailyAssign.id,
                    collectionPointId: bin.collectionPointId,
                    binId: bin.id,
                    status: TargetStatus.PENDING,
                    addedReason: AddedReason.SCHEDULED,
                  },
                });
              }
            }

            return tx.dailyAssignment.findUnique({
              where: { id: dailyAssign.id },
              include: {
                team: true,
                serviceZone: true,
                shift: true,
                targets: true,
              },
            });
          });

          createdAssignments.push(assignment);
        }
      }
    }

    // Log audit for manual generation
    if (source === GenerationSource.MANUAL) {
      await this.auditService.log(adminId, 'MANUAL_ASSIGNMENT_GENERATION', ip, ua, {
        date: targetDate.toISOString(),
        assignmentsCount: createdAssignments.length,
        warningsCount: warnings.length,
      });
    }

    return {
      assignments: createdAssignments,
      warnings,
    };
  }

  // GET Daily Assignments lists with details
  async getAssignmentsList(date?: string) {
    const filterDate = date ? new Date(date) : undefined;
    if (filterDate) {
      filterDate.setUTCHours(0, 0, 0, 0);
    }

    const assignments = await this.prisma.dailyAssignment.findMany({
      where: filterDate ? { assignmentDate: filterDate } : undefined,
      include: {
        team: {
          include: {
            supervisor: { select: { email: true } },
          },
        },
        primaryWorker: { include: { user: true } },
        partnerWorker: { include: { user: true } },
        driver: { include: { user: true } },
        serviceZone: {
          include: { area: true },
        },
        shift: true,
        targets: {
          include: {
            bin: {
              include: {
                alerts: { where: { status: 'ACTIVE' } },
              },
            },
            collectionPoint: true,
          },
        },
      },
      orderBy: { assignmentDate: 'desc' },
    });

    // Derive priority indicators for targets and format response
    return assignments.map((assign) => {
      const formattedTargets = assign.targets.map((tgt) => {
        let derivedPriority = 'NORMAL';
        const hasCriticalAlert = tgt.bin.alerts.some((a) => a.severity === 'CRITICAL');
        const hasWarningAlert = tgt.bin.alerts.some((a) => a.severity === 'WARNING');

        if (hasCriticalAlert || tgt.bin.currentFillLevel >= 90) {
          derivedPriority = 'CRITICAL';
        } else if (hasWarningAlert || tgt.bin.currentFillLevel >= 70) {
          derivedPriority = 'HIGH';
        }

        return {
          id: tgt.id,
          collectionPointId: tgt.collectionPointId,
          collectionPointName: tgt.collectionPoint.name,
          binId: tgt.binId,
          binType: tgt.bin.type,
          binFillLevel: tgt.bin.currentFillLevel,
          status: tgt.status,
          addedReason: tgt.addedReason,
          priority: derivedPriority,
          createdAt: tgt.createdAt,
        };
      });

      const newCps = formattedTargets.filter((t) => t.addedReason === AddedReason.NEW_COLLECTION_POINT).length;
      const criticalCount = formattedTargets.filter((t) => t.priority === 'CRITICAL').length;
      const highCount = formattedTargets.filter((t) => t.priority === 'HIGH').length;

      return {
        id: assign.id,
        assignmentDate: assign.assignmentDate,
        teamName: assign.team.name,
        teamCode: assign.team.code,
        supervisorEmail: assign.team.supervisor?.email || null,
        zoneName: assign.serviceZone.name,
        zoneCode: assign.serviceZone.code,
        areaName: assign.serviceZone.area.name,
        shiftName: assign.shift.name,
        shiftTimes: `${assign.shift.startTime}-${assign.shift.endTime}`,
        wasteType: assign.wasteType,
        status: assign.status,
        generationSource: assign.generationSource,
        generatedAt: assign.generatedAt,
        createdAt: assign.createdAt,
        updatedAt: assign.updatedAt,
        targetsCount: formattedTargets.length,
        newCollectionPointsCount: newCps,
        criticalBinsCount: criticalCount,
        highPriorityBinsCount: highCount,
        targets: formattedTargets,
      };
    });
  }

  // GET Assignments for a Worker Dashboard — enriched with vehicle/driver/partner/bin telemetry
  // Shows a rolling window: 7 days past + 14 days future so upcoming and history are always visible
  async getWorkerTodayAssignments(userId: string) {
    const now = new Date();

    // Find worker profile
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true, phone: true } } },
    });
    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found.');
    }

    // Find worker's current active team membership
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        workerId: workerProfile.id,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
      },
    });

    // Rolling 21-day window: 7 days back, 14 days forward
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 14);
    windowEnd.setHours(23, 59, 59, 999);

    // Get assignments for this worker (via team or direct assignment)
    const assignments = await this.prisma.dailyAssignment.findMany({
      where: {
        OR: [
          ...(membership ? [{ teamId: membership.teamId }] : []),
          { primaryWorkerId: workerProfile.id },
          { partnerWorkerId: workerProfile.id },
          { driverId: workerProfile.id },
        ],
        assignmentDate: { gte: windowStart, lte: windowEnd },
        status: { not: AssignmentStatus.CANCELLED },
      },
      include: {
        team: {
          include: {
            supervisor: { select: { name: true, email: true, phone: true } },
            memberships: {
              where: {
                effectiveFrom: { lte: now },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
              },
              include: {
                worker: {
                  include: { user: { select: { name: true, phone: true } } },
                },
              },
            },
          },
        },
        serviceZone: {
          include: {
            area: {
              include: {
                ward: { include: { city: true } },
              },
            },
          },
        },
        shift: true,
        area: true,
        vehicle: true,
        driver: { include: { user: { select: { name: true, phone: true } } } },
        primaryWorker: { include: { user: { select: { name: true, phone: true } } } },
        partnerWorker: { include: { user: { select: { name: true, phone: true } } } },
        targets: {
          include: {
            bin: {
              include: {
                alerts: { where: { status: 'ACTIVE' } },
                telemetries: {
                  orderBy: { recordedAt: 'desc' },
                  take: 1,
                },
              },
            },
            collectionPoint: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { assignmentDate: 'desc' },
    });

    // Return all assignments (frontend will categorize into Today, Upcoming, Completed)
    return assignments.map((assign) => {
      // Build partner workers list (all team members except the current worker)
      let partnerWorkers = [];
      if (assign.team?.memberships) {
        partnerWorkers = assign.team.memberships
          .filter((m) => m.workerId !== workerProfile.id)
          .map((m) => ({
            name: m.worker.user.name,
            phone: m.worker.user.phone,
            employeeCode: m.worker.employeeCode,
            role: m.role,
          }));
      } else {
        if (assign.primaryWorker && assign.primaryWorker.id !== workerProfile.id) {
          partnerWorkers.push({ name: assign.primaryWorker.user.name, phone: assign.primaryWorker.user.phone, employeeCode: assign.primaryWorker.employeeCode, role: 'PRIMARY' });
        }
        if (assign.partnerWorker && assign.partnerWorker.id !== workerProfile.id) {
          partnerWorkers.push({ name: assign.partnerWorker.user.name, phone: assign.partnerWorker.user.phone, employeeCode: assign.partnerWorker.employeeCode, role: 'PARTNER' });
        }
        if (assign.driver && assign.driver.id !== workerProfile.id) {
          partnerWorkers.push({ name: assign.driver.user.name, phone: assign.driver.user.phone, employeeCode: assign.driver.employeeCode, role: 'DRIVER' });
        }
      }

      // Format targets with full bin telemetry
      const formattedTargets = assign.targets.map((tgt) => {
        const latestTelemetry = tgt.bin.telemetries[0];
        const hasCriticalAlert = tgt.bin.alerts.some((a) => a.severity === 'CRITICAL');
        const hasWarningAlert = tgt.bin.alerts.some((a) => a.severity === 'WARNING');

        let derivedPriority = 'NORMAL';
        if (hasCriticalAlert || tgt.bin.currentFillLevel >= 90) derivedPriority = 'CRITICAL';
        else if (hasWarningAlert || tgt.bin.currentFillLevel >= 70) derivedPriority = 'HIGH';

        return {
          id: tgt.id,
          collectionPointId: tgt.collectionPointId,
          collectionPointName: tgt.collectionPoint.name,
          collectionPointLat: tgt.collectionPoint.latitude,
          collectionPointLng: tgt.collectionPoint.longitude,
          binId: tgt.binId,
          binQrCodeId: tgt.bin.qrCodeId,
          binType: tgt.bin.type,
          binFillLevel: tgt.bin.currentFillLevel,
          binStatus: tgt.bin.status,
          binCondition: tgt.bin.condition,
          binTelemetryStatus: tgt.bin.telemetryStatus,
          batteryLevel: latestTelemetry?.batteryLevel ?? null,
          temperature: latestTelemetry?.temperature ?? null,
          signalStrength: latestTelemetry?.signalStrength ?? null,
          lastTelemetryAt: latestTelemetry?.recordedAt ?? null,
          status: tgt.status,
          addedReason: tgt.addedReason,
          priority: derivedPriority,
          collectedAt: tgt.collectedAt,
          createdAt: tgt.createdAt,
        };
      });

      const totalTargets = formattedTargets.length;
      const collected = formattedTargets.filter((t) => t.status === 'COLLECTED').length;
      const missed = formattedTargets.filter((t) => t.status === 'MISSED').length;
      const skipped = formattedTargets.filter((t) => t.status === 'SKIPPED').length;
      const pending = formattedTargets.filter((t) => t.status === 'PENDING').length;
      const completionRate = totalTargets > 0 ? Math.round((collected / totalTargets) * 100) : 0;

      return {
        id: assign.id,
        assignmentDate: assign.assignmentDate,
        startedAt: assign.startedAt,
        completedAt: assign.completedAt,
        teamName: assign.team?.name || 'Manual Assignment',
        teamCode: assign.team?.code || 'MANUAL',
        supervisorName: assign.team?.supervisor?.name ?? null,
        supervisorEmail: assign.team?.supervisor?.email ?? null,
        supervisorPhone: assign.team?.supervisor?.phone ?? null,
        zoneName: assign.serviceZone.name,
        zoneCode: assign.serviceZone.code,
        areaName: assign.serviceZone.area.name,
        wardName: assign.serviceZone.area.ward.name,
        wardNumber: assign.serviceZone.area.ward.number,
        cityName: assign.serviceZone.area.ward.city.name,
        shiftName: assign.shift.name,
        shiftStartTime: assign.shift.startTime,
        shiftEndTime: assign.shift.endTime,
        shiftTimes: `${assign.shift.startTime}–${assign.shift.endTime}`,
        wasteType: assign.wasteType,
        status: assign.status,
        // Vehicle & Driver (prefer direct assignment, fallback to route assignment if any)
        vehicle: assign.vehicle 
          ? {
              id: assign.vehicle.id,
              registrationNumber: assign.vehicle.registrationNumber,
              vehicleCode: assign.vehicle.vehicleCode,
              vehicleType: assign.vehicle.vehicleType,
              manufacturer: assign.vehicle.manufacturer,
              model: assign.vehicle.model,
              year: assign.vehicle.year,
              capacityKg: assign.vehicle.capacityKg,
              fuelType: assign.vehicle.fuelType,
              currentFuelLevel: assign.vehicle.currentFuelLevel,
              status: assign.vehicle.status,
            }
          : null,
        driver: assign.driver
          ? {
              name: assign.driver.user.name,
              phone: assign.driver.user.phone,
            }
          : null,
        partnerWorkers,
        // Route removed
        route: null,
        targets: formattedTargets,
        // Stats
        expected: totalTargets,
        collected,
        missed,
        skipped,
        pending,
        completionRate,
        generationSource: assign.generationSource,
        createdAt: assign.createdAt,
        updatedAt: assign.updatedAt,
      };
    });
  }

  // Worker: get 7-day weekly schedule view
  async getWorkerWeeklySchedule(userId: string) {
    const workerProfile = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!workerProfile) throw new NotFoundException('Worker profile not found.');

    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        workerId: workerProfile.id,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }],
      },
    });
    if (!membership) return [];

    // Get last 7 days + next 7 days of assignments for this team
    const start = new Date();
    start.setDate(start.getDate() - 3);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 7);

    const assignments = await this.prisma.dailyAssignment.findMany({
      where: {
        teamId: membership.teamId,
        assignmentDate: { gte: start, lte: end },
      },
      include: {
        serviceZone: { include: { area: { include: { ward: true } } } },
        shift: true,
      },
      orderBy: { assignmentDate: 'asc' },
    });

    // Also get schedules for the area
    const schedules = await this.prisma.collectionSchedule.findMany({
      where: {
        areaId: { in: assignments.map((a) => a.areaId) },
        status: 'ACTIVE',
      },
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const wasteTypeSchedule: Record<string, string> = {
      SUNDAY: 'OTHER (Special Collection)',
      MONDAY: 'WET (Organic Waste)',
      TUESDAY: 'DRY (Dry Waste)',
      WEDNESDAY: 'RECYCLABLES (Recycling Day)',
      THURSDAY: 'DRY (Dry Waste)',
      FRIDAY: 'WET (Organic Waste)',
      SATURDAY: 'BULK (Bulk Waste)',
    };

    return assignments.map((a) => {
      const d = new Date(a.assignmentDate);
      const dayName = dayNames[d.getDay()];
      const todayStr = this.getLocalDateString(new Date(), 'Asia/Kolkata');
      const assignStr = this.getLocalDateString(d, 'Asia/Kolkata');
      return {
        assignmentId: a.id,
        date: a.assignmentDate,
        dayName,
        isToday: assignStr === todayStr,
        isPast: d < new Date(),
        wasteType: a.wasteType,
        scheduledWaste: wasteTypeSchedule[dayName.toUpperCase()] ?? a.wasteType,
        areaName: a.serviceZone.area.name,
        wardName: a.serviceZone.area.ward.name,
        shiftName: a.shift.name,
        shiftTimes: `${a.shift.startTime}–${a.shift.endTime}`,
        status: a.status,
      };
    });
  }

  // Worker: get daily work summary
  async getWorkerDailySummary(userId: string, date?: string) {
    const workerProfile = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!workerProfile) throw new NotFoundException('Worker profile not found.');

    const targetDate = date ? new Date(date) : new Date();
    const dateStr = this.getLocalDateString(targetDate, 'Asia/Kolkata');

    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        workerId: workerProfile.id,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }],
      },
    });
    if (!membership) return null;

    const assignments = await this.prisma.dailyAssignment.findMany({
      where: { teamId: membership.teamId },
      include: {
        targets: {
          include: {
            bin: true,
            collectionPoint: true,
          },
        },
        shift: true,
        serviceZone: { include: { area: true } },
      },
    });

    const todayAssignments = assignments.filter(
      (a) => this.getLocalDateString(a.assignmentDate, 'Asia/Kolkata') === dateStr,
    );

    const allTargets = todayAssignments.flatMap((a) => a.targets);
    const totalBins = allTargets.length;
    const collected = allTargets.filter((t) => t.status === 'COLLECTED').length;
    const missed = allTargets.filter((t) => t.status === 'MISSED').length;
    const skipped = allTargets.filter((t) => t.status === 'SKIPPED').length;

    const areasCovered = [...new Set(todayAssignments.map((a) => a.serviceZone.area.name))];

    // Estimate hours worked from startedAt / completedAt
    let hoursWorked = 0;
    for (const a of todayAssignments) {
      if (a.startedAt && a.completedAt) {
        hoursWorked += (a.completedAt.getTime() - a.startedAt.getTime()) / 3600000;
      } else if (a.startedAt) {
        hoursWorked += (Date.now() - a.startedAt.getTime()) / 3600000;
      }
    }

    // Estimate distance (4.8 km per area average)
    const estimatedDistanceKm = areasCovered.length * 4.8;

    return {
      date: dateStr,
      areasCovered,
      totalBins,
      collected,
      missed,
      skipped,
      completionRate: totalBins > 0 ? Math.round((collected / totalBins) * 100) : 0,
      hoursWorked: Math.round(hoursWorked * 10) / 10,
      estimatedDistanceKm,
      wasteTypes: [...new Set(todayAssignments.map((a) => a.wasteType))],
      shiftName: todayAssignments[0]?.shift.name ?? null,
    };
  }

  // Worker: get notifications
  async getWorkerNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Worker: mark notification as read
  async markNotificationRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found.');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  // Worker: mark all notifications as read
  async markAllNotificationsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }



  // CONTROLLED NEW-PROPERTY TRANSITION HOOK
  async handleNewPropertyVerification(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        area: {
          include: {
            ward: {
              include: { city: true },
            },
          },
        },
        collectionPoints: {
          where: { status: 'ACTIVE' },
          include: {
            bins: {
              include: { alerts: { where: { status: 'ACTIVE' } } },
            },
          },
        },
      },
    });

    if (!property || property.status !== 'VERIFIED') return;

    const timezone = property.area.ward.city.timezone || 'Asia/Kolkata';
    const nowLocal = new Date(); // Current local/UTC time
    const todayStr = this.getLocalDateString(nowLocal, timezone);
    const todayMidnight = new Date(todayStr + 'T00:00:00Z');

    for (const cp of property.collectionPoints) {
      if (!cp.serviceZoneId) continue; // Skip if not assigned to service zone

      // Find active assignments for today for this service zone
      const assignments = await this.prisma.dailyAssignment.findMany({
        where: {
          serviceZoneId: cp.serviceZoneId,
          assignmentDate: todayMidnight,
        },
        include: { shift: true },
      });

      for (const assign of assignments) {
        // Evaluate cutoff policy: startTime minus cutoffMinutes
        const shift = assign.shift;
        const [shHour, shMin] = shift.startTime.split(':').map(Number);
        
        // Build shift start time Date on today
        const cutoffLimitDate = new Date(todayStr + `T${shift.startTime}:00Z`);
        // Subtract cutoffMinutes
        cutoffLimitDate.setUTCMinutes(cutoffLimitDate.getUTCMinutes() - shift.cutoffMinutes);

        // Check if current time is before cutoff limit
        if (nowLocal.getTime() < cutoffLimitDate.getTime()) {
          // Get eligible bins matching the assignment waste type
          const matchingBins = cp.bins.filter((b) => b.type === assign.wasteType);

          for (const bin of matchingBins) {
            // Check if already in snapshot
            const existingTarget = await this.prisma.dailyAssignmentTarget.findUnique({
              where: {
                assignmentId_collectionPointId_binId: {
                  assignmentId: assign.id,
                  collectionPointId: cp.id,
                  binId: bin.id,
                },
              },
            });

            if (!existingTarget) {
              await this.prisma.$transaction(async (tx) => {
                await tx.dailyAssignmentTarget.create({
                  data: {
                    assignmentId: assign.id,
                    collectionPointId: cp.id,
                    binId: bin.id,
                    status: TargetStatus.PENDING,
                    addedReason: AddedReason.NEW_COLLECTION_POINT,
                  },
                });

                await this.auditService.log(null, 'NEW_HOME_ASSIGNMENT_TARGET_ADDED', undefined, undefined, {
                  assignmentId: assign.id,
                  propertyId,
                  collectionPointId: cp.id,
                  binId: bin.id,
                  reason: 'Before shift cutoff. Added to active snapshot.',
                });
              });
            }
          }
        }
      }
    }
  }

  // ─── Phase 6 Execution Helper: GPS Haversine Distance ──────────────────────
  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // In meters
  }

  private async notifyCitizenForTarget(targetId: string, status: string) {
    try {
      const target = await this.prisma.dailyAssignmentTarget.findUnique({
        where: { id: targetId },
        include: {
          collectionPoint: {
            include: {
              property: true,
            },
          },
        },
      });

      const property = target?.collectionPoint?.property;
      if (property?.ownerId) {
        const title = `Bin Collection ${status}`;
        const body = `Waste collection for your property at ${property.address} has been recorded as ${status.toLowerCase()}.`;

        await this.prisma.notification.create({
          data: {
            userId: property.ownerId,
            title,
            body,
            type: 'INFO',
          },
        });

        realtimeEventEmitter.emit('notification', {
          userId: property.ownerId,
          title,
          body,
          type: 'INFO',
        });
        realtimeEventEmitter.emit('collectionCompleted', {
          targetId,
          propertyId: property.id,
          status,
        });
      }
    } catch (e) {
      this.logger.error(`Error notifying citizen for target ${targetId}:`, e);
    }
  }

  // ─── Start Assignment Workflow ──────────────────────────────────────────────
  async startAssignment(assignmentId: string, userId: string, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      include: { team: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    if (assignment.status === AssignmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot start a cancelled assignment.');
    }

    if (assignment.status === AssignmentStatus.IN_PROGRESS) {
      // Idempotency: already started
      return assignment;
    }

    if (
      assignment.status !== AssignmentStatus.ASSIGNED &&
      assignment.status !== AssignmentStatus.CREATED &&
      assignment.status !== AssignmentStatus.ACCEPTED
    ) {
      throw new BadRequestException(`Cannot start assignment in status: ${assignment.status}`);
    }

    // Resolve worker profile
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found.');
    }

    // Authorization check: worker must be directly assigned OR a member of the team
    const isDirectlyAssigned =
      assignment.primaryWorkerId === workerProfile.id ||
      assignment.partnerWorkerId === workerProfile.id ||
      assignment.driverId === workerProfile.id;

    if (!isDirectlyAssigned) {
      // Check team membership authorization
      if (!assignment.teamId) {
        throw new ForbiddenException('Worker is not authorized for this assignment.');
      }
      const membership = await this.prisma.teamMembership.findFirst({
        where: {
          workerId: workerProfile.id,
          teamId: assignment.teamId,
          effectiveFrom: { lte: assignment.assignmentDate },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: assignment.assignmentDate } },
          ],
        },
      });
      if (!membership) {
        throw new ForbiddenException('Worker is not authorized for this assignment.');
      }
    }

    // Validate operational date: today's date in local time
    const todayStr = this.getLocalDateString(new Date(), 'Asia/Kolkata');
    const assignDateStr = this.getLocalDateString(assignment.assignmentDate, 'Asia/Kolkata');
    if (todayStr !== assignDateStr) {
      throw new BadRequestException('Assignment date is not operationally valid for today.');
    }

    // Shift eligibility: only required for team-based (auto-generated) assignments.
    // Manual planner assignments with direct worker IDs bypass this check.
    if (assignment.generationSource !== 'MANUAL' || assignment.teamId) {
      const shiftAssignment = await this.prisma.workerShiftAssignment.findFirst({
        where: {
          workerId: workerProfile.id,
          shiftId: assignment.shiftId,
          workDate: assignment.assignmentDate,
          status: { in: [WorkerShiftStatus.ASSIGNED, WorkerShiftStatus.CONFIRMED] },
        },
      });
      // Only fail if this is NOT a manually created assignment with direct worker IDs
      if (!shiftAssignment && !isDirectlyAssigned) {
        throw new ForbiddenException('Worker is not assigned to this shift for this date.');
      }
    }

    const updated = await this.prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.IN_PROGRESS,
        startedAt: new Date(),
        startedById: workerProfile.id,
      },
      include: {
        team: true,
        serviceZone: { include: { area: { include: { ward: true } } } },
        shift: true,
      },
    });

    // Update vehicle status to IN_SERVICE
    const routeAssignment = await this.prisma.dailyRouteAssignment.findFirst({
      where: { teamId: assignment.teamId },
      orderBy: { date: 'desc' },
    });
    if (routeAssignment?.vehicleId) {
      await this.prisma.vehicle.update({
        where: { id: routeAssignment.vehicleId },
        data: { status: 'IN_SERVICE' },
      }).catch(() => {/* ignore if vehicle status enum doesn't support it */});
    }

    await this.auditService.log(userId, 'ASSIGNMENT_STARTED', ip, ua, { assignmentId });

    // Broadcast to admin and fleet dashboards
    realtimeEventEmitter.emit('workerShiftStarted', {
      assignmentId,
      workerId: userId,
      workerProfileId: workerProfile.id,
      teamName: (updated as any).team?.name,
      areaName: (updated as any).serviceZone?.area?.name,
      wardName: (updated as any).serviceZone?.area?.ward?.name,
      shiftName: (updated as any).shift?.name,
      startedAt: updated.startedAt,
      vehicleId: routeAssignment?.vehicleId,
    });
    realtimeEventEmitter.emit('assignmentStarted', { assignmentId, status: 'IN_PROGRESS' });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId, status: 'IN_PROGRESS' });

    return updated;
  }

  // ─── QR Code Verification ──────────────────────────────────────────────────
  async verifyBin(assignmentId: string, qrCodeId: string, userId: string) {
    const bin = await this.prisma.bin.findUnique({
      where: { qrCodeId },
    });
    if (!bin) {
      throw new NotFoundException('Bin not found.');
    }

    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    // Verify worker team authorization
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found.');
    }

    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        workerId: workerProfile.id,
        teamId: assignment.teamId,
        effectiveFrom: { lte: assignment.assignmentDate },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: assignment.assignmentDate } },
        ],
      },
    });
    if (!membership) {
      throw new ForbiddenException('Worker is not authorized for this assignment.');
    }

    // Verify bin belongs to assignment targets snapshot
    const target = await this.prisma.dailyAssignmentTarget.findUnique({
      where: {
        assignmentId_collectionPointId_binId: {
          assignmentId,
          collectionPointId: bin.collectionPointId,
          binId: bin.id,
        },
      },
      include: { collectionPoint: true },
    });

    if (!target) {
      throw new BadRequestException('Bin does not exist in this assignment snapshot.');
    }

    if (target.status === TargetStatus.CANCELLED) {
      throw new BadRequestException('This target is cancelled.');
    }

    return {
      verified: true,
      binId: bin.id,
      qrCodeId: bin.qrCodeId,
      type: bin.type,
      status: bin.status,
      fillLevel: bin.currentFillLevel,
      collectionPoint: {
        id: target.collectionPoint.id,
        name: target.collectionPoint.name,
        latitude: target.collectionPoint.latitude,
        longitude: target.collectionPoint.longitude,
      },
    };
  }

  // ─── Collection Target Workflow ─────────────────────────────────────────────
  async collectTarget(assignmentId: string, targetId: string, dto: CollectTargetDto, userId: string, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');

    if (assignment.status !== AssignmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Assignment is not in progress.');
    }

    // Worker authorization check
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) throw new NotFoundException('Worker profile not found.');

    const isAuthorized = assignment.primaryWorkerId === workerProfile.id ||
                         assignment.partnerWorkerId === workerProfile.id ||
                         assignment.driverId === workerProfile.id;

    if (!isAuthorized) {
      if (!assignment.teamId) {
        throw new ForbiddenException('Worker is not authorized for this assignment.');
      }
      const membership = await this.prisma.teamMembership.findFirst({
        where: {
          workerId: workerProfile.id,
          teamId: assignment.teamId,
          effectiveFrom: { lte: assignment.assignmentDate },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: assignment.assignmentDate } },
          ],
        },
      });
      if (!membership) {
        throw new ForbiddenException('Worker is not authorized for this team assignment.');
      }
    }

    // Fetch target
    const target = await this.prisma.dailyAssignmentTarget.findUnique({
      where: { id: targetId },
      include: { bin: true, collectionPoint: true },
    });
    if (!target || target.assignmentId !== assignmentId) {
      throw new BadRequestException('Target does not belong to this assignment.');
    }

    if (target.status !== TargetStatus.PENDING) {
      throw new BadRequestException('Target is already in a terminal state or cancelled.');
    }

    // Verify QR scan code matches target bin
    if (target.bin.qrCodeId !== dto.qrCodeId) {
      throw new BadRequestException('QR code verification failed: bin code does not match.');
    }

    // Idempotency check
    const existingEvent = await this.prisma.collectionEvent.findUnique({
      where: { clientEventId: dto.clientEventId },
    });
    if (existingEvent) {
      return existingEvent;
    }

    // GPS location distance check
    let distance: number | null = null;
    let verificationLevel: CollectionVerification = CollectionVerification.UNVERIFIED;

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      distance = this.getDistance(
        dto.latitude,
        dto.longitude,
        target.collectionPoint.latitude,
        target.collectionPoint.longitude,
      );

      if (distance <= 100) {
        verificationLevel = CollectionVerification.VERIFIED;
      } else if (distance <= 300) {
        verificationLevel = CollectionVerification.PARTIALLY_VERIFIED;
      } else {
        verificationLevel = CollectionVerification.FLAGGED;
      }
    } else {
      // Missing GPS but scanned QR
      verificationLevel = CollectionVerification.PARTIALLY_VERIFIED;
    }

    const event = await this.prisma.$transaction(async (tx) => {
      // 1. Create Immutable CollectionEvent
      const colEvent = await tx.collectionEvent.create({
        data: {
          assignmentId,
          targetId,
          binId: target.binId,
          collectionPointId: target.collectionPointId,
          workerId: workerProfile.id,
          teamId: assignment.teamId,
          eventType: CollectionEventType.COLLECTED,
          occurredAt: new Date(),
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          locationAccuracy: dto.locationAccuracy ?? null,
          notes: dto.notes ?? null,
          evidenceId: dto.evidenceId ?? null,
          clientEventId: dto.clientEventId,
          distanceFromTarget: distance,
          verificationLevel,
        },
      });

      // 2. Update Target Status to COLLECTED
      await tx.dailyAssignmentTarget.update({
        where: { id: targetId },
        data: {
          status: TargetStatus.COLLECTED,
          collectedAt: new Date(),
          collectedById: workerProfile.id,
        },
      });

      return colEvent;
    });

    // 3. Trigger verified bin-emptying
    await this.binStateService.recordEmptying(target.binId, userId);

    await this.auditService.log(userId, 'TARGET_COLLECTED', ip, ua, {
      assignmentId,
      targetId,
      binId: target.binId,
      verificationLevel,
    });

    // 4. Broadcast real-time event to dashboards
    realtimeEventEmitter.emit('taskCompleted', {
      assignmentId,
      targetId,
      binId: target.binId,
      workerId: userId,
      timestamp: new Date().toISOString(),
    });
    realtimeEventEmitter.emit('targetCollected', {
      assignmentId,
      targetId,
      binId: target.binId,
      workerId: userId,
      verificationLevel,
    });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId });

    // Call citizen notification
    this.notifyCitizenForTarget(targetId, 'COLLECTED');

    return event;
  }

  // ─── Missed Collection Workflow ────────────────────────────────────────────
  async missTarget(assignmentId: string, targetId: string, dto: MissTargetDto, userId: string, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');

    if (assignment.status !== AssignmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Assignment is not in progress.');
    }

    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) throw new NotFoundException('Worker profile not found.');

    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        workerId: workerProfile.id,
        teamId: assignment.teamId,
        effectiveFrom: { lte: assignment.assignmentDate },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: assignment.assignmentDate } },
        ],
      },
    });
    if (!membership) throw new ForbiddenException('Worker is not authorized for this assignment.');

    const target = await this.prisma.dailyAssignmentTarget.findUnique({
      where: { id: targetId },
      include: { collectionPoint: true },
    });
    if (!target || target.assignmentId !== assignmentId) {
      throw new BadRequestException('Target does not belong to this assignment.');
    }

    if (target.status !== TargetStatus.PENDING) {
      throw new BadRequestException('Target is already in a terminal state or cancelled.');
    }

    // Idempotency check
    const existingEvent = await this.prisma.collectionEvent.findUnique({
      where: { clientEventId: dto.clientEventId },
    });
    if (existingEvent) {
      return existingEvent;
    }

    // Validate miss reason code
    const validMissReasons = ['ACCESS_BLOCKED', 'BIN_NOT_FOUND', 'PROPERTY_INACCESSIBLE', 'SAFETY_RISK', 'VEHICLE_CAPACITY', 'OTHER'];
    if (!validMissReasons.includes(dto.reasonCode)) {
      throw new BadRequestException(`Invalid miss reason: ${dto.reasonCode}`);
    }

    let distance: number | null = null;
    let verificationLevel: CollectionVerification = CollectionVerification.UNVERIFIED;

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      distance = this.getDistance(
        dto.latitude,
        dto.longitude,
        target.collectionPoint.latitude,
        target.collectionPoint.longitude,
      );
      verificationLevel = distance <= 300 ? CollectionVerification.PARTIALLY_VERIFIED : CollectionVerification.FLAGGED;
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const colEvent = await tx.collectionEvent.create({
        data: {
          assignmentId,
          targetId,
          binId: target.binId,
          collectionPointId: target.collectionPointId,
          workerId: workerProfile.id,
          teamId: assignment.teamId,
          eventType: CollectionEventType.MISSED,
          occurredAt: new Date(),
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          locationAccuracy: dto.locationAccuracy ?? null,
          notes: dto.notes ?? null,
          reasonCode: dto.reasonCode,
          evidenceId: dto.evidenceId ?? null,
          clientEventId: dto.clientEventId,
          distanceFromTarget: distance,
          verificationLevel,
        },
      });

      await tx.dailyAssignmentTarget.update({
        where: { id: targetId },
        data: {
          status: TargetStatus.MISSED,
          collectedAt: new Date(),
          collectedById: workerProfile.id,
        },
      });

      return colEvent;
    });

    await this.auditService.log(userId, 'TARGET_MISSED', ip, ua, {
      assignmentId,
      targetId,
      reasonCode: dto.reasonCode,
    });

    realtimeEventEmitter.emit('targetMissed', {
      assignmentId,
      targetId,
      binId: target.binId,
      workerId: userId,
      reasonCode: dto.reasonCode,
    });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId });

    // Call citizen notification
    this.notifyCitizenForTarget(targetId, 'MISSED');

    return event;
  }

  // ─── Skipped Collection Workflow ───────────────────────────────────────────
  async skipTarget(assignmentId: string, targetId: string, dto: SkipTargetDto, userId: string, userRole: UserRole, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');

    if (assignment.status !== AssignmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Assignment is not in progress.');
    }

    let actorId: string;
    if (userRole === UserRole.WORKER) {
      const workerProfile = await this.prisma.workerProfile.findUnique({
        where: { userId },
      });
      if (!workerProfile) throw new NotFoundException('Worker profile not found.');

      const membership = await this.prisma.teamMembership.findFirst({
        where: {
          workerId: workerProfile.id,
          teamId: assignment.teamId,
          effectiveFrom: { lte: assignment.assignmentDate },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: assignment.assignmentDate } },
          ],
        },
      });
      if (!membership) throw new ForbiddenException('Worker is not authorized for this assignment.');
      actorId = workerProfile.id;
    } else {
      // Supervisor, Admin, or Gov Official
      if (userRole === UserRole.SUPERVISOR) {
        const team = await this.prisma.collectionTeam.findUnique({
          where: { id: assignment.teamId },
        });
        if (team?.supervisorId !== userId) {
          throw new ForbiddenException('You are not authorized to manage assignments for this team.');
        }
      }
      actorId = userId; // Store user ID
    }

    const target = await this.prisma.dailyAssignmentTarget.findUnique({
      where: { id: targetId },
      include: { collectionPoint: true },
    });
    if (!target || target.assignmentId !== assignmentId) {
      throw new BadRequestException('Target does not belong to this assignment.');
    }

    if (target.status !== TargetStatus.PENDING) {
      throw new BadRequestException('Target is already in a terminal state or cancelled.');
    }

    // Idempotency check
    const existingEvent = await this.prisma.collectionEvent.findUnique({
      where: { clientEventId: dto.clientEventId },
    });
    if (existingEvent) {
      return existingEvent;
    }

    // Validate skip reason code
    const validSkipReasons = ['BIN_ALREADY_EMPTY', 'DUPLICATE_TARGET', 'SERVICE_NOT_REQUIRED', 'ADMINISTRATIVE_INSTRUCTION', 'OTHER'];
    if (!validSkipReasons.includes(dto.reasonCode)) {
      throw new BadRequestException(`Invalid skip reason: ${dto.reasonCode}`);
    }

    // Role restrictions for sensitive skips
    if (dto.reasonCode === 'ADMINISTRATIVE_INSTRUCTION') {
      if (
        userRole !== UserRole.SUPERVISOR &&
        userRole !== UserRole.GOVERNMENT_OFFICIAL &&
        userRole !== UserRole.SYSTEM_ADMIN
      ) {
        throw new ForbiddenException('Only supervisors and above can skip targets for Administrative Instructions.');
      }
    }

    let distance: number | null = null;
    let verificationLevel: CollectionVerification = CollectionVerification.UNVERIFIED;

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      distance = this.getDistance(
        dto.latitude,
        dto.longitude,
        target.collectionPoint.latitude,
        target.collectionPoint.longitude,
      );
      verificationLevel = distance <= 300 ? CollectionVerification.PARTIALLY_VERIFIED : CollectionVerification.FLAGGED;
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const colEvent = await tx.collectionEvent.create({
        data: {
          assignmentId,
          targetId,
          binId: target.binId,
          collectionPointId: target.collectionPointId,
          workerId: actorId,
          teamId: assignment.teamId,
          eventType: CollectionEventType.SKIPPED,
          occurredAt: new Date(),
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          locationAccuracy: dto.locationAccuracy ?? null,
          notes: dto.notes ?? null,
          reasonCode: dto.reasonCode,
          evidenceId: dto.evidenceId ?? null,
          clientEventId: dto.clientEventId,
          distanceFromTarget: distance,
          verificationLevel,
        },
      });

      await tx.dailyAssignmentTarget.update({
        where: { id: targetId },
        data: {
          status: TargetStatus.SKIPPED,
          collectedAt: new Date(),
          collectedById: actorId,
        },
      });

      return colEvent;
    });

    await this.auditService.log(userId, 'TARGET_SKIPPED', ip, ua, {
      assignmentId,
      targetId,
      reasonCode: dto.reasonCode,
    });

    realtimeEventEmitter.emit('targetSkipped', {
      assignmentId,
      targetId,
      binId: target.binId,
      workerId: userId,
      reasonCode: dto.reasonCode,
    });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId });

    // Call citizen notification
    this.notifyCitizenForTarget(targetId, 'SKIPPED');

    return event;
  }

  // ─── Complete Assignment Workflow ──────────────────────────────────────────
  async completeAssignment(assignmentId: string, userId: string, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      include: { targets: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');

    if (assignment.status !== AssignmentStatus.IN_PROGRESS) {
      throw new BadRequestException('Assignment is not in progress.');
    }

    // Verify worker team authorization
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) throw new NotFoundException('Worker profile not found.');

    const isAuthorized = assignment.primaryWorkerId === workerProfile.id ||
                         assignment.partnerWorkerId === workerProfile.id ||
                         assignment.driverId === workerProfile.id;

    if (!isAuthorized) {
      if (!assignment.teamId) {
        throw new ForbiddenException('Worker is not authorized for this assignment.');
      }
      const membership = await this.prisma.teamMembership.findFirst({
        where: {
          workerId: workerProfile.id,
          teamId: assignment.teamId,
          effectiveFrom: { lte: assignment.assignmentDate },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: assignment.assignmentDate } },
          ],
        },
      });
      if (!membership) {
        throw new ForbiddenException('Worker is not authorized for this team assignment.');
      }
    }

    // Check outstanding pending targets
    const pendingTargets = assignment.targets.filter((t) => t.status === TargetStatus.PENDING);
    if (pendingTargets.length > 0) {
      throw new BadRequestException('Cannot complete assignment: outstanding pending targets remain.');
    }

    const updated = await this.prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.COMPLETED,
        completedAt: new Date(),
        completedById: workerProfile.id,
      },
      include: {
        targets: true,
        team: true,
        serviceZone: { include: { area: { include: { ward: true } } } },
      },
    });

    await this.auditService.log(userId, 'ASSIGNMENT_COMPLETED', ip, ua, { assignmentId });

    // Derive summary metrics
    const nonCancelled = updated.targets.filter((t) => t.status !== TargetStatus.CANCELLED);
    const collected = nonCancelled.filter((t) => t.status === TargetStatus.COLLECTED).length;
    const missed = nonCancelled.filter((t) => t.status === TargetStatus.MISSED).length;
    const skipped = nonCancelled.filter((t) => t.status === TargetStatus.SKIPPED).length;
    const completionRate = nonCancelled.length > 0 ? (collected / nonCancelled.length) * 100 : 100;

    // Update vehicle to RETURNING
    const routeAssignment = await this.prisma.dailyRouteAssignment.findFirst({
      where: { teamId: assignment.teamId },
      orderBy: { date: 'desc' },
    });
    if (routeAssignment?.vehicleId) {
      await this.prisma.vehicle.update({
        where: { id: routeAssignment.vehicleId },
        data: { status: 'RETURNING' },
      }).catch(() => {});
    }

    // Broadcast area completion — triggers citizen, government, admin dashboard updates
    const areaData = (updated as any).serviceZone?.area;
    realtimeEventEmitter.emit('areaCompleted', {
      assignmentId,
      areaName: areaData?.name,
      wardName: areaData?.ward?.name,
      teamName: (updated as any).team?.name,
      workerId: userId,
      completedAt: updated.completedAt,
      collected,
      missed,
      skipped,
      completionRate: Math.round(completionRate),
      totalBins: nonCancelled.length,
    });
    realtimeEventEmitter.emit('assignmentCompleted', { assignmentId, status: 'COMPLETED' });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId, status: 'COMPLETED' });
    realtimeEventEmitter.emit('taskCompleted', { assignmentId, collected, completionRate });
    
    // Notify supervisor if exists
    if (updated.team?.supervisorId) {
      await this.prisma.notification.create({
        data: {
          userId: updated.team.supervisorId,
          title: 'Assignment Completed',
          body: `Assignment ${assignmentId} has been completed by ${updated.team.name} with ${completionRate}% completion rate.`,
          type: 'INFO'
        }
      });
      realtimeEventEmitter.emit('notification', {
        userId: updated.team.supervisorId,
        title: 'Assignment Completed',
        body: `Assignment ${assignmentId} has been completed by ${updated.team.name} with ${completionRate}% completion rate.`,
        type: 'INFO'
      });
    }

    return {
      assignmentId: updated.id,
      status: updated.status,
      expected: nonCancelled.length,
      collected,
      missed,
      skipped,
      completionRate,
    };
  }

  // ─── Supervisor Correction / Override Workflow ─────────────────────────────
  async correctTarget(assignmentId: string, targetId: string, dto: CorrectTargetDto, supervisorUserId: string, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');

    const target = await this.prisma.dailyAssignmentTarget.findUnique({
      where: { id: targetId },
    });
    if (!target || target.assignmentId !== assignmentId) {
      throw new BadRequestException('Target does not belong to this assignment.');
    }

    // Role verification for supervisor
    const supervisor = await this.prisma.user.findUnique({
      where: { id: supervisorUserId },
    });
    if (
      !supervisor ||
      (supervisor.role !== UserRole.SUPERVISOR &&
        supervisor.role !== UserRole.GOVERNMENT_OFFICIAL &&
        supervisor.role !== UserRole.SYSTEM_ADMIN)
    ) {
      throw new ForbiddenException('Only supervisors and administrators can correct targets.');
    }

    // If supervisor role is SUPERVISOR, check team scope
    if (supervisor.role === UserRole.SUPERVISOR) {
      const team = await this.prisma.collectionTeam.findUnique({
        where: { id: assignment.teamId },
      });
      if (team?.supervisorId !== supervisorUserId) {
        throw new ForbiddenException('You are not authorized to correct assignments for this team.');
      }
    }

    // Perform correction
    const clientEventId = `corr-${targetId}-${Date.now()}`;
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create a CORRECTED Event
      const colEvent = await tx.collectionEvent.create({
        data: {
          assignmentId,
          targetId,
          binId: target.binId,
          collectionPointId: target.collectionPointId,
          workerId: target.collectedById || supervisorUserId, // Default to supervisor if no worker did original event
          teamId: assignment.teamId,
          eventType: CollectionEventType.CORRECTED,
          occurredAt: new Date(),
          notes: dto.correctionReason,
          clientEventId,
          verificationLevel: CollectionVerification.VERIFIED,
        },
      });

      // 2. Create SupervisorCorrection entry
      await tx.supervisorCorrection.create({
        data: {
          originalEventId: colEvent.id,
          correctedById: supervisorUserId,
          correctionReason: dto.correctionReason,
          correctedStatus: dto.correctedStatus,
        },
      });

      // 3. Update Target Status
      await tx.dailyAssignmentTarget.update({
        where: { id: targetId },
        data: {
          status: dto.correctedStatus,
          updatedAt: new Date(),
        },
      });

      return colEvent;
    });

    // 4. If correction results in COLLECTED, trigger verified bin-emptying
    if (dto.correctedStatus === TargetStatus.COLLECTED) {
      await this.binStateService.recordEmptying(target.binId, supervisorUserId);
    }

    await this.auditService.log(supervisorUserId, 'SUPERVISOR_CORRECTION_APPLIED', ip, ua, {
      assignmentId,
      targetId,
      correctedStatus: dto.correctedStatus,
      reason: dto.correctionReason,
    });

    return result;
  }

  // ─── Citizen History Service ───────────────────────────────────────────────
  async getCitizenCollectionHistory(citizenUserId: string) {
    // Find verified properties owned by citizen
    const properties = await this.prisma.property.findMany({
      where: { ownerId: citizenUserId, status: 'VERIFIED' },
      include: {
        collectionPoints: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    const cpIds = [];
    for (const p of properties) {
      for (const cp of p.collectionPoints) {
        cpIds.push(cp.id);
      }
    }

    if (cpIds.length === 0) return [];

    const targets = await this.prisma.dailyAssignmentTarget.findMany({
      where: {
        collectionPointId: { in: cpIds },
        status: { in: [TargetStatus.COLLECTED, TargetStatus.MISSED, TargetStatus.SKIPPED] },
      },
      include: {
        assignment: true,
        bin: true,
        collectionPoint: true,
      },
      orderBy: { collectedAt: 'desc' },
    });

    // Format safe data to citizen
    return targets.map((t) => ({
      targetId: t.id,
      address: t.collectionPoint.propertyId
        ? properties.find((p) => p.id === t.collectionPoint.propertyId)?.address || t.collectionPoint.name
        : t.collectionPoint.name,
      wasteType: t.assignment.wasteType,
      status: t.status,
      collectedAt: t.collectedAt,
      binType: t.bin.type,
      // No employee ids or evidence attachments exposed for privacy
    }));
  }

  // ─── Active Operations Polling for Supervisors ──────────────────────────────
  async getActiveOperations(supervisorUserId: string, userRole: UserRole) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    let teamIds: string[] | undefined = undefined;

    // Filter teams supervisor owns
    if (userRole === UserRole.SUPERVISOR) {
      const teams = await this.prisma.collectionTeam.findMany({
        where: { supervisorId: supervisorUserId },
        select: { id: true },
      });
      teamIds = teams.map((t) => t.id);
    }

    const assignments = await this.prisma.dailyAssignment.findMany({
      where: {
        assignmentDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        teamId: teamIds ? { in: teamIds } : undefined,
      },
      include: {
        team: true,
        serviceZone: { include: { area: true } },
        shift: true,
        targets: {
          include: {
            bin: {
              include: { alerts: { where: { status: 'ACTIVE' } } },
            },
            collectionPoint: true,
            collectionEvents: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return assignments.map((assign) => {
      const total = assign.targets.filter((t) => t.status !== TargetStatus.CANCELLED).length;
      const pending = assign.targets.filter((t) => t.status === TargetStatus.PENDING).length;
      const collected = assign.targets.filter((t) => t.status === TargetStatus.COLLECTED).length;
      const missed = assign.targets.filter((t) => t.status === TargetStatus.MISSED).length;
      const skipped = assign.targets.filter((t) => t.status === TargetStatus.SKIPPED).length;
      const progress = total > 0 ? (collected / total) * 100 : 100;

      // Extract flagged collection events
      const flaggedTargets = assign.targets
        .filter((t) =>
          t.collectionEvents.some((e) => e.verificationLevel === CollectionVerification.FLAGGED),
        )
        .map((t) => ({
          targetId: t.id,
          binId: t.binId,
          collectionPointName: t.collectionPoint.name,
          verificationLevel: t.collectionEvents[0]?.verificationLevel,
          distanceFromTarget: t.collectionEvents[0]?.distanceFromTarget,
        }));

      return {
        id: assign.id,
        teamName: assign.team.name,
        teamCode: assign.team.code,
        zoneName: assign.serviceZone.name,
        areaName: assign.serviceZone.area.name,
        shiftName: assign.shift.name,
        wasteType: assign.wasteType,
        status: assign.status,
        expected: total,
        pending,
        collected,
        missed,
        skipped,
        progress,
        flaggedTargets,
      };
    });
  }

  // ─── File Upload Evidence Handler ──────────────────────────────────────────
  async saveEvidenceFile(file: any, userId: string): Promise<CollectionEvidence> {
    // 1. Validate size <= 5MB
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File is larger than the 5MB maximum size.');
    }

    // 2. Validate MIME type (must be image)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    }

    // 3. Generate storage keys
    const uploadsDir = path.join(process.cwd(), 'uploads', 'evidence');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileExt = path.extname(file.originalname) || '.jpg';
    const storageKey = `evidence-${crypto.randomUUID()}${fileExt}`;
    const filePath = path.join(uploadsDir, storageKey);

    // 4. Save file
    fs.writeFileSync(filePath, file.buffer);

    // 5. Save database record
    return this.prisma.collectionEvidence.create({
      data: {
        storageKey,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId,
        metadata: {
          originalName: file.originalname,
        },
      },
    });
  }

  // ─── Fetch Evidence Binary ────────────────────────────────────────────────
  async getEvidenceFile(evidenceId: string) {
    const evidence = await this.prisma.collectionEvidence.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence) {
      throw new NotFoundException('Evidence file not found.');
    }

    const filePath = path.join(process.cwd(), 'uploads', 'evidence', evidence.storageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Physical file not found on disk.');
    }

    return {
      filePath,
      mimeType: evidence.mimeType,
    };
  }

  async createManualAssignment(dto: any, adminId: string, ip?: string, ua?: string) {
    const { assignmentDate, teamId, serviceZoneId, areaId, wasteType, shiftId, vehicleId, driverId } = dto;
    const targetDate = new Date(assignmentDate);
    targetDate.setHours(0, 0, 0, 0);

    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Selected Shift not found.');

    const team = await this.prisma.collectionTeam.findUnique({
      where: { id: teamId },
      include: {
        memberships: {
          include: {
            worker: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });
    if (!team) throw new NotFoundException('Selected Team not found.');

    for (const member of team.memberships) {
      if (member.worker.employmentStatus !== 'ACTIVE') {
        throw new BadRequestException(`Worker ${member.worker.user.name || member.worker.user.email} is not currently active.`);
      }
      const existingAssignment = await this.prisma.dailyAssignment.findFirst({
        where: {
          assignmentDate: targetDate,
          teamId: team.id,
        }
      });
      if (existingAssignment) {
        throw new BadRequestException(`Team ${team.name} is already assigned on ${assignmentDate}.`);
      }
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Selected Vehicle not found.');
    if (vehicle.status !== 'AVAILABLE' && vehicle.status !== 'IN_SERVICE') {
      throw new BadRequestException(`Selected Vehicle is in status ${vehicle.status} and cannot be assigned.`);
    }

    const existingRoute = await this.prisma.dailyRouteAssignment.findFirst({
      where: {
        date: targetDate,
        vehicleId: vehicle.id,
      }
    });
    if (existingRoute) {
      throw new BadRequestException(`Selected Vehicle is already assigned on ${assignmentDate}.`);
    }

    const bins = await this.prisma.bin.findMany({
      where: {
        type: wasteType,
        collectionPoint: { areaId },
      }
    });
    const totalWeight = bins.reduce((sum, b) => sum + (b.currentFillLevel / 100) * 120, 0);
    if (totalWeight > vehicle.capacityKg) {
      throw new BadRequestException(`Total estimated waste weight (${totalWeight.toFixed(0)} kg) exceeds vehicle capacity (${vehicle.capacityKg} kg).`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const da = await tx.dailyAssignment.create({
        data: {
          assignmentDate: targetDate,
          teamId,
          serviceZoneId,
          areaId,
          wasteType,
          shiftId,
          vehicleId: vehicleId || null,
          driverId: driverId || null,
          status: 'ASSIGNED',
          generationSource: 'MANUAL',
        }
      });

      const firstRoute = await tx.route.findFirst({ where: { areaId } });
      if (firstRoute) {
        await tx.dailyRouteAssignment.create({
          data: {
            date: targetDate,
            routeId: firstRoute.id,
            vehicleId,
            driverId,
            teamId,
            status: 'PLANNED',
          }
        });
      }

      for (const bin of bins) {
        await tx.dailyAssignmentTarget.create({
          data: {
            assignmentId: da.id,
            collectionPointId: bin.collectionPointId,
            binId: bin.id,
            status: 'PENDING',
          }
        });
      }

      // Notify all team members
      const teamFull = await tx.collectionTeam.findUnique({
        where: { id: teamId },
        include: {
          memberships: {
            include: { worker: { include: { user: { select: { id: true, name: true } } } } }
          },
          supervisor: { select: { id: true } }
        }
      });

      if (teamFull) {
        for (const membership of teamFull.memberships) {
          await tx.notification.create({
            data: {
              userId: membership.worker.user.id,
              title: 'New Assignment Assigned',
              body: `You have a new ${wasteType} collection assignment on ${targetDate.toISOString().split('T')[0]}.`,
              type: 'INFO',
            }
          });
        }
        if (teamFull.supervisor?.id) {
          await tx.notification.create({
            data: {
              userId: teamFull.supervisor.id,
              title: 'Team Assignment Created',
              body: `Your team has been assigned a ${wasteType} collection on ${targetDate.toISOString().split('T')[0]}.`,
              type: 'INFO',
            }
          });
        }
      }

      return { da, teamFull };
    });

    realtimeEventEmitter.emit('assignmentCreated', { assignmentId: result.da.id, wasteType, assignmentDate: targetDate });
    realtimeEventEmitter.emit('notificationCreated', { type: 'ASSIGNMENT_NEW' });

    if (result.teamFull) {
      for (const membership of result.teamFull.memberships) {
        const workerId = membership.worker.user.id;
        const assignments = await this.getWorkerTodayAssignments(workerId);
        const newTask = assignments.find(a => a.id === result.da.id);
        if (newTask) {
          realtimeEventEmitter.emit('TASK_ASSIGNED', {
            workerIds: [workerId],
            task: newTask
          });
        }
      }
    }

    return result.da;
  }

  async createAdvancedManualAssignment(dto: any, adminId: string, ip?: string, ua?: string) {
    const { 
      workerId, partnerWorkerId, vehicleId, driverId, areaId, wardId, zoneId, 
      wasteType, shiftId, assignmentDate, startTime, endTime, 
      priority, estimatedBinCount, estimatedDuration, notes 
    } = dto;

    const targetDate = new Date(assignmentDate);
    targetDate.setHours(0, 0, 0, 0);

    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Selected Shift not found.');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Selected Vehicle not found.');
    if (vehicle.status !== 'AVAILABLE' && vehicle.status !== 'IN_SERVICE') {
      throw new BadRequestException(`Selected Vehicle is not available. Status is ${vehicle.status}`);
    }

    // Check for vehicle overlap in the same shift and day
    const vehicleOverlap = await this.prisma.dailyAssignment.findFirst({
      where: {
        vehicleId,
        assignmentDate: targetDate,
        shiftId,
        status: { notIn: ['CANCELLED'] }
      }
    });
    if (vehicleOverlap) {
      throw new BadRequestException('Selected Vehicle is already assigned for this shift on this date.');
    }

    // Verify workers
    const workerIds = [workerId, partnerWorkerId, driverId].filter(Boolean);
    const workers = await this.prisma.workerProfile.findMany({
      where: { id: { in: workerIds } },
      include: {
        user: true,
        memberships: { include: { team: true } }
      }
    });
    
    for (const w of workers) {
      if (w.employmentStatus !== 'ACTIVE') {
        throw new BadRequestException(`Worker with ID ${w.id} is not ACTIVE.`);
      }
      if (w.user?.status !== 'ACTIVE') {
        throw new BadRequestException(`User associated with worker ID ${w.id} is not APPROVED.`);
      }
    }

    // Check for worker overlaps
    const workerOverlap = await this.prisma.dailyAssignment.findFirst({
      where: {
        assignmentDate: targetDate,
        shiftId,
        status: { notIn: ['CANCELLED'] },
        OR: [
          { primaryWorkerId: { in: workerIds } },
          { partnerWorkerId: { in: workerIds } },
          { driverId: { in: workerIds } }
        ]
      }
    });
    if (workerOverlap) {
      throw new BadRequestException('One or more selected workers are already assigned for this shift on this date.');
    }

    const uniqueWorkerIds = Array.from(new Set([workerId, partnerWorkerId, driverId].filter(Boolean)));

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark vehicle as ASSIGNED (IN_SERVICE)
      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { status: 'IN_SERVICE' } 
      });

      // 2. Create DailyAssignment — status ASSIGNED so workers see it immediately
      const da = await tx.dailyAssignment.create({
        data: {
          assignmentDate: targetDate,
          primaryWorkerId: workerId,
          partnerWorkerId: partnerWorkerId || null,
          driverId: driverId || null,
          vehicleId: vehicle.id,
          serviceZoneId: zoneId,
          areaId,
          wasteType,
          shiftId,
          status: 'ASSIGNED',
          generationSource: 'MANUAL',
          priority: priority || 'NORMAL',
          notes,
          estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : null,
          estimatedBinCount: estimatedBinCount ? parseInt(estimatedBinCount) : null,
        }
      });

      // 3. Create route assignment
      const firstRoute = await tx.route.findFirst({ where: { areaId } });
      if (firstRoute) {
        await tx.dailyRouteAssignment.create({
          data: {
            date: targetDate,
            routeId: firstRoute.id,
            vehicleId,
            status: 'PLANNED', // DailyRouteAssignment status
          }
        });
      }

      // 4. Snapshot Targets
      const bins = await tx.bin.findMany({
        where: {
          type: wasteType,
          collectionPoint: { areaId },
        }
      });
      for (const bin of bins) {
        await tx.dailyAssignmentTarget.create({
          data: {
            assignmentId: da.id,
            collectionPointId: bin.collectionPointId,
            binId: bin.id,
            status: 'PENDING',
          }
        });
      }

      // Emit event
      realtimeEventEmitter.emit('assignmentCreated', {
        assignmentId: da.id,
        action: 'CREATED_MANUALLY'
      });
      
      // Notify workers via the Notification model
      const uniqueWorkerIds = Array.from(new Set([workerId, partnerWorkerId, driverId].filter(Boolean)));
      const supervisorIds = new Set<string>();

      for (const wId of uniqueWorkerIds) {
        const wProfile = workers.find(w => w.id === wId);
        if (wProfile) {
          // Send to worker
          await tx.notification.create({
             data: {
               userId: wProfile.userId,
               title: 'New Assignment Planned',
               body: `You have a new ${wasteType} collection assignment on ${targetDate.toISOString().split('T')[0]}.`,
               type: 'INFO'
             }
          });
          realtimeEventEmitter.emit('notification', {
            userId: wProfile.userId,
            title: 'New Assignment Planned',
            body: `You have a new ${wasteType} collection assignment on ${targetDate.toISOString().split('T')[0]}.`,
            type: 'INFO'
          });

          // Collect supervisors
          if (wProfile.memberships) {
            wProfile.memberships.forEach(m => {
              if (m.team?.supervisorId) supervisorIds.add(m.team.supervisorId);
            });
          }
        }
      }

      // Notify Supervisors
      for (const sId of supervisorIds) {
        await tx.notification.create({
          data: {
            userId: sId,
            title: 'Worker Assigned',
            body: `A worker in your team has been assigned for ${wasteType} collection on ${targetDate.toISOString().split('T')[0]}.`,
            type: 'INFO'
          }
        });
        realtimeEventEmitter.emit('notification', {
          userId: sId,
          title: 'Worker Assigned',
          body: `A worker in your team has been assigned for ${wasteType} collection on ${targetDate.toISOString().split('T')[0]}.`,
          type: 'INFO'
        });
      }

      // Notify Admins and Officials
      const managementUsers = await tx.user.findMany({
        where: { role: { in: ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL'] } },
        select: { id: true }
      });
      
      for (const adminUser of managementUsers) {
        await tx.notification.create({
          data: {
            userId: adminUser.id,
            title: 'Assignment Created',
            body: `A manual ${wasteType} assignment was created for ${targetDate.toISOString().split('T')[0]}.`,
            type: 'SYSTEM'
          }
        });
      }
      
      return da;
    });

    // Outside transaction: Emit real-time events
    realtimeEventEmitter.emit('assignmentCreated', {
      assignmentId: result.id,
      action: 'CREATED_MANUALLY'
    });
    realtimeEventEmitter.emit('notificationCreated', { type: 'ASSIGNMENT_NEW' });

    for (const wId of uniqueWorkerIds) {
      const wProfile = workers.find(w => w.id === wId);
      if (wProfile) {
        const assignments = await this.getWorkerTodayAssignments(wProfile.userId);
        const newTask = assignments.find(a => a.id === result.id);
        if (newTask) {
          realtimeEventEmitter.emit('TASK_ASSIGNED', {
            workerIds: [wProfile.userId],
            task: newTask
          });
        }
      }
    }

    return result;
  }

  /**
   * Called by worker to accept an assignment
   */
  async acceptAssignment(assignmentId: string, userId: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        team: { include: { supervisor: { select: { id: true } } } },
        primaryWorker: { include: { user: { select: { name: true } } } },
      }
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status !== 'ASSIGNED' && assignment.status !== 'CREATED') {
      throw new BadRequestException('Can only accept ASSIGNED or CREATED assignments');
    }

    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true } } }
    });
    const workerName = workerProfile?.user?.name || userId;

    const updated = await this.prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ACCEPTED' }
    });

    realtimeEventEmitter.emit('assignmentAccepted', { assignmentId, status: 'ACCEPTED' });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId, status: 'ACCEPTED' });

    // Mark related notifications as read for this worker
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false, title: { in: ['New Assignment Planned', 'New Assignment Assigned'] } },
      data: { isRead: true }
    });

    // Notify supervisor of acceptance
    const supervisorId = (assignment as any).team?.supervisor?.id;
    if (supervisorId) {
      await this.prisma.notification.create({
        data: {
          userId: supervisorId,
          title: 'Assignment Accepted',
          body: `Worker ${workerName} has accepted assignment ${assignmentId}.`,
          type: 'INFO',
        }
      });
    }

    // Notify admins
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL'] } },
      select: { id: true }
    });
    for (const admin of admins) {
      await this.prisma.notification.create({
        data: {
          userId: admin.id,
          title: 'Assignment Accepted',
          body: `Worker ${workerName} accepted assignment ${assignmentId}.`,
          type: 'SYSTEM',
        }
      });
    }

    realtimeEventEmitter.emit('notificationCreated', { type: 'ASSIGNMENT_ACCEPTED', assignmentId });

    return updated;
  }

  /**
   * Called by worker to reject an assignment
   */
  async rejectAssignment(assignmentId: string, userId: string, reason: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        team: { include: { supervisor: { select: { id: true } } } },
      }
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status !== 'ASSIGNED' && assignment.status !== 'CREATED') {
      throw new BadRequestException('Can only reject ASSIGNED or CREATED assignments');
    }

    const workerProfile = await this.prisma.workerProfile.findUnique({ where: { userId }, include: { user: true } });
    const workerName = workerProfile?.user?.name || userId;

    // Reset assignment — clear direct worker links but keep team assignment for reassignment
    const updated = await this.prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'CREATED',
        primaryWorkerId: null,
        partnerWorkerId: null,
        driverId: null,
      }
    });

    realtimeEventEmitter.emit('assignmentRejected', { assignmentId, status: 'CREATED' });
    realtimeEventEmitter.emit('assignmentUpdated', { assignmentId, status: 'CREATED' });

    // Notify supervisor of rejection
    const supervisorId = (assignment as any).team?.supervisor?.id;
    if (supervisorId) {
      await this.prisma.notification.create({
        data: {
          userId: supervisorId,
          title: 'Assignment Rejected',
          body: `Worker ${workerName} rejected assignment ${assignmentId}. Reason: ${reason}`,
          type: 'WARNING',
        }
      });
    }

    // Notify all admins and government officials
    const managers = await this.prisma.user.findMany({
      where: { role: { in: ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL'] } },
      select: { id: true }
    });
    for (const manager of managers) {
      await this.prisma.notification.create({
        data: {
          userId: manager.id,
          type: 'SYSTEM',
          title: 'Assignment Rejected',
          body: `Worker ${workerName} rejected assignment ${assignmentId}. Reason: ${reason}`
        }
      });
    }

    realtimeEventEmitter.emit('notificationCreated', { type: 'ASSIGNMENT_REJECTED', assignmentId });

    return updated;
  }



  /**
   * Generates DailyAssignments based on the WeeklyCollectionSchedule
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateNightlyAssignments() {
    this.logger.log('Starting nightly assignment generation...');
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
    const tomorrowDayName = dayNames[tomorrow.getDay()];
    
    const schedules = await this.prisma.weeklyCollectionSchedule.findMany({
      where: { dayOfWeek: tomorrowDayName }
    });
    
    this.logger.log(`Found ${schedules.length} weekly schedules for ${tomorrowDayName}`);
    
    let createdCount = 0;
    
    for (const schedule of schedules) {
      const zoneTeam = schedule.zoneId ? await this.prisma.teamServiceAssignment.findFirst({
        where: { serviceZoneId: schedule.zoneId, status: 'ACTIVE' },
        include: { team: true }
      }) : null;
      
      const teamId = zoneTeam?.teamId || null;
      
      let vehicleId = null;
      const availableVehicle = await this.prisma.vehicle.findFirst({
        where: { status: 'AVAILABLE' }
      });
      if (availableVehicle) {
        vehicleId = availableVehicle.id;
        await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'ASSIGNED' } });
      }

      let areaId = '';
      if (schedule.zoneId) {
        const zone = await this.prisma.serviceZone.findUnique({where: {id: schedule.zoneId}});
        if (zone) areaId = zone.areaId;
      }

      const da = await this.prisma.dailyAssignment.create({
        data: {
           assignmentDate: tomorrow,
           wasteType: schedule.wasteType,
           shiftId: schedule.shiftId,
           areaId: areaId,
           serviceZoneId: schedule.zoneId || '',
           status: teamId ? 'ASSIGNED' : 'CREATED',
           generationSource: 'AUTOMATIC',
           priority: 'NORMAL',
           teamId,
           vehicleId
        }
      });
      
      if (schedule.zoneId) {
        const bins = await this.prisma.bin.findMany({
          where: { type: schedule.wasteType, collectionPoint: { serviceZoneId: schedule.zoneId } }
        });
        
        for (const bin of bins) {
          await this.prisma.dailyAssignmentTarget.create({
            data: {
              assignmentId: da.id,
              collectionPointId: bin.collectionPointId,
              binId: bin.id,
              status: 'PENDING'
            }
          });
        }
      }
      createdCount++;
    }
    
    this.logger.log(`Nightly assignment generation completed. Created ${createdCount} assignments.`);
  }
}
