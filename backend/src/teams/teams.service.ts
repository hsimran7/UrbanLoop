import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async createTeam(dto: CreateTeamDto, adminId: string, ip?: string, ua?: string) {
    const existing = await this.prisma.collectionTeam.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new ConflictException('A team with this code already exists.');
    }

    const team = await this.prisma.collectionTeam.create({
      data: {
        name: dto.name,
        code: dto.code.trim().toUpperCase(),
      },
    });

    await this.auditService.log(adminId, 'TEAM_CREATED', ip, ua, {
      teamId: team.id,
      code: team.code,
    });

    return team;
  }

  async listTeams() {
    return this.prisma.collectionTeam.findMany({
      include: {
        supervisor: {
          select: {
            id: true,
            email: true,
          },
        },
        memberships: {
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
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const team = await this.prisma.collectionTeam.findUnique({
      where: { id },
      include: {
        supervisor: true,
        memberships: true,
      },
    });
    if (!team) {
      throw new NotFoundException('Collection team not found.');
    }
    return team;
  }

  async addTeamMember(teamId: string, dto: AddMemberDto, adminId: string, ip?: string, ua?: string) {
    // Assert team exists
    await this.findOne(teamId);

    // Assert worker profile exists
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: dto.workerId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found.');
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;

    if (effectiveUntil && effectiveFrom >= effectiveUntil) {
      throw new BadRequestException('Effective from date must be before effective until date.');
    }

    // Check conflicting active team memberships for this worker
    const existingMemberships = await this.prisma.teamMembership.findMany({
      where: { workerId: dto.workerId },
    });

    for (const m of existingMemberships) {
      const mFrom = new Date(m.effectiveFrom).getTime();
      const mUntil = m.effectiveUntil ? new Date(m.effectiveUntil).getTime() : Infinity;

      const currentFrom = effectiveFrom.getTime();
      const currentUntil = effectiveUntil ? effectiveUntil.getTime() : Infinity;

      // Overlap condition: start1 < end2 && start2 < end1
      const overlap = currentFrom < mUntil && mFrom < currentUntil;
      if (overlap) {
        throw new ConflictException(
          `Conflict: Worker is already assigned to a team during this period.`,
        );
      }
    }

    const membership = await this.prisma.teamMembership.create({
      data: {
        teamId,
        workerId: dto.workerId,
        role: dto.role,
        effectiveFrom,
        effectiveUntil,
      },
    });

    await this.auditService.log(adminId, 'TEAM_MEMBERSHIP_ADDED', ip, ua, {
      teamId,
      workerId: dto.workerId,
      membershipId: membership.id,
      role: dto.role,
    });

    return membership;
  }

  async removeTeamMember(membershipId: string, adminId: string, ip?: string, ua?: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership) {
      throw new NotFoundException('Team membership record not found.');
    }

    // Mark as ended by setting effectiveUntil to now
    const updated = await this.prisma.teamMembership.update({
      where: { id: membershipId },
      data: { effectiveUntil: new Date() },
    });

    await this.auditService.log(adminId, 'TEAM_MEMBERSHIP_REMOVED', ip, ua, {
      membershipId,
      teamId: membership.teamId,
      workerId: membership.workerId,
    });

    return updated;
  }

  async assignSupervisor(teamId: string, supervisorId: string, adminId: string, ip?: string, ua?: string) {
    await this.findOne(teamId);

    // Validate user exists and role is appropriate (SUPERVISOR or SYSTEM_ADMIN or GOVERNMENT_OFFICIAL)
    const user = await this.prisma.user.findUnique({
      where: { id: supervisorId },
    });
    if (!user) {
      throw new NotFoundException('Supervisor user not found.');
    }
    if (
      user.role !== UserRole.SUPERVISOR &&
      user.role !== UserRole.GOVERNMENT_OFFICIAL &&
      user.role !== UserRole.SYSTEM_ADMIN
    ) {
      throw new BadRequestException('Target user is not authorized to act as a supervisor.');
    }

    const updated = await this.prisma.collectionTeam.update({
      where: { id: teamId },
      data: { supervisorId },
    });

    await this.auditService.log(adminId, 'TEAM_SUPERVISOR_ASSIGNED', ip, ua, {
      teamId,
      supervisorId,
    });

    return updated;
  }
}
