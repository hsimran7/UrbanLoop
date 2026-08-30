import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { AuditService } from '../audit/audit.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { PropertyStatus, CollectionPointStatus, BinType, UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { realtimeEventEmitter } from '../realtime/realtime.event-emitter';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private assignmentsService: AssignmentsService,
  ) {}

  async create(dto: CreatePropertyDto, userId: string, ip?: string, ua?: string) {
    let finalAreaId = dto.areaId;

    if (!finalAreaId) {
      if (!dto.cityName || !dto.stateName || !dto.areaName) {
        throw new BadRequestException('Either areaId or cityName, stateName, and areaName must be provided.');
      }

      // Find or create State
      const stateNameClean = dto.stateName.trim();
      const cityNameClean = dto.cityName.trim();
      let state = await this.prisma.state.findUnique({ where: { name: stateNameClean } });
      if (!state) {
        state = await this.prisma.state.create({ data: { name: stateNameClean } });
      }

      // Find or create District
      const districtNameClean = `${cityNameClean} District`; // Fallback since we don't have districtName in DTO
      let district = await this.prisma.district.findFirst({ where: { name: districtNameClean, stateId: state.id } });
      if (!district) {
        district = await this.prisma.district.create({ data: { name: districtNameClean, stateId: state.id } });
      }

      // Find or create City
      let city = await this.prisma.city.findUnique({
        where: { name: cityNameClean },
      });
      if (!city) {
        city = await this.prisma.city.create({
          data: {
            name: cityNameClean,
            districtId: district.id,
            timezone: 'Asia/Kolkata',
          },
        });
      }

      // Find or create Ward
      const wardNumber = dto.wardNumber || 1;
      let ward = await this.prisma.ward.findUnique({
        where: {
          cityId_number: {
            cityId: city.id,
            number: wardNumber,
          },
        },
      });
      if (!ward) {
        ward = await this.prisma.ward.create({
          data: {
            number: wardNumber,
            name: dto.wardName ? dto.wardName.trim() : `Ward ${wardNumber}`,
            cityId: city.id,
          },
        });
      }

      // Find or create Area
      const areaNameClean = dto.areaName.trim();
      let area = await this.prisma.area.findUnique({
        where: {
          wardId_name: {
            wardId: ward.id,
            name: areaNameClean,
          },
        },
      });
      if (!area) {
        area = await this.prisma.area.create({
          data: {
            name: areaNameClean,
            wardId: ward.id,
          },
        });
      }

      finalAreaId = area.id;
    } else {
      const area = await this.prisma.area.findUnique({
        where: { id: finalAreaId },
      });
      if (!area) {
        throw new NotFoundException('Selected area does not exist.');
      }
    }

    const property = await this.prisma.property.create({
      data: {
        address: dto.address.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        ownerId: userId,
        areaId: finalAreaId,
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
        collectionPoints: {
          include: {
            bins: true,
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

    realtimeEventEmitter.emit('property.approved', {
      propertyId: id,
      status,
      timestamp: new Date().toISOString(),
    });

    await this.prisma.notification.create({
      data: {
        userId: property.ownerId,
        title: `Property Registration ${status === PropertyStatus.VERIFIED ? 'Verified' : 'Rejected'}`,
        body: `Your property registration at ${property.address} has been ${status.toLowerCase()}.`,
        type: status === PropertyStatus.VERIFIED ? 'INFO' : 'ALERT',
      }
    });

    realtimeEventEmitter.emit('notification', {
      userId: property.ownerId,
      title: `Property Registration ${status === PropertyStatus.VERIFIED ? 'Verified' : 'Rejected'}`,
      body: `Your property registration at ${property.address} has been ${status.toLowerCase()}.`,
      type: status === PropertyStatus.VERIFIED ? 'INFO' : 'ALERT',
    });

    return this.findOne(id);
  }
}
