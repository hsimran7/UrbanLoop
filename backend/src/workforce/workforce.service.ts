import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { WorkerEmploymentStatus, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '../common/utils/crypto.util';

@Injectable()
export class WorkforceService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async createWorker(dto: CreateWorkerDto, adminId: string, ip?: string, ua?: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    
    // Validate email conflict
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    // Validate employee code conflict
    const existingProfile = await this.prisma.workerProfile.findUnique({
      where: { employeeCode: dto.employeeCode },
    });
    if (existingProfile) {
      throw new ConflictException('A worker profile with this employee code already exists.');
    }

    // Create user and profile in a transaction
    const passwordHash = await hashPassword(dto.password);
    const worker = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: UserRole.WORKER,
          status: UserStatus.ACTIVE,
          emailVerified: true,
        },
      });

      const profile = await tx.workerProfile.create({
        data: {
          userId: user.id,
          employeeCode: dto.employeeCode,
          employmentStatus: WorkerEmploymentStatus.ACTIVE,
          phone: dto.phone || null,
          joinedAt: new Date(),
        },
      });

      return { user, profile };
    });

    await this.auditService.log(adminId, 'WORKER_PROFILE_CREATED', ip, ua, {
      workerId: worker.profile.id,
      userId: worker.user.id,
      employeeCode: worker.profile.employeeCode,
    });

    return {
      id: worker.profile.id,
      userId: worker.user.id,
      email: worker.user.email,
      employeeCode: worker.profile.employeeCode,
      employmentStatus: worker.profile.employmentStatus,
      phone: worker.profile.phone,
      joinedAt: worker.profile.joinedAt,
      createdAt: worker.profile.createdAt,
    };
  }

  async listWorkers() {
    const profiles = await this.prisma.workerProfile.findMany({
      include: {
        user: {
          select: {
            email: true,
            status: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      email: p.user.email,
      employeeCode: p.employeeCode,
      employmentStatus: p.employmentStatus,
      phone: p.phone,
      joinedAt: p.joinedAt,
      createdAt: p.createdAt,
      userStatus: p.user.status,
    }));
  }

  async findOne(id: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!profile) {
      throw new NotFoundException('Worker profile not found.');
    }
    return profile;
  }

  async updateWorkerStatus(
    id: string,
    status: WorkerEmploymentStatus,
    adminId: string,
    ip?: string,
    ua?: string,
  ) {
    const profile = await this.findOne(id);

    const oldStatus = profile.employmentStatus;
    if (oldStatus === status) {
      return profile;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const upProfile = await tx.workerProfile.update({
        where: { id },
        data: { employmentStatus: status },
      });

      // Synchronize User status if worker is suspended
      let newCtxUserStatus: UserStatus = UserStatus.ACTIVE;
      if (status === WorkerEmploymentStatus.SUSPENDED) {
        newCtxUserStatus = UserStatus.SUSPENDED;
      } else if (status === WorkerEmploymentStatus.INACTIVE) {
        newCtxUserStatus = UserStatus.PENDING; // or suspended/inactive mapping
      }

      await tx.user.update({
        where: { id: profile.userId },
        data: { status: newCtxUserStatus },
      });

      return upProfile;
    });

    await this.auditService.log(adminId, 'WORKER_STATUS_CHANGED', ip, ua, {
      workerId: id,
      oldStatus,
      newStatus: status,
    });

    return updated;
  }
}
