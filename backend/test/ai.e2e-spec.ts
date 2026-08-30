import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('AI Decision Intelligence, Predictions & Optimization (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockBin = { id: 'bin-1', qrCodeId: 'QR-TEST', currentFillLevel: 85 };
  const mockRecommendation = { id: 'rec-1', title: 'Schedule Maintenance', status: 'PENDING' };

  const mockPrisma = {
    bin: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === 'bin-1') return mockBin;
        return null;
      }),
      count: jest.fn().mockResolvedValue(12),
    },
    vehicle: {
      count: jest.fn().mockResolvedValue(15),
    },
    serviceRequest: {
      count: jest.fn().mockResolvedValue(8),
    },
    recommendation: {
      findMany: jest.fn().mockResolvedValue([mockRecommendation]),
      update: jest.fn().mockImplementation(({ where, data }) => ({ ...mockRecommendation, ...data })),
    },
    decisionLog: {
      create: jest.fn().mockResolvedValue({ id: 'dec-1' }),
    },
    aIConversation: {
      create: jest.fn().mockResolvedValue({ id: 'con-1' }),
    },
    optimizationJob: {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      update: jest.fn().mockResolvedValue({ id: 'job-1' }),
    },
    optimizationResult: {
      create: jest.fn().mockResolvedValue({ id: 'res-1' }),
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

  describe('1. Explainable AI prediction endpoints', () => {
    it('should calculate explainable bin overflow risk details', async () => {
      const token = getToken('admin-1', UserRole.SYSTEM_ADMIN);
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/predict')
        .set('Authorization', `Bearer ${token}`)
        .send({ binId: 'bin-1' })
        .expect(201);

      expect(res.body.prediction).toBe('HIGH_OVERFLOW_RISK');
      expect(res.body.confidenceScore).toBe(0.89);
      expect(res.body.factors.length).toBeGreaterThan(0);
      expect(res.body.reasoning).toContain('Current bin fill level is at 85%');
    });
  });

  describe('2. Decision support and Copilot diagnostics dialogs', () => {
    it('should generate conversational replies based on db entity counts', async () => {
      const token = getToken('admin-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/copilot')
        .set('Authorization', `Bearer ${token}`)
        .send({ prompt: 'How many vehicles are registered?' })
        .expect(201);

      expect(res.body.reply).toContain('15 total vehicles');
    });

    it('should support decision logs approval updates', async () => {
      const token = getToken('admin-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/recommendations/rec-1/approve')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.status).toBe('APPROVED');
      expect(res.body.approvedBy).toBe('admin-1');
    });
  });

  describe('3. VRP Route stop sequences reorder optimizations', () => {
    it('should reorder route stop sequences to save traveling time/distance', async () => {
      const token = getToken('admin-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/optimize')
        .set('Authorization', `Bearer ${token}`)
        .send({ routeId: 'route-1' })
        .expect(201);

      expect(res.body.optimizedStopsOrder.length).toBe(4);
      expect(res.body.savingsKm).toBe(4.8);
      expect(res.body.savingsMin).toBe(22.0);
    });
  });
});
