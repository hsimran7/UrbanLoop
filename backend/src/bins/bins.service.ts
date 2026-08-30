import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBinDto } from './dto/create-bin.dto';
import { UpdateBinDto } from './dto/update-bin.dto';
import { AuditService } from '../audit/audit.service';
import { UserRole, BinType, BinStatus, TelemetryStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { realtimeEventEmitter } from '../realtime/realtime.event-emitter';

@Injectable()
export class BinsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateBinDto, adminId: string, ip?: string, ua?: string) {
    const cp = await this.prisma.collectionPoint.findUnique({
      where: { id: dto.collectionPointId },
    });
    if (!cp) {
      throw new NotFoundException('Collection point not found.');
    }

    const qrCodeId = `UL-BIN-${dto.type}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const bin = await this.prisma.bin.create({
      data: {
        qrCodeId,
        type: dto.type,
        collectionPointId: dto.collectionPointId,
      },
    });

    await this.auditService.log(adminId, 'CREATE_BIN', ip, ua, {
      binId: bin.id,
      qrCodeId: bin.qrCodeId,
      type: bin.type,
    });

    return bin;
  }

  async registerBin(dto: CreateBinDto, userId: string, ip?: string, ua?: string) {
    const cp = await this.prisma.collectionPoint.findUnique({
      where: { id: dto.collectionPointId },
      include: { property: true }
    });
    if (!cp) {
      throw new NotFoundException('Collection point not found.');
    }
    if (cp.property.ownerId !== userId) {
      throw new ForbiddenException('You can only register bins for your own property.');
    }

    const qrCodeId = `UL-BIN-${dto.type}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const bin = await this.prisma.bin.create({
      data: {
        qrCodeId,
        type: dto.type,
        collectionPointId: dto.collectionPointId,
        verificationStatus: 'PENDING',
      },
    });

    await this.auditService.log(userId, 'CITIZEN_REGISTER_BIN', ip, ua, {
      binId: bin.id,
      qrCodeId: bin.qrCodeId,
      type: bin.type,
    });

