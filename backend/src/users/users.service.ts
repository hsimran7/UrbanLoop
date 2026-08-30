import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, generateToken, hashToken } from '../common/utils/crypto.util';
import { UserRole, UserStatus, WorkerEmploymentStatus } from '@prisma/client';
import { realtimeEventEmitter } from '../realtime/realtime.event-emitter';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (user) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async createCitizen(dto: { name: string; email: string; phone: string; passwordPlain: string }) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await hashPassword(dto.passwordPlain);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        passwordHash,
        role: UserRole.CITIZEN,
        status: UserStatus.PENDING, // requires admin approval
        emailVerified: true,
      },
    });

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async createPendingWorker(dto: { name: string; employeeCode: string; email: string; phone: string; passwordPlain: string }) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const existingProfile = await this.prisma.workerProfile.findUnique({
      where: { employeeCode: dto.employeeCode.trim() },
    });
    if (existingProfile) {
      throw new ConflictException('A worker profile with this employee code already exists.');
    }

    const passwordHash = await hashPassword(dto.passwordPlain);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: dto.name.trim(),
          phone: dto.phone.trim(),
          passwordHash,
          role: UserRole.WORKER,
          status: UserStatus.PENDING, // Worker stays pending until approved!
          emailVerified: true,
        },
      });

      const profile = await tx.workerProfile.create({
        data: {
          userId: user.id,
          employeeCode: dto.employeeCode.trim(),
          employmentStatus: WorkerEmploymentStatus.INACTIVE, // inactive initially
          phone: dto.phone.trim(),
          joinedAt: new Date(),
        },
      });

      return { user, profile };
    });

    const { passwordHash: _, ...userWithoutPassword } = result.user;
    return {
      user: userWithoutPassword,
      profile: result.profile,
    };
  }

  async createAdminOrWorker(email: string, passwordPlain: string, role: UserRole) {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await hashPassword(passwordPlain);

    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async listCitizens(search?: string, status?: UserStatus) {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.CITIZEN,
        status: status ? status : undefined,
        OR: search
          ? [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new ConflictException('User not found.');
    }
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });

    if (status === UserStatus.ACTIVE || status === UserStatus.SUSPENDED) {
      await this.prisma.notification.create({
        data: {
          userId: id,
          title: `Account ${status === UserStatus.ACTIVE ? 'Approved' : 'Suspended'}`,
          body: `Your account registration has been ${status.toLowerCase()}.`,
          type: status === UserStatus.ACTIVE ? 'INFO' : 'ALERT',
        }
      });
      
      realtimeEventEmitter.emit('notification', {
        userId: id,
        title: `Account ${status === UserStatus.ACTIVE ? 'Approved' : 'Suspended'}`,
        body: `Your account registration has been ${status.toLowerCase()}.`,
        type: status === UserStatus.ACTIVE ? 'INFO' : 'ALERT',
      });
    }

    return updatedUser;
  }
}
