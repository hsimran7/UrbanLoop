import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBinDto } from './dto/create-bin.dto';
import { UpdateBinDto } from './dto/update-bin.dto';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class BinsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateBinDto, adminId: string, ip?: string, ua?: string) {
    const cp = await this.prisma.collectionPoint.findUnique({
      where: { id: dto.collectionPointId },
    });
    if (!cp) {
      throw new NotFoundException('Collection point not found.');
    }

    const qrCodeId = `UL-BIN-${dto.type}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const bin = await this.prisma.bin.create({
      data: {
        qrCodeId,
        type: dto.type,
        collectionPointId: dto.collectionPointId,
      },
    });

    await this.auditService.log(adminId, 'CREATE_BIN', ip, ua, {
      binId: bin.id,
      qrCodeId: bin.qrCodeId,
      type: bin.type,
    });

    return bin;
  }

  async findAll(user: { id: string; role: UserRole }) {
    if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.GOVERNMENT_OFFICIAL) {
      return this.prisma.bin.findMany({
        include: {
          collectionPoint: {
            include: {
              property: true,
              area: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.bin.findMany({
      where: {
        collectionPoint: {
          property: {
            ownerId: user.id,
          },
        },
      },
      include: {
        collectionPoint: {
          include: {
            property: true,
            area: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const bin = await this.prisma.bin.findUnique({
      where: { id },
      include: {
        collectionPoint: {
          include: {
            property: true,
            area: true,
          },
        },
      },
    });

    if (!bin) {
      throw new NotFoundException('Bin not found.');
    }

    return bin;
  }

  async update(
    id: string,
    dto: UpdateBinDto,
    userId: string,
    userRole: UserRole,
    ip?: string,
    ua?: string,
  ) {
    // Perform ownership/existence checks
    await this.findOne(id);

    // Citizen cannot change type
    if (userRole === UserRole.CITIZEN && dto.type) {
      throw new ForbiddenException('Citizens are unauthorized to modify bin types.');
    }

    const updated = await this.prisma.bin.update({
      where: { id },
      data: {
        type: userRole === UserRole.CITIZEN ? undefined : dto.type,
        status: dto.status,
        condition: dto.condition,
      },
    });

    await this.auditService.log(userId, 'UPDATE_BIN', ip, ua, {
      binId: id,
      updates: dto,
    });

    return updated;
  }

  async delete(id: string, adminId: string, ip?: string, ua?: string) {
    const bin = await this.findOne(id);
    await this.prisma.bin.delete({ where: { id } });
    await this.auditService.log(adminId, 'DELETE_BIN', ip, ua, {
      binId: id,
      qrCodeId: bin.qrCodeId,
    });
    return { success: true, message: 'Bin deleted successfully.' };
  }
}
