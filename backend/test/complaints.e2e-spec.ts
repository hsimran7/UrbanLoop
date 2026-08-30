import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, ServiceRequestPriority, ServiceRequestStatus, CommentVisibility, ServiceRequestSource } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { RequestsService } from '../src/requests/requests.service';

describe('Citizen Complaints & Service Requests (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let service: RequestsService;

  // Mock data
  const mockCategoryMissed = {
    id: 'cat-missed',
    code: 'MISSED_COLLECTION',
    name: 'Missed Waste Collection',
    description: 'Dry/Wet waste was not picked up.',
    status: 'ACTIVE',
    defaultPriority: ServiceRequestPriority.NORMAL,
    allowsAnonymous: false,
    requiresLocation: false,
    requiresEvidence: false,
  };

  const mockProperty = {
    id: 'prop-1',
    address: '101 Rose Road',
    ownerId: 'citizen-1',
  };

  const mockBin = {
    id: 'bin-1',
    qrCodeId: 'QR-DRY-1',
    collectionPoint: { propertyId: 'prop-1' },
  };

  const mockSlaPolicy = {
    id: 'policy-normal',
    name: 'Normal Priority SLA',
    priority: ServiceRequestPriority.NORMAL,
    acknowledgmentTargetMinutes: 60,
    resolutionTargetMinutes: 120,
    escalationWarningMinutes: 90,
  };

  const mockRequest = {
    id: 'sr-1',
    requestCode: 'SR-2026-100',
    createdByUserId: 'citizen-1',
    categoryId: 'cat-missed',
    areaId: 'area-1',
    propertyId: 'prop-1',
    binId: 'bin-1',
    title: 'Trash not collected',
    description: 'Worker skipped my house.',
    priority: ServiceRequestPriority.NORMAL,
    status: ServiceRequestStatus.SUBMITTED as ServiceRequestStatus,
    assignedDepartmentId: 'dept-1',
    assignedTeamId: null,
    assignedUserId: null,
    submittedAt: new Date(),
    acknowledgedAt: null,
    workStartedAt: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
  };

  const mockSla = {
    id: 'sla-1',
    serviceRequestId: 'sr-1',
    slaPolicyId: 'policy-normal',
    startedAt: new Date(),
    acknowledgmentDueAt: new Date(Date.now() + 60 * 60000),
    resolutionDueAt: new Date(Date.now() + 120 * 60000),
    acknowledgedAt: null,
    resolvedAt: null,
    acknowledgmentBreached: false,
    resolutionBreached: false,
    pausedAt: null,
    totalPausedDurationSeconds: 0,
    pauses: [] as any[],
  };

  const mockDepartment = {
    id: 'dept-1',
    code: 'OPS',
    name: 'Waste Operations',
  };

  const mockMembership = {
    id: 'mem-1',
    userId: 'worker-1',
    departmentId: 'dept-1',
    status: 'ACTIVE',
  };

  const mockCommentPublic = {
    id: 'comment-pub-1',
    serviceRequestId: 'sr-1',
    authorId: 'worker-1',
    visibility: CommentVisibility.PUBLIC,
    message: 'We are on our way.',
    createdAt: new Date(),
  };

  const mockCommentInternal = {
    id: 'comment-int-1',
    serviceRequestId: 'sr-1',
    authorId: 'worker-1',
    visibility: CommentVisibility.INTERNAL,
    message: 'Worker was late due to flat tire.',
    createdAt: new Date(),
  };

  const mockEventPublic = {
    id: 'evt-pub',
    serviceRequestId: 'sr-1',
    eventType: 'REQUEST_SUBMITTED',
    occurredAt: new Date(),
    metadata: null,
  };

  const mockEventInternal = {
    id: 'evt-int',
    serviceRequestId: 'sr-1',
    eventType: 'COMMENT_ADDED',
    occurredAt: new Date(),
    metadata: { commentId: 'comment-int-1', visibility: CommentVisibility.INTERNAL },
  };

  // Mock Prisma
  const mockPrisma = {
    serviceRequestCategory: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'cat-missed') return mockCategoryMissed;
        return null;
      }),
    },
    property: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'prop-1') return mockProperty;
        return null;
      }),
    },
    bin: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'bin-1') return mockBin;
        return null;
      }),
    },
    dailyAssignmentTarget: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    collectionEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    serviceRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockRequest, ...data })),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'sr-1') {
          return {
            ...mockRequest,
            sla: mockSla,
            category: mockCategoryMissed,
            escalations: [],
            evidences: [],
            feedbacks: [],
          };
        }
        return null;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => ({ ...mockRequest, ...data })),
      findMany: jest.fn().mockResolvedValue([mockRequest]),
    },
    sLAPolicy: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.priority === ServiceRequestPriority.NORMAL) return mockSlaPolicy;
        return null;
      }),
    },
    serviceRequestSLA: {
      create: jest.fn().mockResolvedValue(mockSla),
      update: jest.fn().mockResolvedValue(mockSla),
      findMany: jest.fn().mockResolvedValue([]),
    },
    serviceRequestSLAPause: {
      create: jest.fn().mockResolvedValue({ id: 'pause-1' }),
      update: jest.fn().mockResolvedValue({ id: 'pause-1' }),
    },
    serviceRequestAssignmentHistory: {
      create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
    },
    serviceRequestEvent: {
      create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      findMany: jest.fn().mockResolvedValue([mockEventPublic, mockEventInternal]),
    },
    serviceRequestComment: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'comment-1', ...data })),
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where.visibility === CommentVisibility.PUBLIC) return [mockCommentPublic];
        return [mockCommentPublic, mockCommentInternal];
      }),
    },
    serviceRequestEvidence: {
      create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
    },
    serviceRequestFeedback: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'feed-1', ...data })),
    },
    serviceRequestEscalation: {
      create: jest.fn().mockResolvedValue({ id: 'esc-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue(mockDepartment),
    },
    departmentMembership: {
      findMany: jest.fn().mockResolvedValue([mockMembership]),
    },
    workerProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'worker-profile-1' }),
    },
    teamMembership: {
      findFirst: jest.fn().mockResolvedValue(null), // worker is not assigned to team by default
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
    service = moduleFixture.get<RequestsService>(RequestsService);
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

  describe('1. Create Service Request & Ownership validation', () => {
    it('should reject request linked to a property not owned by citizen', async () => {
      const token = getToken('citizen-attacker', UserRole.CITIZEN);
      await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: 'cat-missed',
          areaId: 'area-1',
          propertyId: 'prop-1',
          title: 'Not collected',
          description: 'Help',
        })
        .expect(403);
    });

    it('should create service request successfully with citizen property owned', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: 'cat-missed',
          areaId: 'area-1',
          propertyId: 'prop-1',
          binId: 'bin-1',
          title: 'Trash missed',
          description: 'Waste truck passed by.',
        })
        .expect(201);

      expect(res.body.requestCode).toBeDefined();
    });

    it('should warn on duplicate service request inside cooldown window', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      jest.spyOn(mockPrisma.serviceRequest, 'findFirst').mockResolvedValueOnce(mockRequest);

      await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: 'cat-missed',
          areaId: 'area-1',
          propertyId: 'prop-1',
          title: 'Trash missed duplicate',
          description: 'Waste truck passed by.',
        })
        .expect(400);
    });

    it('should bypass duplicate warning when ignoreDuplicateWarning is true', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      jest.spyOn(mockPrisma.serviceRequest, 'findFirst').mockResolvedValueOnce(mockRequest);

      await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: 'cat-missed',
          areaId: 'area-1',
          propertyId: 'prop-1',
          title: 'Trash missed duplicate',
          description: 'Waste truck passed by.',
          ignoreDuplicateWarning: true,
        })
        .expect(201);
    });

    it('should deduplicate system-generated requests and return existing active one', async () => {
      const token = getToken('system-admin', UserRole.SYSTEM_ADMIN);
      const existingRequest = { ...mockRequest, id: 'sys-active', status: ServiceRequestStatus.SUBMITTED };
      jest.spyOn(mockPrisma.serviceRequest, 'findFirst').mockResolvedValueOnce(existingRequest);

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: 'cat-missed',
          areaId: 'area-1',
          propertyId: 'prop-1',
          title: 'Smart Bin Offline Alert',
          description: 'Sensor not replying.',
          source: ServiceRequestSource.SYSTEM_GENERATED,
          deduplicationKey: 'alert_sys_bin_1',
        })
        .expect(201);

      expect(res.body.id).toBe('sys-active');
    });
  });

  describe('2. Acknowledgment, Assignment History & SLA Timers', () => {
    beforeEach(() => {
      mockRequest.status = ServiceRequestStatus.SUBMITTED;
      mockSla.acknowledgedAt = null;
      mockSla.resolutionDueAt = new Date(Date.now() + 120 * 60000);
      mockSla.pausedAt = null;
    });

    it('should assign department/staff and log assignment history', async () => {
      const token = getToken('super-1', UserRole.SUPERVISOR);
      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({
          assignedDepartmentId: 'dept-1',
          assignedUserId: 'worker-1',
          reason: 'Assigning to operations collection team.',
        })
        .expect(201);

      expect(res.body.status).toBe(ServiceRequestStatus.ASSIGNED);
    });

    it('should pause SLA resolution timer when waiting for citizen details', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      // Mock worker direct assignment check
      mockRequest.assignedUserId = 'worker-1';
      mockRequest.status = ServiceRequestStatus.IN_PROGRESS;

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/request-information')
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'Please send a photo of the bin location.' })
        .expect(201);

      expect(res.body.status).toBe(ServiceRequestStatus.WAITING_FOR_INFORMATION);
    });

    it('should resume SLA resolution timer when citizen provides details', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      mockSla.pausedAt = new Date(Date.now() - 10 * 60000);
      mockSla.pauses = [{ id: 'pause-1', pausedAt: new Date(Date.now() - 10 * 60000), resumedAt: null }];
      mockRequest.status = ServiceRequestStatus.WAITING_FOR_INFORMATION;

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/provide-information')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Bin photo uploaded.' })
        .expect(201);

      expect(res.body.status).toBe(ServiceRequestStatus.IN_PROGRESS);
    });
  });

  describe('3. Resolution, Citizen Reopening, Feedbacks, and SLA Background Cron', () => {
    beforeEach(() => {
      mockRequest.status = ServiceRequestStatus.IN_PROGRESS;
    });

    it('should mark request as RESOLVED', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      mockRequest.assignedUserId = 'worker-1';

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({
          resolutionCode: 'COLLECTION_COMPLETED',
          resolutionSummary: 'Dispatched secondary truck.',
        })
        .expect(201);

      expect(res.body.status).toBe(ServiceRequestStatus.RESOLVED);
    });

    it('should allow citizen who created request to reopen resolved request', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      mockRequest.status = ServiceRequestStatus.RESOLVED;
      mockRequest.resolvedAt = new Date();

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/reopen')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Bin still not collected.' })
        .expect(201);

      expect(res.body.status).toBe(ServiceRequestStatus.REOPENED);
    });

    it('should allow citizen feedback rating stars (1-5)', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      mockRequest.status = ServiceRequestStatus.CLOSED;

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, comment: 'Great rapid collection.' })
        .expect(201);

      expect(res.body.rating).toBe(5);
    });

    it('should check that duplicate SLA cron triggers do not create duplicate escalations', async () => {
      // Set resolution breach trigger
      mockSla.resolutionDueAt = new Date(Date.now() - 10000); // breached 10s ago
      mockSla.resolutionBreached = false;
      jest.spyOn(mockPrisma.serviceRequestSLA, 'findMany').mockResolvedValueOnce([mockSla]);

      await service.checkSLAEscalations();

      // Second check: simulate duplicate cron run
      mockSla.resolutionBreached = true; // marked in transaction
      jest.spyOn(mockPrisma.serviceRequestSLA, 'findMany').mockResolvedValueOnce([mockSla]);

      await service.checkSLAEscalations();

      // Unique db index or transaction marked resolutionBreached blocks duplicate run
      expect(mockPrisma.serviceRequestEscalation.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Timeline Privacy & Access boundaries', () => {
    it('should forbid Citizen B from reading Citizen A timeline', async () => {
      const token = getToken('citizen-attacker', UserRole.CITIZEN);
      await request(app.getHttpServer())
        .get('/api/v1/service-requests/sr-1/timeline')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should forbid worker from reading timeline if not assigned', async () => {
      const token = getToken('worker-unrelated', UserRole.WORKER);
      mockRequest.assignedUserId = 'worker-1'; // assigned to worker-1
      mockRequest.assignedTeamId = null;

      await request(app.getHttpServer())
        .get('/api/v1/service-requests/sr-1/timeline')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should filter out internal comments and events from citizen timeline responses', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      const res = await request(app.getHttpServer())
        .get('/api/v1/service-requests/sr-1/timeline')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // evt-int has COMMENT_ADDED with CommentVisibility.INTERNAL, should be filtered
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe('evt-pub');
    });
  });

  describe('5. State Machine Transition validations', () => {
    it('should reject invalid direct transitions (e.g. from SUBMITTED directly to RESOLVED)', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      mockRequest.status = ServiceRequestStatus.SUBMITTED;

      await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({
          resolutionCode: 'COLLECTION_COMPLETED',
          resolutionSummary: 'Dispatched secondary truck.',
        })
        .expect(400);
    });

    it('should reject modifications to CLOSED requests', async () => {
      const token = getToken('worker-1', UserRole.WORKER);
      mockRequest.status = ServiceRequestStatus.CLOSED;

      await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({
          resolutionCode: 'COLLECTION_COMPLETED',
          resolutionSummary: 'Dispatched secondary truck.',
        })
        .expect(400);
    });
  });

  describe('6. Close & Cancel workflows', () => {
    it('should allow supervisors to cancel request and preserve historical events', async () => {
      const token = getToken('super-1', UserRole.SUPERVISOR);
      mockRequest.status = ServiceRequestStatus.IN_PROGRESS;

      const res = await request(app.getHttpServer())
        .post('/api/v1/service-requests/sr-1/cancel')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Duplicate alert logged in wrong ward.' })
        .expect(201);

      expect(res.body.status).toBe(ServiceRequestStatus.CANCELLED);
    });
  });
});
