import { Test, TestingModule } from '@nestjs/testing';
import { GeoService } from './geo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictException } from '@nestjs/common';

describe('GeoService', () => {
  let service: GeoService;
  let prisma: any;
  let auditService: any;

  const mockPrisma = {
    city: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    ward: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    area: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<GeoService>(GeoService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCity', () => {
    it('should create a city and write audit log', async () => {
      const dto = { name: 'Metro City', state: 'State A' };
      prisma.city.findUnique.mockResolvedValue(null);
      prisma.city.create.mockResolvedValue({ id: 'city-1', ...dto });

      const result = await service.createCity(dto, 'admin-id', '127.0.0.1', 'Mozilla');
      expect(prisma.city.create).toHaveBeenCalledWith({ data: dto });
      expect(auditService.log).toHaveBeenCalledWith(
        'admin-id',
        'CREATE_CITY',
        '127.0.0.1',
        'Mozilla',
        expect.any(Object),
      );
      expect(result.id).toBe('city-1');
    });

    it('should throw ConflictException if city name already exists', async () => {
      const dto = { name: 'Metro City', state: 'State A' };
      prisma.city.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.createCity(dto, 'admin-id')).rejects.toThrow(ConflictException);
    });
  });
});
