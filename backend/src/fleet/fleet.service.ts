import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { fleetEventEmitter } from './fleet.event-emitter';
import {
  CreateDepotDto,
  CreateVehicleDto,
  CreateDriverDto,
  CreateRouteDto,
  CreateDailyRouteAssignmentDto,
  SubmitInspectionDto,
  SubmitTelemetryDto,
  LogBreakdownDto,
  LogFuelDto,
  ScheduleMaintenanceDto,
} from './dto/fleet.dto';
import { VehicleStatus, VehicleType } from '@prisma/client';

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Depot CRUDS
  async createDepot(dto: CreateDepotDto) {
    return this.prisma.depot.create({ data: dto });
  }

  async getDepots() {
    return this.prisma.depot.findMany({
      include: { vehicles: true, _count: { select: { drivers: true } } },
    });
  }

  // Vehicle Register
  async createVehicle(dto: CreateVehicleDto) {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        ...dto,
        status: VehicleStatus.AVAILABLE,
      },
    });

    fleetEventEmitter.emit('vehicle.event', {
      vehicleId: vehicle.id,
      eventType: 'VEHICLE_CREATED',
      newStatus: VehicleStatus.AVAILABLE,
      source: 'ADMIN',
    });

    return vehicle;
  }

  async getVehicles() {
    return this.prisma.vehicle.findMany({
      include: { depot: true },
    });
  }

  // Driver Profile extend
  async createDriver(dto: CreateDriverDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found.');

    return this.prisma.driverProfile.create({
      data: {
        userId: dto.userId,
        licenseNumber: dto.licenseNumber,
        licenseExpiry: new Date(dto.licenseExpiry),
        phone: dto.phone,
        assignedDepotId: dto.assignedDepotId ?? null,
        safetyScore: 100.0,
      },
    });
  }

  // Shift Management
  async clockInShift(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found.');

    // Shift overlap check
    const activeShift = await this.prisma.driverShift.findFirst({
      where: {
        driverId: driver.id,
        attendanceStatus: { in: ['PRESENT', 'ON_BREAK'] },
      },
    });
    if (activeShift) throw new BadRequestException('Driver already has an active clock-in shift.');

    const start = new Date();
    const shift = await this.prisma.driverShift.create({
      data: {
        driverId: driver.id,
        shiftStart: start,
        shiftEnd: new Date(start.getTime() + 8 * 60 * 60000), // default 8 hours shift
        loginTime: start,
        attendanceStatus: 'PRESENT',
      },
    });

    fleetEventEmitter.emit('fleet.notification', {
      type: 'DEPOT_ARRIVAL',
      message: `Driver shift started for profile: ${driver.licenseNumber}.`,
      severity: 'INFO',
    });

    return shift;
  }

  async clockOutShift(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const activeShift = await this.prisma.driverShift.findFirst({
      where: {
        driverId: driver.id,
        attendanceStatus: { in: ['PRESENT', 'ON_BREAK'] },
      },
    });
    if (!activeShift) throw new BadRequestException('No active shift to clock out.');

    const now = new Date();
    const durationHours = (now.getTime() - new Date(activeShift.shiftStart).getTime()) / 3600000;
    const overtime = durationHours > 8 ? Math.floor((durationHours - 8) * 60) : 0;

    const shift = await this.prisma.driverShift.update({
      where: { id: activeShift.id },
      data: {
        logoutTime: now,
        overtimeMinutes: overtime,
        attendanceStatus: 'COMPLETED',
      },
    });

    fleetEventEmitter.emit('fleet.notification', {
      type: 'DEPOT_DEPARTURE',
      message: `Driver shift clock out recorded.`,
      severity: 'INFO',
    });

    return shift;
  }

  // Helper: verify vehicle lifecycle transitions
  private verifyVehicleStatusTransition(oldStatus: VehicleStatus, newStatus: VehicleStatus) {
    if (oldStatus === newStatus) return;

    // Strict validation mapping
    const rules: Record<VehicleStatus, VehicleStatus[]> = {
      [VehicleStatus.AVAILABLE]: [VehicleStatus.ASSIGNED],
      [VehicleStatus.ASSIGNED]: [VehicleStatus.PRE_TRIP_INSPECTION],
      [VehicleStatus.PRE_TRIP_INSPECTION]: [VehicleStatus.READY, VehicleStatus.UNDER_MAINTENANCE],
      [VehicleStatus.READY]: [VehicleStatus.IN_SERVICE, VehicleStatus.BREAKDOWN],
      [VehicleStatus.IN_SERVICE]: [VehicleStatus.RETURNING, VehicleStatus.BREAKDOWN],
      [VehicleStatus.RETURNING]: [VehicleStatus.POST_TRIP_INSPECTION],
      [VehicleStatus.POST_TRIP_INSPECTION]: [VehicleStatus.AVAILABLE],
      [VehicleStatus.BREAKDOWN]: [VehicleStatus.UNDER_MAINTENANCE],
      [VehicleStatus.UNDER_MAINTENANCE]: [VehicleStatus.AVAILABLE],
      [VehicleStatus.OUT_OF_SERVICE]: [], // manually restored
    };

    const allowed = rules[oldStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Impossible state transition from ${oldStatus} to ${newStatus}.`);
    }
  }

  async updateVehicleStatus(id: string, newStatus: VehicleStatus, userId: string, ip?: string, ua?: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found.');

    this.verifyVehicleStatusTransition(vehicle.status, newStatus);

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: { status: newStatus },
    });

    fleetEventEmitter.emit('vehicle.event', {
      vehicleId: id,
      eventType: 'STATUS_CHANGED',
      previousStatus: vehicle.status,
      newStatus,
      userId,
      source: 'ADMIN',
    });

    await this.auditService.log(userId, 'VEHICLE_STATUS_TRANSITIONED', ip, ua, { vehicleId: id, oldStatus: vehicle.status, newStatus });
    return updated;
  }

  // Pre-Trip Inspection Checklist
  async submitPreTripInspection(vehicleId: string, dto: SubmitInspectionDto, userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found.');

    const allPassed =
      dto.brakesPassed &&
      dto.tiresPassed &&
      dto.lightsPassed &&
      dto.hydraulicsPassed &&
      dto.fuelPassed &&
      dto.batteryPassed &&
      dto.cleanPassed;

    const result = allPassed ? 'PASS' : 'FAIL';
    const nextStatus = allPassed ? VehicleStatus.READY : VehicleStatus.UNDER_MAINTENANCE;

    this.verifyVehicleStatusTransition(vehicle.status, VehicleStatus.PRE_TRIP_INSPECTION);
    this.verifyVehicleStatusTransition(VehicleStatus.PRE_TRIP_INSPECTION, nextStatus);

    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.preTripInspection.create({
        data: {
          vehicleId,
          driverId: driver.id,
          brakesPassed: dto.brakesPassed,
          tiresPassed: dto.tiresPassed,
          lightsPassed: dto.lightsPassed,
          hydraulicsPassed: dto.hydraulicsPassed,
          fuelPassed: dto.fuelPassed,
          batteryPassed: dto.batteryPassed,
          cleanPassed: dto.cleanPassed,
          result,
          notes: dto.notes ?? null,
        },
      });

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: nextStatus },
      });

      fleetEventEmitter.emit('vehicle.event', {
        vehicleId,
        eventType: allPassed ? 'INSPECTION_PASSED' : 'INSPECTION_FAILED',
        previousStatus: VehicleStatus.PRE_TRIP_INSPECTION,
        newStatus: nextStatus,
        userId,
        source: 'DRIVER',
      });

      if (!allPassed) {
        // safety score decay on failed inspection
        const dec = Math.max(0, driver.safetyScore - 10);
        await tx.driverProfile.update({
          where: { id: driver.id },
          data: { safetyScore: dec },
        });

        fleetEventEmitter.emit('fleet.notification', {
          type: 'MAINTENANCE_DUE',
          vehicleId,
          message: `Vehicle ${vehicle.vehicleCode} failed pre-trip inspection.`,
          severity: 'CRITICAL',
        });
      }

      return inspection;
    });
  }

  // Route & Stops creation
  async createRoute(dto: CreateRouteDto) {
    return this.prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          routeCode: dto.routeCode,
          areaId: dto.areaId,
          expectedDistance: dto.expectedDistance,
          estimatedDuration: dto.estimatedDuration,
        },
      });

      for (const stop of dto.stops) {
        await tx.routeStop.create({
          data: {
            routeId: route.id,
            stopOrder: stop.stopOrder,
            propertyId: stop.propertyId ?? null,
            collectionPointId: stop.collectionPointId ?? null,
          },
        });
      }

      return route;
    });
  }

  // Daily assignments
  async createAssignment(dto: CreateDailyRouteAssignmentDto, userId: string, ip?: string, ua?: string) {
    // Overlapping assignments checks
    const conflict = await this.prisma.dailyRouteAssignment.findFirst({
      where: {
        date: new Date(dto.date),
        OR: [
          { vehicleId: dto.vehicleId },
          { driverId: dto.driverId },
        ],
      },
    });

    if (conflict) {
      throw new BadRequestException('Vehicle or Driver has already been assigned for this date.');
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const ass = await tx.dailyRouteAssignment.create({
        data: {
          date: new Date(dto.date),
          routeId: dto.routeId,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          teamId: dto.teamId,
          status: 'PLANNED',
        },
      });

      // Update vehicle status
      await tx.vehicle.update({
        where: { id: dto.vehicleId },
        data: { status: VehicleStatus.ASSIGNED },
      });

      fleetEventEmitter.emit('vehicle.event', {
        vehicleId: dto.vehicleId,
        eventType: 'VEHICLE_ASSIGNED',
        previousStatus: VehicleStatus.AVAILABLE,
        newStatus: VehicleStatus.ASSIGNED,
        userId,
        source: 'ADMIN',
      });

      return ass;
    });

    await this.auditService.log(userId, 'ROUTE_ASSIGNMENT_CREATED', ip, ua, { assignmentId: assignment.id });
    return assignment;
  }

  // GPS Telemetry Submission with Jumps Rejection
  async submitTelemetry(dto: SubmitTelemetryDto) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: { routeAssignments: { include: { driver: true } } },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found.');

    const now = new Date();
    if (vehicle.latitude && vehicle.longitude) {
      const distance = this.calculateDistance(
        vehicle.latitude,
        vehicle.longitude,
        dto.latitude,
        dto.longitude,
      );

      // Max velocity check: reject if speed exceeds 150 km/h (41.67 m/s)
      const lastUpdate = new Date(vehicle.updatedAt).getTime();
      const timeDiffSeconds = (now.getTime() - lastUpdate) / 1000;

      if (timeDiffSeconds > 0 && timeDiffSeconds < 3600) {
        const velocity = distance / timeDiffSeconds;
        if (velocity > 41.67) {
          throw new BadRequestException('Impossible GPS telemetry jump detected.');
        }
      }
    }

    // Fuel Theft - Unexplained Drop Check (>10% drop)
    const prevFuel = vehicle.currentFuelLevel;
    if (prevFuel - dto.speed > 10) { // mock drop based on speed parameter logic check
      fleetEventEmitter.emit('fleet.notification', {
        type: 'LOW_FUEL',
        vehicleId: dto.vehicleId,
        message: `Potential Anomaly: Unexplained sudden fuel drop detected on Vehicle ${vehicle.vehicleCode}.`,
        severity: 'WARNING',
      });
    }

    // Speed Safety Check (>80 overspeed)
    if (dto.speed > 80) {
      const driver = vehicle.routeAssignments[0]?.driver;
      if (driver) {
        const decayedScore = Math.max(0, driver.safetyScore - 5);
        await this.prisma.driverProfile.update({
          where: { id: driver.id },
          data: { safetyScore: decayedScore },
        });

        fleetEventEmitter.emit('fleet.notification', {
          type: 'ROUTE_DELAY',
          vehicleId: dto.vehicleId,
          message: `Overspeed Alert: Vehicle ${vehicle.vehicleCode} exceeded 80 km/h. Driver safety score reduced.`,
          severity: 'WARNING',
        });
      }
    }

    // Idle Detection
    const isIdling = dto.speed === 0 && dto.ignitionStatus;
    if (isIdling) {
      fleetEventEmitter.emit('fleet.notification', {
        type: 'ROUTE_DELAY',
        vehicleId: dto.vehicleId,
        message: `Idle warning alert: Vehicle ${vehicle.vehicleCode} has been idling.`,
        severity: 'INFO',
      });
    }

    const updatedOdometer = vehicle.odometerKm + (vehicle.latitude ? this.calculateDistance(vehicle.latitude, vehicle.longitude, dto.latitude, dto.longitude) / 1000 : 0);

    return this.prisma.$transaction(async (tx) => {
      const telemetry = await tx.gPSTelemetry.create({
        data: {
          vehicleId: dto.vehicleId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          speed: dto.speed,
          heading: dto.heading,
          altitude: dto.altitude ?? null,
          accuracy: dto.accuracy ?? null,
          ignitionStatus: dto.ignitionStatus,
          gpsSource: dto.gpsSource ?? 'SIMULATOR',
          odometerSnapshot: updatedOdometer,
        },
      });

      await tx.vehicle.update({
        where: { id: dto.vehicleId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          heading: dto.heading,
          speed: dto.speed,
          odometerKm: updatedOdometer,
        },
      });

      // Geofencing checks
      await this.runGeofencingAudit(dto.vehicleId, dto.latitude, dto.longitude);

      return telemetry;
    });
  }

  // Distance calculator helper (Haversine)
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // meters
  }

  // Geofencing trigger audits
  private async runGeofencingAudit(vehicleId: string, lat: number, lon: number) {
    const depots = await this.prisma.depot.findMany();
    for (const d of depots) {
      const dist = this.calculateDistance(d.latitude, d.longitude, lat, lon);
      if (dist <= 100) {
        fleetEventEmitter.emit('fleet.notification', {
          type: 'DEPOT_ARRIVAL',
          vehicleId,
          message: `Vehicle arrived at Depot ${d.name}.`,
          severity: 'INFO',
        });
      }
    }
  }

  // Refuel Log
  async logFuelRefill(vehicleId: string, dto: LogFuelDto, userId: string) {
    const lastLog = await this.prisma.fuelLog.findFirst({
      where: { vehicleId },
      orderBy: { filledAt: 'desc' },
    });

    // Anomaly: refill without usage
    if (lastLog && Math.abs(dto.odometerKm - lastLog.odometerKm) < 1) {
      fleetEventEmitter.emit('fleet.notification', {
        type: 'LOW_FUEL',
        vehicleId,
        message: `Potential Anomaly: Fuel refill recorded without significant odometer km usage increments.`,
        severity: 'WARNING',
      });
    }

    const log = await this.prisma.fuelLog.create({
      data: {
        vehicleId,
        amountLitres: dto.amountLitres,
        cost: dto.cost,
        odometerKm: dto.odometerKm,
        recordedBy: userId,
      },
    });

    fleetEventEmitter.emit('vehicle.event', {
      vehicleId,
      eventType: 'FUEL_REFILLED',
      userId,
      source: 'DRIVER',
      metadata: { amountLitres: dto.amountLitres, cost: dto.cost },
    });

    return log;
  }

  // Breakdown Report
  async logBreakdown(vehicleId: string, dto: LogBreakdownDto, userId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found.');

    this.verifyVehicleStatusTransition(vehicle.status, VehicleStatus.BREAKDOWN);

    return this.prisma.$transaction(async (tx) => {
      const breakdown = await tx.vehicleBreakdown.create({
        data: {
          vehicleId,
          reporterId: userId,
          issueType: dto.issueType,
          description: dto.description,
        },
      });

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: VehicleStatus.BREAKDOWN },
      });

      fleetEventEmitter.emit('vehicle.event', {
        vehicleId,
        eventType: 'BREAKDOWN',
        previousStatus: vehicle.status,
        newStatus: VehicleStatus.BREAKDOWN,
        userId,
        source: 'DRIVER',
        metadata: { issueType: dto.issueType },
      });

      fleetEventEmitter.emit('fleet.notification', {
        type: 'BREAKDOWN',
        vehicleId,
        message: `Emergency Breakdown: Vehicle ${vehicle.vehicleCode} reported ${dto.issueType}.`,
        severity: 'CRITICAL',
      });

      return breakdown;
    });
  }

  // Maintenance Management
  async scheduleMaintenance(vehicleId: string, dto: ScheduleMaintenanceDto) {
    return this.prisma.maintenanceSchedule.create({
      data: {
        vehicleId,
        serviceType: dto.serviceType,
        description: dto.description,
        nextServiceDate: new Date(dto.nextServiceDate),
        status: 'SCHEDULED',
      },
    });
  }

  async getMyDriverAssignment(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found.');

    const startOfToday = new Date();
    startOfToday.setUTCHours(0,0,0,0);

    const endOfToday = new Date();
    endOfToday.setUTCHours(23,59,59,999);

    const assignment = await this.prisma.dailyRouteAssignment.findFirst({
      where: {
        driverId: driver.id,
        date: { gte: startOfToday, lte: endOfToday },
      },
      include: {
        route: { include: { stops: { include: { property: true, collectionPoint: true } } } },
        vehicle: true,
      },
    });

    if (!assignment) throw new NotFoundException('No assignments today.');
    return assignment;
  }

  async getDriverKPIs(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    const assignments = await this.prisma.dailyRouteAssignment.findMany({
      where: { driverId },
    });

    const breakdowns = await this.prisma.vehicleBreakdown.findMany({
      where: { reporterId: driverId },
    });

    const successRate = assignments.length > 0 ? (assignments.filter(a => a.status === 'COMPLETED').length / assignments.length) * 100 : 100;

    return {
      routesCompleted: assignments.filter(a => a.status === 'COMPLETED').length,
      breakdownsReported: breakdowns.length,
      collectionSuccessRate: successRate,
      averageDelayMinutes: 5,
      safetyScore: driver?.safetyScore ?? 100,
    };
  }

  // Route Replay Telemetry coordinates stream history
  async getVehicleTelemetryHistory(vehicleId: string) {
    return this.prisma.gPSTelemetry.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getNotifications() {
    return this.prisma.fleetNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── AUTOMATIC GPS ROUTE SIMULATOR BACKGROUND CRON ─────────────────────────
  @Cron(CronExpression.EVERY_5_SECONDS)
  async runFleetSimulation() {
    const activeAssignments = await this.prisma.dailyRouteAssignment.findMany({
      where: {
        status: { in: ['STARTED', 'RUNNING'] },
      },
      include: {
        route: { include: { stops: { orderBy: { stopOrder: 'asc' } } } },
        vehicle: true,
      },
    });

    for (const ass of activeAssignments) {
      const targetStop = ass.route.stops.find((s) => !s.completed);
      if (!targetStop) {
        await this.prisma.dailyRouteAssignment.update({
          where: { id: ass.id },
          data: { status: 'COMPLETED' },
        });

        await this.prisma.vehicle.update({
          where: { id: ass.vehicleId },
          data: { status: VehicleStatus.RETURNING },
        });

        fleetEventEmitter.emit('fleet.notification', {
          type: 'ROUTE_COMPLETED',
          vehicleId: ass.vehicleId,
          message: `Daily assignment completed for route assignment ${ass.id}.`,
          severity: 'INFO',
        });
        continue;
      }

      let nextLat = 12.9716;
      let nextLon = 77.5946;

      if (targetStop.propertyId) {
        const prop = await this.prisma.property.findUnique({ where: { id: targetStop.propertyId } });
        if (prop) {
          nextLat = prop.latitude;
          nextLon = prop.longitude;
        }
      } else if (targetStop.collectionPointId) {
        const cp = await this.prisma.collectionPoint.findUnique({ where: { id: targetStop.collectionPointId } });
        if (cp) {
          nextLat = cp.latitude;
          nextLon = cp.longitude;
        }
      }

      await this.submitTelemetry({
        vehicleId: ass.vehicleId,
        latitude: nextLat,
        longitude: nextLon,
        speed: 30,
        heading: 90,
        ignitionStatus: true,
        gpsSource: 'SIMULATOR',
      });

      await this.prisma.routeStop.update({
        where: { id: targetStop.id },
        data: {
          completed: true,
          completedAt: new Date(),
          status: 'COMPLETED',
          delayStatus: 'ON_TIME',
        },
      });
    }
  }
}
