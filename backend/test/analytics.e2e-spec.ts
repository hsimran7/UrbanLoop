import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('Government Command Center & Open Data Analytics (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockSnapshot = { id: 'snap-1', kpiKey: 'collection_efficiency', kpiValue: 92.4 };
  const mockReport = { id: 'rep-1', reportType: 'DAILY', summary: 'Daily municipal stats report', filePath: '/reports/daily.csv' };

  const mockPrisma = {
    vehicle: {
      count: jest.fn().mockResolvedValue(10),
    },
    serviceRequest: {
      count: jest.fn().mockResolvedValue(5),
      findMany: jest.fn().mockResolvedValue([{ id: 'req-1', latitude: 12.9, longitude: 77.5 }]),
    },
    serviceRequestFeedback: {
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }),
    },
    carbonEmissionRecord: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { co2OffsetKg: 15000 } }),
    },
    bin: {
      findMany: jest.fn().mockResolvedValue([{ id: 'bin-1', currentFillLevel: 90, collectionPoint: { latitude: 12.9, longitude: 77.5 } }]),
    },
    executiveReport: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...mockReport, ...data })),
      findMany: jest.fn().mockResolvedValue([mockReport]),
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

  describe('1. Dashboard Role-Based Security boundaries', () => {
    it('should block citizens from accessing executive dashboard summary endpoints', async () => {
      const token = getToken('citizen-1', UserRole.CITIZEN);
      await request(app.getHttpServer())
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should allow government officials full access to the executive dashboards summary', async () => {
      const token = getToken('gov-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.kpis.totalVehicles).toBe(10);
      expect(res.body.kpis.citizenSatisfaction).toBe(4.5);
    });
  });

  describe('2. Open Data API public accessibility', () => {
    it('should allow public read-only access to open statistics without JWT header authorization', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/api/open/statistics')
        .expect(200);

      expect(res.body.cityWasteTonsToday).toBe(145.4);
      expect(res.body.cityRecyclingRate).toBe(38.5);
    });

    it('should allow public read-only access to open recycling statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/api/open/recycling')
        .expect(200);

      expect(res.body.treesSaved).toBe(142);
      expect(res.body.waterSavedLitres).toBe(450000);
    });
  });

  describe('3. Executive Reports Generations logs', () => {
    it('should successfully log report generation logs to the DB', async () => {
      const token = getToken('gov-1', UserRole.GOVERNMENT_OFFICIAL);
      const res = await request(app.getHttpServer())
        .post('/api/v1/analytics/reports/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ reportType: 'WEEKLY' })
        .expect(201);

      expect(res.body.reportType).toBe('WEEKLY');
      expect(res.body.filePath).toContain('weekly');
    });
  });
});
