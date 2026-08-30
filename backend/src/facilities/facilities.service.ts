import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateFacilityDto, AssignStaffDto } from './dto/facilities.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createFacility(dto: CreateFacilityDto, userId: string, ip?: string, ua?: string) {
    // Audit-logged creation
    const facility = await this.prisma.$transaction(async (tx) => {
      const fac = await tx.wasteFacility.create({
        data: {
          facilityCode: dto.facilityCode,
          name: dto.name,
          facilityType: dto.facilityType,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          dailyCapacityKg: dto.dailyCapacityKg ?? null,
        },
      });

      // Add accepted waste types
      await Promise.all(
        dto.acceptedWasteTypes.map((wt) =>
          tx.facilityWasteType.create({
            data: {
              facilityId: fac.id,
              wasteType: wt,
            },
          }),
        ),
      );

      return fac;
    });

    await this.auditService.log(userId, 'FACILITY_CREATED', ip, ua, {
      facilityId: facility.id,
      facilityCode: facility.facilityCode,
    });

    return facility;
  }

  async listFacilities() {
    return this.prisma.wasteFacility.findMany({
      include: {
        acceptedWasteTypes: true,
      },
    });
  }

  async assignStaff(facilityId: string, dto: AssignStaffDto, actorId: string, ip?: string, ua?: string) {
    const facility = await this.prisma.wasteFacility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) throw new NotFoundException('Facility not found.');

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role !== UserRole.FACILITY_MANAGER) {
      throw new BadRequestException('User must have the FACILITY_MANAGER role.');
    }

    const assignment = await this.prisma.facilityStaffAssignment.upsert({
      where: {
        userId_facilityId: {
          userId: dto.userId,
          facilityId,
        },
      },
      create: {
        userId: dto.userId,
        facilityId,
        role: dto.role,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        status: 'ACTIVE',
      },
      update: {
        role: dto.role,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        status: 'ACTIVE',
      },
    });

    await this.auditService.log(actorId, 'FACILITY_STAFF_ASSIGNED', ip, ua, {
      facilityId,
      userId: dto.userId,
      assignmentId: assignment.id,
    });

    return assignment;
  }

  async getMyAssignments(userId: string) {
    return this.prisma.facilityStaffAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        facility: {
          include: {
            acceptedWasteTypes: true,
          },
        },
      },
    });
  }

  async checkManagerAssignment(userId: string, facilityId: string) {
    const assign = await this.prisma.facilityStaffAssignment.findUnique({
      where: {
        userId_facilityId: {
          userId,
          facilityId,
        },
      },
    });
    if (!assign || assign.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not assigned to manage this facility.');
    }
  }

  async getOccupancy(facilityId: string) {
    const facility = await this.prisma.wasteFacility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) throw new NotFoundException('Facility not found.');

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);

    // Sum accepted weights received today
    const receipts = await this.prisma.facilityReceipt.findMany({
      where: {
        facilityId,
        receivedAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    });

    const intakeTodayKg = receipts.reduce((sum, r) => sum + r.acceptedWeightKg, 0);

    let status = 'NORMAL';
    if (facility.dailyCapacityKg) {
      if (intakeTodayKg >= facility.dailyCapacityKg) {
        status = 'AT_CAPACITY';
      } else if (intakeTodayKg >= 0.8 * facility.dailyCapacityKg) {
        status = 'NEAR_CAPACITY';
      }
    }

    return {
      facilityId,
      name: facility.name,
      dailyCapacityKg: facility.dailyCapacityKg,
      intakeTodayKg,
      status,
    };
  }
}
