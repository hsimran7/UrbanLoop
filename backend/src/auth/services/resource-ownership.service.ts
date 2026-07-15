import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class ResourceOwnershipService {
  constructor(private prisma: PrismaService) {}

  async checkPropertyOwnership(propertyId: string, user: { id: string; role: UserRole }): Promise<void> {
    if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.GOVERNMENT_OFFICIAL) {
      return;
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found.');
    }

    if (property.ownerId !== user.id) {
      throw new ForbiddenException('Access denied: You do not own this property.');
    }
  }

  async checkBinOwnership(binId: string, user: { id: string; role: UserRole }): Promise<void> {
    if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.GOVERNMENT_OFFICIAL) {
      return;
    }

    const bin = await this.prisma.bin.findUnique({
      where: { id: binId },
      include: {
        collectionPoint: {
          include: {
            property: true,
          },
        },
      },
    });

    if (!bin) {
      throw new NotFoundException('Bin not found.');
    }

    const property = bin.collectionPoint?.property;
    if (property) {
      if (property.ownerId !== user.id) {
        throw new ForbiddenException('Access denied: You do not own the property associated with this bin.');
      }
    }
  }
}
