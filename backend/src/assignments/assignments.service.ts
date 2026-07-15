import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
                  status: AssignmentStatus.PLANNED,
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

  // GET Assignments for a Worker Dashboard today
  async getWorkerTodayAssignments(userId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find worker profile
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found.');
    }

    // Find worker's current active team membership
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        workerId: workerProfile.id,
        effectiveFrom: { lte: new Date() },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: new Date() } },
        ],
      },
    });

    if (!membership) {
      return [];
    }

    // Find worker's active shift assignments for today
    const shiftAssignments = await this.prisma.workerShiftAssignment.findMany({
      where: {
        workerId: workerProfile.id,
        workDate: today,
        status: { in: [WorkerShiftStatus.ASSIGNED, WorkerShiftStatus.CONFIRMED] },
      },
    });
    const shiftIds = shiftAssignments.map((s) => s.shiftId);

    // Fetch assignments for the team and shifts today
    const team = await this.prisma.collectionTeam.findUnique({ where: { id: membership.teamId } });
    if (!team) return [];

    const assignmentsList = await this.getAssignmentsList();
    const filtered = [];

    for (const assign of assignmentsList) {
      if (assign.teamName !== team.name) continue;
      if (new Date(assign.assignmentDate).getTime() !== today.getTime()) continue;

      const shift = await this.prisma.shift.findFirst({ where: { name: assign.shiftName } });
      if (shift && shiftIds.includes(shift.id)) {
        filtered.push(assign);
      }
    }

    return filtered;
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

    if (assignment.status !== AssignmentStatus.READY && assignment.status !== AssignmentStatus.PLANNED) {
      throw new BadRequestException(`Cannot start assignment in status: ${assignment.status}`);
    }

    // Resolve worker profile
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found.');
    }

    // Verify worker belongs to assignment's team
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

    // Validate operational date: today's date in local time
    const todayStr = this.getLocalDateString(new Date(), 'Asia/Kolkata');
    const assignDateStr = this.getLocalDateString(assignment.assignmentDate, 'Asia/Kolkata');
    if (todayStr !== assignDateStr) {
      throw new BadRequestException('Assignment date is not operationally valid for today.');
    }

    // Verify shift eligibility
    const shiftAssignment = await this.prisma.workerShiftAssignment.findFirst({
      where: {
        workerId: workerProfile.id,
        shiftId: assignment.shiftId,
        workDate: assignment.assignmentDate,
        status: { in: [WorkerShiftStatus.ASSIGNED, WorkerShiftStatus.CONFIRMED] },
      },
    });
    if (!shiftAssignment) {
      throw new ForbiddenException('Worker is not assigned to this shift for this date.');
    }

    const updated = await this.prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.IN_PROGRESS,
        startedAt: new Date(),
        startedById: workerProfile.id,
      },
    });

    await this.auditService.log(userId, 'ASSIGNMENT_STARTED', ip, ua, { assignmentId });

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
      include: { targets: true },
    });

    await this.auditService.log(userId, 'ASSIGNMENT_COMPLETED', ip, ua, { assignmentId });

    // Derive summary metrics
    const nonCancelled = updated.targets.filter((t) => t.status !== TargetStatus.CANCELLED);
    const collected = nonCancelled.filter((t) => t.status === TargetStatus.COLLECTED).length;
    const missed = nonCancelled.filter((t) => t.status === TargetStatus.MISSED).length;
    const skipped = nonCancelled.filter((t) => t.status === TargetStatus.SKIPPED).length;
    const completionRate = nonCancelled.length > 0 ? (collected / nonCancelled.length) * 100 : 100;

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
    today.setUTCHours(0, 0, 0, 0);

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
        assignmentDate: today,
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
}

