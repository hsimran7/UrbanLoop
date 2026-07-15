import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hashToken } from '../common/utils/crypto.util';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let usersService: any;
  let jwtService: any;
  let auditService: any;

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
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createCitizen: jest.fn(),
    createAdminOrWorker: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mockToken'),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a citizen using usersService', async () => {
      const dto = { email: 'citizen@test.com', password: 'Password123!' };
      usersService.createCitizen.mockResolvedValue({ id: '1', email: dto.email, role: UserRole.CITIZEN });

      const result = await service.register(dto);
      expect(usersService.createCitizen).toHaveBeenCalledWith(dto.email, dto.password);
      expect(result.role).toBe(UserRole.CITIZEN);
    });
  });

  describe('refresh token reuse detection', () => {
    it('should revoke all user sessions and throw Unauthorized if token is already marked revoked', async () => {
      const rawToken = 'stolenToken';
      const tokenHashStr = hashToken(rawToken);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-123',
        tokenHash: tokenHashStr,
        userId: 'user-456',
        revoked: true,
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 'user-456', email: 'test@test.com', role: UserRole.CITIZEN },
      });

      await expect(service.refresh(rawToken, '127.0.0.1', 'Mozilla')).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify all tokens for the user were set to revoked
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-456' },
        data: { revoked: true },
      });
      // Verify security alert was audited
      expect(auditService.log).toHaveBeenCalledWith(
        'user-456',
        'SECURITY_ALERT_TOKEN_REUSE',
        '127.0.0.1',
        'Mozilla',
        expect.any(Object),
      );
    });
  });

  describe('email verification', () => {
    it('should fail with BadRequestException for invalid verification token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail('invalidToken')).rejects.toThrow(BadRequestException);
    });

    it('should fail with BadRequestException for expired token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        verificationTokenExpires: new Date(Date.now() - 10000), // expired
      });
      await expect(service.verifyEmail('expiredToken')).rejects.toThrow(BadRequestException);
    });
  });
});
