import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { AssignPointsDto } from './dto/assign-points.dto';

@Injectable()
export class ZonesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async createZone(dto: CreateZoneDto, adminId: string, ip?: string, ua?: string) {
    // Assert area exists
    const area = await this.prisma.area.findUnique({
      where: { id: dto.areaId },
    });
    if (!area) {
      throw new NotFoundException('Selected Area does not exist.');
    }

    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.serviceZone.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException('A service zone with this code already exists.');
    }

    const zone = await this.prisma.serviceZone.create({
      data: {
        name: dto.name,
        code,
        areaId: dto.areaId,
      },
    });

    await this.auditService.log(adminId, 'SERVICE_ZONE_CREATED', ip, ua, {
      zoneId: zone.id,
      code: zone.code,
      areaId: zone.areaId,
    });

    return zone;
  }

  async listZones() {
    return this.prisma.serviceZone.findMany({
      include: {
        area: true,
        collectionPoints: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.serviceZone.findUnique({
      where: { id },
      include: {
        area: true,
        collectionPoints: true,
      },
    });
    if (!zone) {
      throw new NotFoundException('Service zone not found.');
    }
    return zone;
  }

  async assignCollectionPoints(
    zoneId: string,
    dto: AssignPointsDto,
    adminId: string,
    ip?: string,
    ua?: string,
  ) {
    const zone = await this.findOne(zoneId);

    // Retrieve all targeted collection points
    const collectionPoints = await this.prisma.collectionPoint.findMany({
      where: {
        id: { in: dto.collectionPointIds },
      },
    });

    if (collectionPoints.length !== dto.collectionPointIds.length) {
      throw new BadRequestException('Some collection point IDs do not exist.');
    }

    // Validation: A collection point cannot be assigned to a zone in another area.
    for (const cp of collectionPoints) {
      if (cp.areaId !== zone.areaId) {
        throw new BadRequestException(
          `Collection point "${cp.name}" belongs to area ${cp.areaId}, but service zone "${zone.name}" belongs to area ${zone.areaId}. They must match.`,
        );
      }
    }

    // Perform update in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Clear serviceZoneId for any collection point currently in this zone that is NOT in the new list (wait, is it a replace or append? Let's make it a set. If we just assign these specific collection points to the zone, we update them. But let's check: "A collection point belongs to its Area and may additionally be assigned to one active ServiceZone within that same Area."
      // Let's implement set behavior: set all collection points in this zone to null, then assign the new ones. Or simply update the target ones to point to this zone. Let's make it an assignment updates: assign the list of points to this zone. If they were in another zone, they will move to this one. This is perfect.)
      await tx.collectionPoint.updateMany({
        where: { id: { in: dto.collectionPointIds } },
        data: { serviceZoneId: zoneId },
      });
    });

    await this.auditService.log(adminId, 'ZONE_COLLECTION_POINTS_ASSIGNED', ip, ua, {
      zoneId,
      collectionPointIds: dto.collectionPointIds,
    });

    return { success: true, count: dto.collectionPointIds.length };
  }
}
