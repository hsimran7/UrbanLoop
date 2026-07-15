import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { WorkerEmploymentStatus } from '@prisma/client';

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async createShift(dto: CreateShiftDto, adminId: string, ip?: string, ua?: string) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('Start time must be before end time.');
    }

    const shift = await this.prisma.shift.create({
      data: {
        name: dto.name,
        startTime: dto.startTime,
        endTime: dto.endTime,
        cutoffMinutes: dto.cutoffMinutes,
      },
    });

    await this.auditService.log(adminId, 'SHIFT_CREATED', ip, ua, {
      shiftId: shift.id,
      name: shift.name,
    });

    return shift;
  }

  async listShifts() {
    return this.prisma.shift.findMany({
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }
    return shift;
  }

  async assignWorkerShift(shiftId: string, dto: AssignShiftDto, adminId: string, ip?: string, ua?: string) {
    await this.findOne(shiftId);

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: dto.workerId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found.');
    }

    // Rule: Inactive/suspended worker excluded from operational eligibility
    if (
      worker.employmentStatus === WorkerEmploymentStatus.INACTIVE ||
      worker.employmentStatus === WorkerEmploymentStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        `Cannot assign worker to shift: Worker status is ${worker.employmentStatus}.`,
      );
    }

    // Set date to midnight in local/UTC to ensure date-only unique matches
    const workDate = new Date(dto.workDate);
    workDate.setUTCHours(0, 0, 0, 0);

    const existing = await this.prisma.workerShiftAssignment.findUnique({
      where: {
        workerId_shiftId_workDate: {
          workerId: dto.workerId,
          shiftId,
          workDate,
        },
      },
    });

    let assignment;
    if (existing) {
      assignment = await this.prisma.workerShiftAssignment.update({
        where: { id: existing.id },
        data: { status: dto.status },
      });
    } else {
      assignment = await this.prisma.workerShiftAssignment.create({
        data: {
          workerId: dto.workerId,
          shiftId,
          workDate,
          status: dto.status,
        },
      });
    }

    await this.auditService.log(adminId, 'WORKER_SHIFT_ASSIGNED', ip, ua, {
      assignmentId: assignment.id,
      workerId: dto.workerId,
      shiftId,
      workDate: workDate.toISOString(),
      status: dto.status,
    });

    return assignment;
  }

  async listShiftAssignments(workDate?: string) {
    const filterDate = workDate ? new Date(workDate) : undefined;
    if (filterDate) {
      filterDate.setUTCHours(0, 0, 0, 0);
    }

    return this.prisma.workerShiftAssignment.findMany({
      where: filterDate ? { workDate: filterDate } : undefined,
      include: {
        worker: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        shift: true,
      },
      orderBy: [{ workDate: 'desc' }, { shift: { startTime: 'asc' } }],
    });
  }
}
