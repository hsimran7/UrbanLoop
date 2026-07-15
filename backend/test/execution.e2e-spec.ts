import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BinStateService } from '../src/bins/bin-state.service';
import { UserRole, TargetStatus, AssignmentStatus, WorkerShiftStatus, CollectionVerification } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('Collection Execution and Verification (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock models and data
  const mockWorkerProfile = {
    id: 'worker-prof-1',
    userId: 'worker-user-1',
    joinedAt: new Date(),
    employeeCode: 'EMP-001',
    employmentStatus: 'ACTIVE',
  };

  const mockWorkerProfile2 = {
    id: 'worker-prof-2',
    userId: 'worker-user-2',
    joinedAt: new Date(),
    employeeCode: 'EMP-002',
    employmentStatus: 'ACTIVE',
  };

  const mockTeamMembership = {
    id: 'membership-1',
    teamId: 'team-1',
    workerId: 'worker-prof-1',
    role: 'COLLECTOR',
    effectiveFrom: new Date('2026-01-01'),
    effectiveUntil: null,
  };

  const mockShiftAssignment = {
    id: 'shift-assign-1',
    workerId: 'worker-prof-1',
    shiftId: 'shift-1',
    workDate: new Date('2026-07-15T00:00:00Z'),
    status: WorkerShiftStatus.ASSIGNED,
  };

  const mockBin = {
    id: 'bin-123',
    qrCodeId: 'UL-BIN-DRY-TEST1',
    type: 'DRY',
    status: 'EMPTY',
    condition: 'GOOD',
    currentFillLevel: 65,
    collectionPointId: 'cp-123',
  };

  const mockCollectionPoint = {
    id: 'cp-123',
    name: 'CP 1',
    latitude: 12.971598,
    longitude: 77.594562,
  };

  const mockAssignment = {
    id: 'assign-1',
    assignmentDate: new Date('2026-07-15T00:00:00Z'),
    teamId: 'team-1',
    serviceZoneId: 'zone-1',
    shiftId: 'shift-1',
    wasteType: 'DRY',
    status: AssignmentStatus.READY as AssignmentStatus,
    targets: [],
  };

  const mockTarget = {
    id: 'target-123',
    assignmentId: 'assign-1',
    collectionPointId: 'cp-123',
    binId: 'bin-123',
    status: TargetStatus.PENDING as TargetStatus,
    bin: mockBin,
    collectionPoint: mockCollectionPoint,
  };

  // Mock Prisma Implementation
  const mockPrisma = {
    dailyAssignment: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'assign-1') {
          return { ...mockAssignment, targets: [mockTarget] };
        }
        if (where.id === 'assign-cancelled') {
          return { ...mockAssignment, status: AssignmentStatus.CANCELLED };
        }
        if (where.id === 'assign-completed') {
          return { ...mockAssignment, status: AssignmentStatus.COMPLETED, targets: [mockTarget] };
        }
        return null;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => ({
        ...mockAssignment,
        ...data,
      })),
    },
    workerProfile: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.userId === 'worker-user-1') return mockWorkerProfile;
        if (where.userId === 'worker-user-2') return mockWorkerProfile2;
        return null;
      }),
    },
    teamMembership: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.workerId === 'worker-prof-1' && where.teamId === 'team-1') {
          return mockTeamMembership;
        }
        return null;
      }),
    },
    workerShiftAssignment: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.workerId === 'worker-prof-1' && where.shiftId === 'shift-1') {
          return mockShiftAssignment;
        }
        return null;
      }),
    },
    bin: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.qrCodeId === 'UL-BIN-DRY-TEST1') return mockBin;
        return null;
      }),
    },
    dailyAssignmentTarget: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'target-123') return mockTarget;
        const comp = where.assignmentId_collectionPointId_binId;
        if (comp && comp.assignmentId === 'assign-1' && comp.binId === 'bin-123') {
          return mockTarget;
        }
        return null;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => ({
        ...mockTarget,
        ...data,
      })),
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where && where.collectionPointId && where.collectionPointId.in && where.collectionPointId.in.includes('cp-123')) {
          return [{
            ...mockTarget,
            status: TargetStatus.COLLECTED,
            collectedAt: new Date(),
            collectedById: 'worker-prof-1',
            assignment: mockAssignment,
            bin: mockBin,
            collectionPoint: {
              ...mockCollectionPoint,
              propertyId: 'prop-1',
            },
          }];
        }
        return [];
      }),
    },
    collectionEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'event-1',
        ...data,
      })),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'supervisor-1') return { id: 'supervisor-1', role: UserRole.SUPERVISOR };
        return null;
      }),
    },
    collectionTeam: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'team-1') return { id: 'team-1', supervisorId: 'supervisor-1' };
        return null;
      }),
    },
    supervisorCorrection: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'corr-record-1',
        ...data,
      })),
    },
    property: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'prop-1',
          address: '123 Citizen St',
          ownerId: 'citizen-1',
          collectionPoints: [{ id: 'cp-123' }],
        },
      ]),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  };

  const mockBinStateService = {
    recordEmptying: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    // Override Date globally or mock system date to matches shift E2E
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(BinStateService)
      .useValue(mockBinStateService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.setGlobalPrefix('api/v1');

    await app.init();
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    jest.useRealTimers();
    await app.close();
  });

  const getWorkerToken = (userId: string) => {
    return jwtService.sign(
      { sub: userId, email: 'worker@test.com', role: UserRole.WORKER },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  const getSupervisorToken = (userId: string) => {
    return jwtService.sign(
      { sub: userId, email: 'supervisor@test.com', role: UserRole.SUPERVISOR },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  const getCitizenToken = (userId: string) => {
    return jwtService.sign(
      { sub: userId, email: 'citizen@test.com', role: UserRole.CITIZEN },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  describe('1. Start Daily Assignment Workflow', () => {
    it('should allow authorized worker to start their assignment', async () => {
      const token = getWorkerToken('worker-user-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/start')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.status).toBe(AssignmentStatus.IN_PROGRESS);
    });

    it('should reject worker who is not authorized (different team membership)', async () => {
      const token = getWorkerToken('worker-user-2'); // worker-user-2 is on team-2
      await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/start')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should reject starting cancelled assignments', async () => {
      const token = getWorkerToken('worker-user-1');
      await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-cancelled/start')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('2. QR Verification Workflow', () => {
    it('should verify correct QR matches assignment target', async () => {
      const token = getWorkerToken('worker-user-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/verify-bin')
        .set('Authorization', `Bearer ${token}`)
        .send({ qrCodeId: 'UL-BIN-DRY-TEST1' })
        .expect(201);

      expect(res.body.verified).toBe(true);
      expect(res.body.binId).toBe('bin-123');
    });

    it('should reject verification of unknown/invalid QR', async () => {
      const token = getWorkerToken('worker-user-1');
      await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/verify-bin')
        .set('Authorization', `Bearer ${token}`)
        .send({ qrCodeId: 'INVALID-QR-999' })
        .expect(404);
    });
  });

  describe('3. Collection Targets Logging (Collect, Miss, Skip)', () => {
    beforeEach(() => {
      // Mock target as pending
      mockTarget.status = TargetStatus.PENDING;
      mockAssignment.status = AssignmentStatus.IN_PROGRESS;
    });

    it('should record successful target collection, verify location and trigger emptying', async () => {
      const token = getWorkerToken('worker-user-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/targets/target-123/collect')
        .set('Authorization', `Bearer ${token}`)
        .send({
          qrCodeId: 'UL-BIN-DRY-TEST1',
          clientEventId: 'client-evt-100',
          latitude: 12.971590, // very close to CP
          longitude: 77.594560,
        })
        .expect(201);

      expect(res.body.verificationLevel).toBe(CollectionVerification.VERIFIED);
      expect(mockBinStateService.recordEmptying).toHaveBeenCalledWith('bin-123', 'worker-user-1');
    });

    it('should flag distant collection points (>300 meters)', async () => {
      const token = getWorkerToken('worker-user-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/targets/target-123/collect')
        .set('Authorization', `Bearer ${token}`)
        .send({
          qrCodeId: 'UL-BIN-DRY-TEST1',
          clientEventId: 'client-evt-101',
          latitude: 13.971590, // far away
          longitude: 78.594560,
        })
        .expect(201);

      expect(res.body.verificationLevel).toBe(CollectionVerification.FLAGGED);
    });

    it('should allow reporting missed collection point with valid reason', async () => {
      const token = getWorkerToken('worker-user-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/targets/target-123/miss')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reasonCode: 'ACCESS_BLOCKED',
          clientEventId: 'client-evt-200',
        })
        .expect(201);

      expect(res.body.eventType).toBe('MISSED');
    });

    it('should block worker from using skipped for administrative reasons without override', async () => {
      const token = getWorkerToken('worker-user-1');
      await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/targets/target-123/skip')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reasonCode: 'ADMINISTRATIVE_INSTRUCTION',
          clientEventId: 'client-evt-300',
        })
        .expect(403);
    });

    it('should allow supervisor to authorize sensitive skips', async () => {
      const token = getSupervisorToken('supervisor-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/targets/target-123/skip')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reasonCode: 'ADMINISTRATIVE_INSTRUCTION',
          clientEventId: 'client-evt-301',
        })
        .expect(201);

      expect(res.body.eventType).toBe('SKIPPED');
    });
  });

  describe('4. Supervisor Correction and Citizen History', () => {
    it('should allow supervisor to correct target status and log audit trail', async () => {
      const token = getSupervisorToken('supervisor-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/targets/target-123/correct')
        .set('Authorization', `Bearer ${token}`)
        .send({
          correctedStatus: 'COLLECTED',
          correctionReason: 'Worker marked missed by mistake.',
        })
        .expect(201);

      expect(res.body.eventType).toBe('CORRECTED');
    });

    it('should permit citizen to see their verified property history and hide worker details', async () => {
      const token = getCitizenToken('citizen-1');
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignments/citizen-history')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('address');
        expect(res.body[0]).not.toHaveProperty('workerId');
        expect(res.body[0]).not.toHaveProperty('workerId');
      }
    });

    it('should block citizens from accessing worker portals/ops tools', async () => {
      const token = getCitizenToken('citizen-1');
      await request(app.getHttpServer())
        .post('/api/v1/assignments/assign-1/start')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