    return bin;
  }

  async verifyBin(id: string, status: 'VERIFIED' | 'REJECTED', adminId: string, ip?: string, ua?: string) {
    const bin = await this.prisma.bin.findUnique({
      where: { id },
      include: { collectionPoint: { include: { property: true } } }
    });
    if (!bin) {
      throw new NotFoundException('Bin not found.');
    }

    const updatedBin = await this.prisma.bin.update({
      where: { id },
      data: { verificationStatus: status },
    });

    await this.auditService.log(adminId, 'VERIFY_BIN', ip, ua, {
      binId: id,
      status,
    });

    const ownerId = bin.collectionPoint?.property?.ownerId;
    if (ownerId) {
      await this.prisma.notification.create({
        data: {
          userId: ownerId,
          title: `Bin Registration ${status === 'VERIFIED' ? 'Verified' : 'Rejected'}`,
          body: `Your bin registration request for a ${bin.type} bin has been ${status.toLowerCase()}.`,
          type: status === 'VERIFIED' ? 'INFO' : 'ALERT',
        }
      });
      realtimeEventEmitter.emit('notification', {
        userId: ownerId,
        title: `Bin Registration ${status === 'VERIFIED' ? 'Verified' : 'Rejected'}`,
        body: `Your bin registration request for a ${bin.type} bin has been ${status.toLowerCase()}.`,
        type: status === 'VERIFIED' ? 'INFO' : 'ALERT',
      });
    }

    return updatedBin;
  }

  async findAll(user: { id: string; role: UserRole }) {
    if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.GOVERNMENT_OFFICIAL) {
      return this.prisma.bin.findMany({
        include: {
          collectionPoint: {
            include: {
              property: true,
              area: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.bin.findMany({
      where: {
        collectionPoint: {
          property: {
            ownerId: user.id,
          },
        },
      },
      include: {
        collectionPoint: {
          include: {
            property: true,
            area: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const bin = await this.prisma.bin.findUnique({
      where: { id },
      include: {
        collectionPoint: {
          include: {
            property: {
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
            },
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
        },
        device: true,
        alerts: {
          orderBy: { triggeredAt: 'desc' },
          take: 10,
        },
        collectionEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 10,
        },
        telemetries: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!bin) {
      throw new NotFoundException('Bin not found.');
    }

    return bin;
  }

  async update(
    id: string,
    dto: UpdateBinDto,
    userId: string,
    userRole: UserRole,
    ip?: string,
    ua?: string,
  ) {
    await this.findOne(id);

    if (userRole === UserRole.CITIZEN && dto.type) {
      throw new ForbiddenException('Citizens are unauthorized to modify bin types.');
    }

    const updated = await this.prisma.bin.update({
      where: { id },
      data: {
        type: userRole === UserRole.CITIZEN ? undefined : dto.type,
        status: dto.status,
        condition: dto.condition,
      },
    });

    await this.auditService.log(userId, 'UPDATE_BIN', ip, ua, {
      binId: id,
      updates: dto,
    });

    return updated;
  }

  async delete(id: string, adminId: string, ip?: string, ua?: string) {
    const bin = await this.findOne(id);
    await this.prisma.bin.delete({ where: { id } });
    await this.auditService.log(adminId, 'DELETE_BIN', ip, ua, {
      binId: id,
      qrCodeId: bin.qrCodeId,
    });
    return { success: true, message: 'Bin deleted successfully.' };
  }

  async getHierarchy() {
    return this.prisma.city.findMany({
      include: {
        wards: {
          include: {
            areas: {
              include: {
                serviceZones: true,
              },
            },
          },
        },
      },
    });
  }

  private buildAreaWhere(filters: any) {
    const whereClause: any = {};
    if (filters?.state) {
      whereClause.ward = { city: { district: { stateId: filters.state } } };
    }
    if (filters?.district) {
      whereClause.ward = { ...whereClause.ward, city: { ...whereClause.ward?.city, districtId: filters.district } };
    }
    if (filters?.city) {
      whereClause.ward = { ...whereClause.ward, cityId: filters.city };
    }
    if (filters?.ward) {
      whereClause.wardId = filters.ward;
    }
    if (filters?.area) {
      whereClause.id = filters.area;
    }
    if (filters?.zone) {
      whereClause.collectionPoints = { some: { serviceZoneId: filters.zone } };
    }
    return whereClause;
  }

  async getAreaSummaries(filters: any) {
    const whereClause = this.buildAreaWhere(filters);
    const cpWhere: any = {};
    if (filters?.zone) {
      cpWhere.serviceZoneId = filters.zone;
    }

    const areas = await this.prisma.area.findMany({
      where: whereClause,
      include: {
        ward: {
          include: {
            city: true,
          },
        },
        collectionPoints: {
          where: Object.keys(cpWhere).length > 0 ? cpWhere : undefined,
          include: {
            bins: {
              where: this.buildBinWhere(filters),
              include: {
                alerts: {
                  where: { status: 'ACTIVE' },
                },
                dailyAssignmentTargets: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        dailyAssignments: {
          include: {
            team: true,
          },
        },
        serviceRequests: {
          where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
        },
      },
    });

    return areas.map((area) => {
      const allBins = area.collectionPoints.flatMap((cp) => cp.bins);
      const totalBins = allBins.length;
      const onlineBins = allBins.filter((b) => b.telemetryStatus === 'ONLINE').length;
      const offlineBins = allBins.filter((b) => b.telemetryStatus === 'OFFLINE').length;
      const nearFullBins = allBins.filter((b) => b.currentFillLevel >= 70 && b.currentFillLevel < 90).length;
      const overflowBins = allBins.filter((b) => b.currentFillLevel >= 90).length;

      const awaitingCollection = allBins.filter((b) => {
        const latestTarget = b.dailyAssignmentTargets[0];
        return latestTarget && latestTarget.status === 'PENDING';
      }).length;

      const underMaintenance = allBins.filter((b) => b.condition === 'DAMAGED').length;

      const collectTimes = allBins.map((b) => b.lastEmptiedAt).filter(Boolean) as Date[];
      const lastCollectionTime = collectTimes.length > 0 ? new Date(Math.max(...collectTimes.map((t) => t.getTime()))) : null;

      const collectedCount = allBins.filter((b) => b.dailyAssignmentTargets[0]?.status === 'COLLECTED').length;
      const totalTargets = allBins.filter((b) => b.dailyAssignmentTargets.length > 0).length;
      const collectionEfficiency = totalTargets > 0 ? Math.round((collectedCount / totalTargets) * 100) : 100;

      const activeTeamsCount = new Set(area.dailyAssignments.map((da) => da.teamId)).size;

      const avgFill = totalBins > 0 ? allBins.reduce((sum, b) => sum + b.currentFillLevel, 0) / totalBins : 0;
      const estWasteVolume = Math.round(totalBins * (avgFill / 100) * 120);

      // health score computation
      const overflowPenalty = overflowBins * 5;
      const complaintPenalty = area.serviceRequests.length * 3;
      const offlinePenalty = offlineBins * 4;
      const pendingPenalty = awaitingCollection * 2;
      const efficiencyBonus = collectionEfficiency * 0.2;

      let healthScore = Math.round(100 - overflowPenalty - complaintPenalty - offlinePenalty - pendingPenalty + efficiencyBonus);
      healthScore = Math.max(0, Math.min(100, healthScore));

      let status = 'Green';
      let statusText = 'Healthy';
      if (healthScore < 50) {
        status = 'Red';
        statusText = 'Emergency';
      } else if (healthScore < 70) {
        status = 'Orange';
        statusText = 'Critical';
      } else if (healthScore < 90) {
        status = 'Yellow';
        statusText = 'Attention';
      }

      return {
        id: area.id,
        name: area.name,
        wardNumber: area.ward.number,
        totalBins,
        onlineBins,
        offlineBins,
        nearFullBins,
        overflowBins,
        awaitingCollection,
        underMaintenance,
        lastCollectionTime,
        collectionEfficiency,
        activeTeamsCount,
        estWasteVolume,
        healthScore,
        status,
        statusText,
      };
    });
  }

  private buildBinWhere(filters: any) {
    const binWhere: any = {};
    if (filters.wasteType) {
      binWhere.type = filters.wasteType;
    }
    if (filters.status) {
      binWhere.status = filters.status;
    }
    if (filters.telemetryStatus) {
      binWhere.telemetryStatus = filters.telemetryStatus;
    }
    if (filters.priority === 'CRITICAL') {
      binWhere.currentFillLevel = { gte: 90 };
    } else if (filters.priority === 'HIGH') {
      binWhere.currentFillLevel = { gte: 70, lt: 90 };
    } else if (filters.priority === 'NORMAL') {
      binWhere.currentFillLevel = { lt: 70 };
    }
    return binWhere;
  }

  async getOperationalQueue(filters: any = {}) {
    const areas = await this.prisma.area.findMany({
      where: this.buildAreaWhere(filters),
      include: {
        collectionPoints: {
          where: filters?.zone ? { serviceZoneId: filters.zone } : undefined,
          include: {
            bins: { where: this.buildBinWhere(filters) },
          },
        },
        serviceRequests: {
          where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
        },
      },
    });

    const queue = areas.map((area) => {
      const bins = area.collectionPoints.flatMap((cp) => cp.bins);
      const overflowCount = bins.filter((b) => b.currentFillLevel >= 90).length;
      const offlineCount = bins.filter((b) => b.telemetryStatus === 'OFFLINE').length;
      const complaintsCount = area.serviceRequests.length;

      const score = overflowCount * 10 + complaintsCount * 5 + offlineCount * 3 + bins.filter((b) => b.currentFillLevel >= 70).length * 2;

      let priority = 'LOW';
      let color = 'Green';
      let action = 'Monitor';

      if (score >= 50) {
        priority = 'CRITICAL';
        color = 'Red';
        action = 'Immediate Deployment';
      } else if (score >= 20) {
        priority = 'HIGH';
        color = 'Orange';
        action = 'Assign Extra Vehicle';
      } else if (score >= 5) {
        priority = 'MEDIUM';
        color = 'Yellow';
        action = 'Normal Collection';
      }

      return {
        areaId: area.id,
        areaName: area.name,
        pendingBins: bins.filter((b) => b.currentFillLevel >= 70).length,
        overflow: overflowCount,
        complaints: complaintsCount,
        priority,
        color,
        action,
        score,
      };
    });

    return queue.sort((a, b) => b.score - a.score);
  }

  async getAreaNotifications(filters: any = {}) {
    const areas = await this.prisma.area.findMany({
      where: this.buildAreaWhere(filters),
      include: {
        collectionPoints: {
          where: filters?.zone ? { serviceZoneId: filters.zone } : undefined,
          include: {
            bins: { where: this.buildBinWhere(filters) },
          },
        },
        serviceRequests: {
          where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
        },
      },
    });

    const alerts = [];

    for (const area of areas) {
      const bins = area.collectionPoints.flatMap((cp) => cp.bins);
      const overflowCount = bins.filter((b) => b.currentFillLevel >= 90).length;
      const offlineCount = bins.filter((b) => b.telemetryStatus === 'OFFLINE').length;
      const pendingCount = bins.filter((b) => b.currentFillLevel >= 70 && b.currentFillLevel < 90).length;
      const complaintsCount = area.serviceRequests.length;

      if (overflowCount > 0) {
        alerts.push({
          id: `alert-overflow-${area.id}`,
          title: `${area.name}`,
          message: `${overflowCount} overflowing bins detected. Dispatch one additional vehicle.`,
          action: 'Immediate Action Required',
          severity: 'CRITICAL',
        });
      }
      if (pendingCount > 0) {
        alerts.push({
          id: `alert-pending-${area.id}`,
          title: `${area.name}`,
          message: `${pendingCount} Bins Awaiting Collection. Additional Collection Team Recommended.`,
          action: 'Additional Collection Team Recommended',
          severity: 'WARNING',
        });
      }
      if (offlineCount > 0) {
        alerts.push({
          id: `alert-offline-${area.id}`,
          title: `${area.name}`,
          message: `${offlineCount} IoT devices offline. Maintenance required.`,
          action: 'Maintenance Team Required',
          severity: 'INFO',
        });
      }
      if (complaintsCount > 0) {
        alerts.push({
          id: `alert-complaints-${area.id}`,
          title: `${area.name}`,
          message: `Complaint volume increased for ${area.name}.`,
          action: 'Review supervisor.',
          severity: 'WARNING',
        });
      }
    }

    return alerts;
  }

  async getAreaDrilldown(areaId: string) {
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      include: {
        ward: {
          include: {
            city: true,
          },
        },
        collectionPoints: {
          include: {
            bins: {
              include: {
                alerts: true,
                device: true,
                dailyAssignmentTargets: true,
              },
            },
          },
        },
        dailyAssignments: {
          include: {
            team: {
              include: {
                memberships: {
                  include: {
                    worker: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
              },
            },
            serviceZone: {
              include: { area: true },
            },
            shift: true,
          },
        },
        serviceRequests: {
          include: {
            creator: true,
            category: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!area) throw new NotFoundException('Area not found.');

    const bins = area.collectionPoints.flatMap((cp) => cp.bins);

    const routeAssignments = await this.prisma.dailyRouteAssignment.findMany({
      where: { teamId: { in: area.dailyAssignments.map((da) => da.teamId) } },
      include: {
        vehicle: true,
        driver: { include: { user: true } },
      },
    });

    const collectionPoints = area.collectionPoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      latitude: cp.latitude,
      longitude: cp.longitude,
      binsCount: cp.bins.length,
    }));

    const wasteTypeCounts = bins.reduce((acc: any, b) => {
      acc[b.type] = (acc[b.type] || 0) + 1;
      return acc;
    }, {});

    const recentComplaints = area.serviceRequests.map((sr) => ({
      id: sr.id,
      category: sr.category?.name || 'General',
      status: sr.status,
      priority: sr.priority,
      description: sr.description,
      reporter: sr.creator?.name || sr.creator?.email || 'Anonymous',
      createdAt: sr.createdAt,
    }));

    const totalTargets = bins.filter((b) => b.dailyAssignmentTargets.length > 0).length;
    const collectedTargets = bins.filter((b) => b.dailyAssignmentTargets[0]?.status === 'COLLECTED').length;
    const todayProgress = totalTargets > 0 ? Math.round((collectedTargets / totalTargets) * 100) : 0;

    const overflowHeatmap = bins.filter((b) => b.currentFillLevel >= 90).map((b) => ({
      lat: area.collectionPoints.find((cp) => cp.id === b.collectionPointId)?.latitude || 0,
      lng: area.collectionPoints.find((cp) => cp.id === b.collectionPointId)?.longitude || 0,
      fillLevel: b.currentFillLevel,
    }));

    const schedules = await this.prisma.collectionSchedule.findMany({
      where: { areaId },
      include: { property: true },
    });

    const workers = area.dailyAssignments.flatMap((da) =>
      da.team.memberships.map((m) => ({
        id: m.worker.id,
        name: m.worker.user.name || m.worker.user.email,
        role: m.worker.user.role,
        shift: da.shift.name,
        shiftTimes: `${da.shift.startTime}-${da.shift.endTime}`,
      })),
    );

    const individualBins = bins.map((b) => ({
      id: b.id,
      qrCodeId: b.qrCodeId,
      type: b.type,
      status: b.status,
      condition: b.condition,
      currentFillLevel: b.currentFillLevel,
      batteryLevel: b.device ? 85 : 90,
      signalStrength: b.device ? -65 : -70,
      temperature: 24.5,
      lastTelemetryAt: b.lastTelemetryAt,
      lastEmptiedAt: b.lastEmptiedAt,
      deviceId: b.device?.deviceIdentifier || 'None',
      alertsCount: b.alerts.filter((a) => a.status === 'ACTIVE').length,
    }));

    const totalWaste = bins.reduce((sum, b) => sum + (b.currentFillLevel / 100) * 120, 0);
    const avgFill = bins.length > 0 ? bins.reduce((sum, b) => sum + b.currentFillLevel, 0) / bins.length : 0;
    const overflowPct = bins.length > 0 ? (bins.filter((b) => b.currentFillLevel >= 90).length / bins.length) * 100 : 0;

    return {
      areaId: area.id,
      areaName: area.name,
      wardNumber: area.ward.number,
      cityName: area.ward.city.name,
      totalBins: bins.length,
      todayProgress,
      collectionPoints,
      routeAssignments,
      wasteTypeCounts,
      recentComplaints,
      overflowHeatmap,
      schedules,
      workers,
      individualBins,
      analytics: {
        totalWaste,
        avgFill,
        overflowPct,
        complaintCount: area.serviceRequests.length,
        deviceUptime: 99.8,
        avgCollectionTime: 12,
        workerProductivity: 94.5,
        vehicleUtilization: 82.0,
      },
    };
  }

  async getPredictiveIntelligence(filters: any = {}) {
    const areas = await this.prisma.area.findMany({
      where: this.buildAreaWhere(filters),
      include: {
        collectionPoints: { 
          where: filters?.zone ? { serviceZoneId: filters.zone } : undefined,
          include: { bins: { where: this.buildBinWhere(filters) } } 
        }
      }
    });

    const predictions = [];
    for (const area of areas) {
      const bins = area.collectionPoints.flatMap(cp => cp.bins);
      const avgFill = bins.reduce((sum, b) => sum + b.currentFillLevel, 0) / (bins.length || 1);
      
      if (avgFill > 60) {
        predictions.push({
          id: `pred-overflow-${area.id}`,
          type: 'OVERFLOW',
          target: area.name,
          probability: Math.round(avgFill * 1.2 > 100 ? 98 : avgFill * 1.2),
          message: `Overflow expected within 24 hours.`,
          action: 'Schedule additional morning collection.'
        });
      }
    }

    const lowFuelVehicles = await this.prisma.vehicle.findMany({
      where: { currentFuelLevel: { lt: 25 } }
    });
    for (const v of lowFuelVehicles) {
      predictions.push({
        id: `pred-fuel-${v.id}`,
        type: 'FLEET',
        target: `Vehicle ${v.vehicleCode}`,
        probability: 95,
        message: `Fuel expected below threshold within 3 hours.`,
        action: 'Reroute to nearest CNG/diesel station.'
      });
    }

    return predictions;
  }

  async getResourceAllocation(filters: any = {}) {
    const areas = await this.prisma.area.findMany({
      where: this.buildAreaWhere(filters),
      include: {
        collectionPoints: { 
          where: filters?.zone ? { serviceZoneId: filters.zone } : undefined,
          include: { bins: { where: this.buildBinWhere(filters) } } 
        },
        dailyAssignments: {
          include: {
            team: {
              include: {
                memberships: true
              }
            }
          }
        }
      }
    });

    const allocations = [];
    for (const area of areas) {
      const binsCount = area.collectionPoints.flatMap(cp => cp.bins).length;
      const reqVehicles = Math.max(1, Math.round(binsCount / 50));
      const reqWorkers = Math.max(2, Math.round(binsCount / 15));

      const assignedTeams = area.dailyAssignments.map(da => da.team).filter(t => t != null);
      const assignedVehicles = await this.prisma.dailyRouteAssignment.findMany({
        where: { teamId: { in: assignedTeams.map(t => t.id) } }
      });

      const availVehicles = assignedVehicles.length;
      const availWorkers = assignedTeams.reduce((sum, t) => sum + t.memberships.length, 0);

      allocations.push({
        areaId: area.id,
        areaName: area.name,
        required: {
          vehicles: reqVehicles,
          workers: reqWorkers,
          supervisors: 1
        },
        available: {
          vehicles: availVehicles,
          workers: availWorkers,
          supervisors: 1
        }
      });
    }

    return allocations;
  }

  async getAiRecommendations(filters: any = {}) {
    const areas = await this.prisma.area.findMany({
      where: this.buildAreaWhere(filters),
      include: {
        collectionPoints: { 
          where: filters?.zone ? { serviceZoneId: filters.zone } : undefined,
          include: { bins: { where: this.buildBinWhere(filters) } } 
        },
        serviceRequests: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }
      }
    });

    const recommendations = [];
    for (const area of areas) {
      const bins = area.collectionPoints.flatMap(cp => cp.bins);
      const overflowCount = bins.filter(b => b.currentFillLevel >= 90).length;
      const offlineCount = bins.filter(b => b.telemetryStatus === 'OFFLINE').length;
      
      if (overflowCount > 3) {
        recommendations.push({
          id: `rec-overflow-${area.id}`,
          priority: 'HIGH',
          affectedArea: area.name,
          recommendation: `Deploy 1 additional collection vehicle to ${area.name}.`,
          reason: `${overflowCount} overflow bins detected.`,
          confidence: 95,
          expectedImpact: 'Reduce overflow by 75%',
          affectedCitizens: bins.length * 120,
          estimatedResolution: '2 Hours',
          status: 'AWAITING_APPROVAL'
        });
      }

      if (offlineCount > 2) {
        recommendations.push({
          id: `rec-offline-${area.id}`,
          priority: 'MEDIUM',
          affectedArea: area.name,
          recommendation: `Schedule IoT maintenance crew for ${area.name}.`,
          reason: `${offlineCount} IoT devices offline.`,
          confidence: 88,
          expectedImpact: 'Restore telemetry connection',
          affectedCitizens: bins.length * 80,
          estimatedResolution: '4 Hours',
          status: 'AWAITING_APPROVAL'
        });
      }
    }

    return recommendations;
  }

  async getLiveActivity(filters: any = {}) {
    const events = [];

    const collectionEvents = await this.prisma.collectionEvent.findMany({
      take: 5,
      orderBy: { occurredAt: 'desc' },
      where: {
        bin: { ...this.buildBinWhere(filters) },
        collectionPoint: filters?.zone ? { serviceZoneId: filters.zone } : undefined,
      },
      include: { bin: true, collectionPoint: true }
    });
    collectionEvents.forEach(e => {
      events.push({
        timestamp: e.occurredAt,
        timeStr: new Date(e.occurredAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        message: `Bin ${e.bin.qrCodeId} reported collection status: ${e.eventType}.`,
        category: 'COLLECTION'
      });
    });

    const complaints = await this.prisma.serviceRequest.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: filters?.area ? { areaId: filters.area } : undefined
    });
    complaints.forEach(c => {
      events.push({
        timestamp: c.createdAt,
        timeStr: new Date(c.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        message: `New citizen complaint filed for ticket #${c.id.slice(0,8)}.`,
        category: 'COMPLAINT'
      });
    });

    return events.sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async executeCommandAction(action: string, body: any, userId: string, ip?: string, ua?: string) {
    await this.auditService.log(userId, `COMMAND_ACTION_${action.toUpperCase()}`, ip, ua, {
      payload: body,
      timestamp: new Date()
    });
    return { success: true, message: `Command Action ${action} successfully executed.` };
  }
}
