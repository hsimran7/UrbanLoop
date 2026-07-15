import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, DayOfWeek, ScheduleStatus, BinType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('Schedules Features (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockPrisma = {
    area: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        name: 'Downtown Area',
        ward: { city: { timezone: 'Asia/Kolkata' } },
      }),
    },
    collectionSchedule: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    scheduleException: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    property: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.setGlobalPrefix('api/v1');

    await app.init();
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const getCitizenToken = (userId: string) => {
    return jwtService.sign(
      { sub: userId, email: 'citizen@test.com', role: UserRole.CITIZEN },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  const getOfficialToken = (userId: string) => {
    return jwtService.sign(
      { sub: userId, email: 'official@test.com', role: UserRole.GOVERNMENT_OFFICIAL },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  describe('1. Access Control & Scheduling CRUD', () => {
    it('should reject unauthenticated request (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/schedules')
        .expect(401);
    });

    it('should block Citizen from creating a schedule (403)', async () => {
      const citizenToken = getCitizenToken('citizen-1');
      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          areaId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          wasteType: BinType.DRY,
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '08:00',
          endTime: '11:00',
          effectiveFrom: '2026-07-15T00:00:00.000Z',
        })
        .expect(403);
    });

    it('should allow Government Official to create a recurring schedule (201)', async () => {
      const officialToken = getOfficialToken('official-1');
      mockPrisma.collectionSchedule.findMany.mockResolvedValue([]); // no conflict
      mockPrisma.collectionSchedule.create.mockResolvedValue({ id: 'schedule-abc', areaId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${officialToken}`)
        .send({
          areaId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          wasteType: BinType.DRY,
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '08:00',
          endTime: '11:00',
          effectiveFrom: '2026-07-15T00:00:00.000Z',
        });

      if (res.status !== 201) {
        console.log('E2E FAILED DETAILS:', JSON.stringify(res.body, null, 2));
      }

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('schedule-abc');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should reject schedule validation with start time after end time (400)', async () => {
      const officialToken = getOfficialToken('official-1');
      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${officialToken}`)
        .send({
          areaId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          wasteType: BinType.DRY,
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '12:00',
          endTime: '08:00', // Invalid time range
          effectiveFrom: '2026-07-15T00:00:00.000Z',
        })
        .expect(400);
    });
  });

  describe('2. Citizen schedule fetch visibility', () => {
    it('should return empty schedules list if property is not verified (e.g. pending status)', async () => {
      const citizenToken = getCitizenToken('citizen-1');
      // Mock citizen owns a PENDING property
      mockPrisma.property.findMany.mockResolvedValue([]); // pending are filtered out in query

      await request(app.getHttpServer())
        .get('/api/v1/citizen/schedules?startDate=2026-07-20T00:00:00.000Z&endDate=2026-07-26T00:00:00.000Z')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual([]);
        });
    });
  });
});
