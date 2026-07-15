import { Test, TestingModule } from '@nestjs/testing';
import { ResourceOwnershipService } from './resource-ownership.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('ResourceOwnershipService', () => {
  let service: ResourceOwnershipService;
  let prisma: any;

  const mockPrisma = {
    property: {
      findUnique: jest.fn(),
    },
    bin: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceOwnershipService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ResourceOwnershipService>(ResourceOwnershipService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkPropertyOwnership', () => {
    it('should pass without throwing if user is an official', async () => {
      await expect(
        service.checkPropertyOwnership('property-1', { id: 'user-1', role: UserRole.GOVERNMENT_OFFICIAL }),
      ).resolves.not.toThrow();
      expect(prisma.property.findUnique).not.toHaveBeenCalled();
    });

    it('should pass if citizen owns the property', async () => {
      prisma.property.findUnique.mockResolvedValue({
        id: 'property-1',
        ownerId: 'citizen-1',
      });

      await expect(
        service.checkPropertyOwnership('property-1', { id: 'citizen-1', role: UserRole.CITIZEN }),
      ).resolves.not.toThrow();
      expect(prisma.property.findUnique).toHaveBeenCalledWith({ where: { id: 'property-1' } });
    });

    it('should throw ForbiddenException if citizen does not own the property (IDOR protection)', async () => {
      prisma.property.findUnique.mockResolvedValue({
        id: 'property-1',
        ownerId: 'citizen-2', // owned by someone else
      });

      await expect(
        service.checkPropertyOwnership('property-1', { id: 'citizen-1', role: UserRole.CITIZEN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if property does not exist', async () => {
      prisma.property.findUnique.mockResolvedValue(null);

      await expect(
        service.checkPropertyOwnership('property-invalid', { id: 'citizen-1', role: UserRole.CITIZEN }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkBinOwnership', () => {
    it('should pass without throwing if user is an admin', async () => {
      await expect(
        service.checkBinOwnership('bin-1', { id: 'user-1', role: UserRole.SYSTEM_ADMIN }),
      ).resolves.not.toThrow();
      expect(prisma.bin.findUnique).not.toHaveBeenCalled();
    });

    it('should pass if bin belongs to property owned by user', async () => {
      prisma.bin.findUnique.mockResolvedValue({
        id: 'bin-1',
        collectionPoint: {
          property: {
            ownerId: 'citizen-1',
          },
        },
      });

      await expect(
        service.checkBinOwnership('bin-1', { id: 'citizen-1', role: UserRole.CITIZEN }),
      ).resolves.not.toThrow();
    });

    it('should throw ForbiddenException if bin belongs to property owned by someone else (IDOR protection)', async () => {
      prisma.bin.findUnique.mockResolvedValue({
        id: 'bin-1',
        collectionPoint: {
          property: {
            ownerId: 'citizen-2',
          },
        },
      });

      await expect(
        service.checkBinOwnership('bin-1', { id: 'citizen-1', role: UserRole.CITIZEN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if bin does not exist', async () => {
      prisma.bin.findUnique.mockResolvedValue(null);

      await expect(
        service.checkBinOwnership('bin-invalid', { id: 'citizen-1', role: UserRole.CITIZEN }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
