import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, WasteLoadStatus, TransferStatus, ReceiptStatus, CustodyEventType, MassBalanceStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('Traceability, Weighing, and Receipts (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock Data
  const mockFacility = {
    id: 'fac-1',
    facilityCode: 'FAC-MRF-01',
    name: 'MRF Compost Plant',
    facilityType: 'COMPOSTING_FACILITY',
    status: 'ACTIVE',
    latitude: 12.971598,
    longitude: 77.594562,
    address: 'Near Central Station',
    dailyCapacityKg: 10000,
    acceptedWasteTypes: [{ wasteType: 'WET' }],
  };

  const mockFacilityInactive = {
    id: 'fac-inactive',
    facilityCode: 'FAC-IN-01',
    name: 'Closed Dump',
    facilityType: 'LANDFILL',
    status: 'INACTIVE',
    latitude: 12.971,
    longitude: 77.594,
    address: 'Abandoned Quarry',
    acceptedWasteTypes: [{ wasteType: 'WET' }],
  };

  const mockAssignment = {
    id: 'assign-1',
    assignmentDate: new Date(),
    teamId: 'team-1',
    serviceZoneId: 'zone-1',
    wasteType: 'WET',
    status: 'IN_PROGRESS',
  };

  const mockCollectionEvent = {
    id: 'evt-1',
    assignmentId: 'assign-1',
    eventType: 'COLLECTED',
    binId: 'bin-1',
    collectionPointId: 'cp-1',
    targetId: 'tgt-1',
  };

  const mockStaffAssignment = {
    id: 'staff-assign-1',
    userId: 'mgr-1',
    facilityId: 'fac-1',
    role: 'MANAGER',
    status: 'ACTIVE',
  };

  const mockLoad = {
    id: 'load-1',
    loadCode: 'WL-WET-100',
    assignmentId: 'assign-1',
    teamId: 'team-1',
    wasteType: 'WET',
    status: WasteLoadStatus.OPEN as WasteLoadStatus,
    createdBy: 'super-1',
    openedAt: new Date(),
    sealedAt: null,
    sealedBy: null,
    sealCode: null,
    deliveredAt: null,
  };

  const mockTransfer = {
    id: 'trans-1',
    wasteLoadId: 'load-1',
    destinationFacilityId: 'fac-1',
    status: TransferStatus.DISPATCHED,
  };

  const mockWeighing = {
    id: 'weigh-1',
    wasteLoadId: 'load-1',
    facilityId: 'fac-1',
    grossWeightKg: 5000,
    tareWeightKg: 2000,
    netWeightKg: 3000,
    weighingMethod: 'SIMULATED',
    weighedAt: new Date(),
    recordedBy: 'mgr-1',
  };

  const mockReceipt = {
    id: 'rec-1',
    receiptCode: 'REC-1234',
    wasteLoadId: 'load-1',
    facilityId: 'fac-1',
    weighingRecordId: 'weigh-1',
    status: ReceiptStatus.ACCEPTED,
    acceptedWeightKg: 2800,
    rejectedWeightKg: 200,
    receivedBy: 'mgr-1',
    receivedAt: new Date(),
  };

  // Mock Prisma Services
  const mockPrisma = {
    dailyAssignment: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'assign-1') return mockAssignment;
        return null;
      }),
    },
    collectionEvent: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where.assignmentId === 'assign-1' && where.eventType === 'COLLECTED') {
          return [mockCollectionEvent];
        }
        return [];
      }),
    },
    wasteLoadItem: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
    },
    wasteLoad: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockLoad, ...data })),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'load-1') {
          return {
            ...mockLoad,
            items: [{ id: 'item-1', collectionPointId: 'cp-1', binId: 'bin-1' }],
            transfers: [{ ...mockTransfer, facility: mockFacility }],
            weighingRecords: [mockWeighing],
            receipts: [{ ...mockReceipt, processingRecords: [] }],
            custodyEvents: [],
          };
        }
        return null;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => ({ ...mockLoad, ...data })),
      findMany: jest.fn().mockResolvedValue([mockLoad]),
    },
    wasteTransfer: {
      create: jest.fn().mockResolvedValue(mockTransfer),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.wasteLoadId === 'load-1') return mockTransfer;
        return null;
      }),
      update: jest.fn().mockResolvedValue(mockTransfer),
    },
    wasteFacility: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'fac-1') return mockFacility;
        if (where.id === 'fac-inactive') return mockFacilityInactive;
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([mockFacility]),
    },
    facilityStaffAssignment: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const comp = where.userId_facilityId;
        if (comp && comp.userId === 'mgr-1' && comp.facilityId === 'fac-1') {
          return mockStaffAssignment;
        }
        return null;
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where.userId === 'mgr-1') return [mockStaffAssignment];
        return [];
      }),
    },
    weighingRecord: {
      create: jest.fn().mockResolvedValue(mockWeighing),
      findFirst: jest.fn().mockResolvedValue(mockWeighing),
    },
    facilityReceipt: {
      create: jest.fn().mockResolvedValue(mockReceipt),
      findFirst: jest.fn().mockResolvedValue(mockReceipt),
    },
    wasteProcessingRecord: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'proc-1', ...data })),
    },
    wasteCustodyEvent: {
      create: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    },
    collectionPoint: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'cp-1') {
          return { id: 'cp-1', name: 'CP Wet 1', property: { address: 'Compost Street 12', ownerId: 'cit-1' } };
        }
        return null;
      }),
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

  describe('1. WasteLoad Creation & Sealing', () => {
    it('should block WORKER from creating WasteLoad', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          assignmentId: 'assign-1',
          wasteType: 'WET',
          collectionEventIds: ['evt-1'],
        })
        .expect(403);
    });

    it('should allow SUPERVISOR to create WasteLoad from collected events', async () => {
      const token = getToken('super-1', UserRole.SUPERVISOR);
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          assignmentId: 'assign-1',
          wasteType: 'WET',
          collectionEventIds: ['evt-1'],
        })
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.OPEN);
    });

    it('should allow SUPERVISOR to seal an OPEN load', async () => {
      const token = getToken('super-1', UserRole.SUPERVISOR);
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/seal')
        .set('Authorization', `Bearer ${token}`)
        .send({ sealCode: 'SL-XYZ-01' })
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.SEALED);
      expect(res.body.sealCode).toBe('SL-XYZ-01');
    });
  });

  describe('2. Dispatch and Compatibility checks', () => {
    it('should reject dispatch to an INACTIVE facility', async () => {
      const token = getToken('super-1', UserRole.SUPERVISOR);
      // Mock active load status to SEALED for state machine check
      mockLoad.status = WasteLoadStatus.SEALED;
      await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/dispatch')
        .set('Authorization', `Bearer ${token}`)
        .send({ destinationFacilityId: 'fac-inactive' })
        .expect(400);
    });

    it('should allow dispatch to compatibility matching ACTIVE facility', async () => {
      const token = getToken('super-1', UserRole.SUPERVISOR);
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/dispatch')
        .set('Authorization', `Bearer ${token}`)
        .send({ destinationFacilityId: 'fac-1' })
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.IN_TRANSIT);
    });
  });

  describe('3. Facility Manager Arrival & Scale Weighing checks', () => {
    it('should reject arrival check-ins for managers not assigned to destination facility', async () => {
      const token = getToken('mgr-other', UserRole.FACILITY_MANAGER);
      mockLoad.status = WasteLoadStatus.IN_TRANSIT;
      await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/arrive')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should allow assigned manager to confirm arrival', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/arrive')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.ARRIVED);
    });

    it('should reject weighing if gross weight < tare weight', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      mockLoad.status = WasteLoadStatus.ARRIVED;
      await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/weigh')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grossWeightKg: 1000,
          tareWeightKg: 1200, // gross < tare
          weighingMethod: 'SIMULATED',
        })
        .expect(400);
    });

    it('should record weighing and compute net weight server-side', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/weigh')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grossWeightKg: 5000,
          tareWeightKg: 2000,
          weighingMethod: 'SIMULATED',
        })
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.WEIGHED);
    });
  });

  describe('4. Receipt and Output Mass-Balance validation', () => {
    it('should reject receipt weights exceeding scale net weight (+5% tolerance)', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      mockLoad.status = WasteLoadStatus.WEIGHED;
      await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/receipt')
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: ReceiptStatus.ACCEPTED,
          acceptedWeightKg: 3200, // net is 3000, 3200 > 3000 * 1.05 (3150)
          rejectedWeightKg: 50,
        })
        .expect(400);
    });

    it('should authorize receipt creation and transition load status', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/receipt')
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: ReceiptStatus.ACCEPTED,
          acceptedWeightKg: 2800,
          rejectedWeightKg: 200,
        })
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.ACCEPTED);
    });

    it('should validate processing inputs and mass-balance output yields', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      mockLoad.status = WasteLoadStatus.ACCEPTED;
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads/load-1/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          processType: 'COMPOSTED',
          inputWeightKg: 2800, // matches accepted receipt weight
          outputWeightKg: 2000,
          residueWeightKg: 800,
        })
        .expect(201);

      expect(res.body.status).toBe(WasteLoadStatus.CLOSED);
    });
  });

  describe('5. Traceability drill-down', () => {
    it('should yield full custody trace and hide citizen PII for non-admins', async () => {
      const token = getToken('mgr-1', UserRole.FACILITY_MANAGER);
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads/load-1/trace')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.loadCode).toBe('WL-WET-100');
      expect(res.body.items[0].address).toBe('Compost Street 12');
      expect(res.body.items[0].ownerName).toBeUndefined(); // worker/mgr does not see citizen owner names
    });
  });
});
