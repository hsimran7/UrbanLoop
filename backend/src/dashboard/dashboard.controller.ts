import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesService } from '../schedules/schedules.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly schedulesService: SchedulesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get unified dashboard metrics and feeds based on logged in user role' })
  async getDashboard(@GetUser() user: any) {
    if (
      user.role === UserRole.SYSTEM_ADMIN ||
      user.role === UserRole.GOVERNMENT_OFFICIAL ||
      user.role === UserRole.SUPERVISOR
    ) {
      return this.analyticsService.getExecutiveDashboardSummary();
    }

    if (user.role === UserRole.CITIZEN) {
      const propertiesCount = await this.prisma.property.count({
        where: { ownerId: user.id },
      });
      const activeComplaints = await this.prisma.serviceRequest.count({
        where: {
          createdByUserId: user.id,
          status: { notIn: ['CLOSED', 'RESOLVED'] },
        },
      });
      const resolvedComplaints = await this.prisma.serviceRequest.count({
        where: {
          createdByUserId: user.id,
          status: { in: ['CLOSED', 'RESOLVED'] },
        },
      });

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const schedules = await this.schedulesService.getCitizenSchedules(
        user.id,
        new Date(),
        nextWeek,
      );

      return {
        role: user.role,
        propertiesCount,
        activeComplaints,
        resolvedComplaints,
        schedules,
      };
    }

    if (user.role === UserRole.WORKER) {
      const profile = await this.prisma.workerProfile.findUnique({
        where: { userId: user.id },
        include: {
          shiftAssignments: {
            include: {
              shift: true,
            },
          },
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeAssignments = await this.prisma.dailyAssignment.findMany({
        where: {
          assignmentDate: today,
          team: {
            memberships: {
              some: {
                workerId: profile?.id,
              },
            },
          },
        },
        include: {
          targets: true,
          team: true,
          serviceZone: true,
        },
      });

      return {
        role: user.role,
        profile,
        activeAssignments,
      };
    }

    return { role: user.role };
  }
}
