import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { VehicleStatus, VehicleType, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { fleetEventEmitter } from '../src/fleet/fleet.event-emitter';

describe('Fleet Management, Vehicle Operations & Tracking (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock data
  const mockDepot = {
    id: 'depot-1',
    code: 'DEPOT-CENTRAL',
    name: 'Central Depot Parking',
    latitude: 12.9716,
    longitude: 77.5946,
    vehicleCapacity: 50,
  };

  const mockVehicle = {
    id: 'v-1',
    vehicleCode: 'V-101',
    registrationNumber: 'KA-01-ME-1234',
    vehicleType: VehicleType.COMPACTOR,
    manufacturer: 'Volvo',
    model: 'FL6',
    year: 2021,
    capacityKg: 5000,
    compartmentType: 'DUAL',
    fuelType: 'DIESEL',
    currentFuelLevel: 100.0,
    odometerKm: 120.0,
    status: VehicleStatus.AVAILABLE as VehicleStatus,
    depotId: 'depot-1',
    latitude: 12.9716,
    longitude: 77.5946,
    updatedAt: new Date(),
  };

  const mockDriver = {
    id: 'driver-1',
    userId: 'worker-1',
    licenseNumber: 'DL-1234567',
    licenseExpiry: new Date(Date.now() + 365 * 24 * 3600000),
    phone: '9876543210',
    assignedDepotId: 'depot-1',
    safetyScore: 100.0,
  };

  const mockRoute = {
    id: 'route-1',
    routeCode: 'R-EAST-1',
    areaId: 'area-1',
    expectedDistance: 15.5,
    estimatedDuration: 45,
    stops: [],
  };

  const mockAssignment = {
    id: 'assign-1',
    date: new Date(),
    routeId: 'route-1',
    vehicleId: 'v-1',
    driverId: 'driver-1',
    teamId: 'team-1',
    status: 'PLANNED',
  };

  const mockPrisma = {
    depot: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockDepot, ...data })),
      findMany: jest.fn().mockResolvedValue([mockDepot]),
    },
    vehicle: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockVehicle, ...data })),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'v-1') return mockVehicle;
        return null;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        if (where.id === 'v-1') {
          Object.assign(mockVehicle, data);
          return mockVehicle;
        }
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([mockVehicle]),
    },
    driverProfile: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockDriver, ...data })),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.userId === 'worker-1') return mockDriver;
        return null;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        if (where.id === 'driver-1') {
          Object.assign(mockDriver, data);
          return mockDriver;
        }
        return mockDriver;
      }),
    },
    driverShift: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'shift-1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null), // no active shift
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: 'shift-1', ...data })),
    },
    preTripInspection: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'insp-1', ...data })),
    },
    route: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockRoute, ...data })),
    },
    routeStop: {
      create: jest.fn().mockResolvedValue({ id: 'stop-1' }),
    },
    dailyRouteAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockAssignment, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    gPSTelemetry: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'tele-1', ...data })),
      findMany: jest.fn().mockResolvedValue([{ id: 'tele-1', latitude: 12.9, longitude: 77.5 }]),
    },
    vehicleBreakdown: {
      create: jest.fn().mockResolvedValue({ id: 'break-1' }),
    },
    fuelLog: {
      create: jest.fn().mockResolvedValue({ id: 'fuel-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    maintenanceSchedule: {
      create: jest.fn().mockResolvedValue({ id: 'maint-1' }),
    },
    fleetNotification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'notif-1', message: 'Low Fuel alert' }]),
    },
    vehicleEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'worker-1' }),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.setGlobalPrefix('api/v1');

    await app.init();
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const getToken = (userId: string, role: UserRole) => {
    return jwtService.sign(
      { sub: userId, email: `${userId}@test.com`, role },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  describe('1. Vehicle status transitions & Lifecycle state-machine', () => {
    beforeEach(() => {
      mockVehicle.status = VehicleStatus.AVAILABLE;
    });

    it('should validate transition rules AVAILABLE -> ASSIGNED', async () => {
      const token = getToken('admin-1', UserRole.SYSTEM_ADMIN);
      const res = await request(app.getHttpServer())
        .post('/api/v1/fleet/vehicles/v-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: VehicleStatus.ASSIGNED })
        .expect(201);

      expect(res.body.status).toBe(VehicleStatus.ASSIGNED);
    });

    it('should block impossible transition rule AVAILABLE -> IN_SERVICE directly', async () => {
      const token = getToken('admin-1', UserRole.SYSTEM_ADMIN);
      await request(app.getHttpServer())
        .post('/api/v1/fleet/vehicles/v-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: VehicleStatus.IN_SERVICE })
        .expect(400);
    });
  });

  describe('2. Pre-Trip Inspections failures blocks assign dispatch', () => {
    it('should lock vehicle to UNDER_MAINTENANCE when checklist fails', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      mockVehicle.status = VehicleStatus.ASSIGNED;

      const res = await request(app.getHttpServer())
        .post('/api/v1/fleet/vehicles/v-1/inspection')
        .set('Authorization', `Bearer ${token}`)
        .send({
          brakesPassed: false,
          tiresPassed: true,
          lightsPassed: true,
          hydraulicsPassed: true,
          fuelPassed: true,
          batteryPassed: true,
          cleanPassed: true,
          notes: 'Brake pads worn down.',
        })
        .expect(201);

      expect(res.body.result).toBe('FAIL');
      expect(mockVehicle.status).toBe(VehicleStatus.UNDER_MAINTENANCE);
    });
  });

  describe('3. Telemetry validation & impossible jump detection', () => {
    it('should reject impossible telemetry updates (>150 km/h jumps)', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      mockVehicle.latitude = 12.9716;
      mockVehicle.longitude = 77.5946;
      mockVehicle.updatedAt = new Date(Date.now() - 2000);

      await request(app.getHttpServer())
        .post('/api/v1/fleet/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .send({
          vehicleId: 'v-1',
          latitude: 13.9716,
          longitude: 78.5946,
          speed: 160,
          heading: 90,
          ignitionStatus: true,
        })
        .expect(400);
    });
  });

  describe('4. Route Replays & Fleet Alerts history', () => {
    it('should retrieve telemetry coordinate history', async () => {
      const token = getToken('admin-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet/vehicles/v-1/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].latitude).toBe(12.9);
    });

    it('should retrieve fleet alerts list notifications', async () => {
      const token = getToken('admin-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].message).toContain('Low Fuel');
    });
  });
});
