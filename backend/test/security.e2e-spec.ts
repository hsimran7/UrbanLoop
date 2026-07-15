import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('Security Controls (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    property: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    bin: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    area: {
      findUnique: jest.fn().mockResolvedValue({ id: 'area-123', name: 'Downtown' }),
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

  const getAdminToken = (userId: string) => {
    return jwtService.sign(
      { sub: userId, email: 'admin@test.com', role: UserRole.SYSTEM_ADMIN },
      { secret: process.env.JWT_ACCESS_SECRET || 'urbanloop_access_token_secure_secret_key_2026_jwt' },
    );
  };

  describe('1. Role Escalation Protection', () => {
    it('should reject registration attempts containing extra fields like role (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'escalated@test.com',
          password: 'Password123!',
          role: 'SYSTEM_ADMIN', // Attempting to pass role
        })
        .expect(400)
        .then((res) => {
          expect(res.body.message).toContain('property role should not exist');
        });
    });

    it('should prevent Citizen from accessing administrative endpoints (CORS/RBAC check)', async () => {
      const citizenToken = getCitizenToken('citizen-user-123');

      await request(app.getHttpServer())
        .post('/api/v1/geo/cities')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ name: 'Emerald City', state: 'Oz' })
        .expect(403)
        .then((res) => {
          expect(res.body.message).toContain('Access denied');
        });
    });

    it('should allow Admin/Official to access administrative endpoints', async () => {
      const adminToken = getAdminToken('admin-user-123');
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-user-123', role: UserRole.SYSTEM_ADMIN });
      mockPrisma.property.findUnique.mockResolvedValue(null); // setup for test query

      // Setup prisma return for mock create city
      mockPrisma.user.create.mockResolvedValue({ id: 'city-1' });

      // If everything passes auth guards, we will get mock database responses or 409 conflict
      await request(app.getHttpServer())
        .post('/api/v1/geo/cities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Emerald City', state: 'Oz' })
        .expect((res) => {
          // Should NOT return 403 Forbidden
          expect(res.status).not.toBe(403);
          expect(res.status).not.toBe(401);
        });
    });
  });

  describe('2. IDOR Protection (Property & Bin)', () => {
    it('should block Citizen A from reading Citizen B property records', async () => {
      const citizenAToken = getCitizenToken('citizen-A');

      // Setup property mock owned by citizen-B
      mockPrisma.property.findUnique.mockResolvedValue({
        id: 'prop-123',
        address: '456 Birch Road',
        ownerId: 'citizen-B',
      });

      await request(app.getHttpServer())
        .get('/api/v1/properties/prop-123')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(403)
        .then((res) => {
          expect(res.body.message).toContain('You do not own this property');
        });
    });

    it('should block Citizen A from updating Citizen B bin capacity or condition', async () => {
      const citizenAToken = getCitizenToken('citizen-A');

      // Setup bin mock owned by citizen-B's property
      mockPrisma.bin.findUnique.mockResolvedValue({
        id: 'bin-555',
        collectionPoint: {
          property: {
            ownerId: 'citizen-B',
          },
        },
      });

      await request(app.getHttpServer())
        .patch('/api/v1/bins/bin-555')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .send({ status: 'FULL' })
        .expect(403)
        .then((res) => {
          expect(res.body.message).toContain('You do not own the property associated with this bin');
        });
    });
  });

  describe('3. Safe Error Payloads', () => {
    it('should return sanitized error structures without leaking database or framework details', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me') // Calling profile unauthenticated
        .expect(401)
        .then((res) => {
          expect(res.body).toHaveProperty('statusCode', 401);
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/api/v1/auth/me');
          expect(res.body).toHaveProperty('message');
          expect(res.body).not.toHaveProperty('stack');
          expect(res.body).not.toHaveProperty('driver'); // Postgres / Prisma leak checks
        });
    });
  });
});
