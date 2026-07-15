import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { AuditService } from '../audit/audit.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { PropertyStatus, CollectionPointStatus, BinType, UserRole } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private assignmentsService: AssignmentsService,
  ) {}

  async create(dto: CreatePropertyDto, userId: string, ip?: string, ua?: string) {
    const area = await this.prisma.area.findUnique({
      where: { id: dto.areaId },
    });
    if (!area) {
      throw new NotFoundException('Selected area does not exist.');
    }

    const property = await this.prisma.property.create({
      data: {
        address: dto.address.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        ownerId: userId,
        areaId: dto.areaId,
        status: PropertyStatus.PENDING,
      },
    });

    await this.auditService.log(userId, 'CREATE_PROPERTY', ip, ua, {
      propertyId: property.id,
      address: property.address,
    });

    return property;
  }

  async findAll(user: { id: string; role: UserRole }) {
    if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.GOVERNMENT_OFFICIAL) {
      return this.prisma.property.findMany({
        include: {
          area: {
            include: {
              ward: {
                include: {
                  city: true,
                },
              },
            },
          },
          owner: {
            select: {
              id: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.property.findMany({
      where: { ownerId: user.id },
      include: {
        area: {
          include: {
            ward: {
              include: {
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        area: {
          include: {
            ward: {
              include: {
                city: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
        collectionPoints: {
          include: {
            bins: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found.');
    }

    return property;
  }

  async verifyProperty(
    id: string,
    status: PropertyStatus,
    adminId: string,
    ip?: string,
    ua?: string,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { collectionPoints: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found.');
    }

    if (property.status !== PropertyStatus.PENDING) {
      throw new BadRequestException('Property has already been reviewed.');
    }

    if (status === PropertyStatus.PENDING) {
      throw new BadRequestException('Invalid status update.');
    }

    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: { status },
    });

    await this.auditService.log(adminId, 'VERIFY_PROPERTY', ip, ua, {
      propertyId: id,
      status,
    });

    if (status === PropertyStatus.VERIFIED) {
      let cp = property.collectionPoints[0];
      if (!cp) {
        cp = await this.prisma.collectionPoint.create({
          data: {
            name: `CP for ${property.address}`,
            latitude: property.latitude,
            longitude: property.longitude,
            propertyId: property.id,
            areaId: property.areaId,
            status: CollectionPointStatus.ACTIVE,
          },
        });

        await this.auditService.log(adminId, 'CREATE_COLLECTION_POINT', ip, ua, {
          collectionPointId: cp.id,
          propertyId: property.id,
        });

        const dryBinId = `UL-BIN-DRY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const wetBinId = `UL-BIN-WET-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        await this.prisma.bin.createMany({
          data: [
            {
              qrCodeId: dryBinId,
              type: BinType.DRY,
              collectionPointId: cp.id,
            },
            {
              qrCodeId: wetBinId,
              type: BinType.WET,
              collectionPointId: cp.id,
            },
          ],
        });

        await this.auditService.log(adminId, 'REGISTER_DEFAULT_BINS', ip, ua, {
          collectionPointId: cp.id,
          dryBin: dryBinId,
          wetBin: wetBinId,
        });

        // Trigger Phase 5 controlled new property transition hook
        await this.assignmentsService.handleNewPropertyVerification(id);
      }
    }

    return this.findOne(id);
  }
}
