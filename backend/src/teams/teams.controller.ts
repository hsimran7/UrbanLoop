import { Controller, Post, Get, Delete, Patch, Body, Param, UseGuards, Ip, Headers } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a new collection team' })
  async createTeam(
    @Body() dto: CreateTeamDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.teamsService.createTeam(dto, adminId, ip, ua);
  }

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all collection teams' })
  async listTeams() {
    return this.teamsService.listTeams();
  }

  @Post(':id/members')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Add a worker to a team' })
  async addTeamMember(
    @Param('id') teamId: string,
    @Body() dto: AddMemberDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.teamsService.addTeamMember(teamId, dto, adminId, ip, ua);
  }

  @Delete('memberships/:membershipId')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'End a team membership' })
  async removeTeamMember(
    @Param('membershipId') membershipId: string,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.teamsService.removeTeamMember(membershipId, adminId, ip, ua);
  }

  @Patch(':id/supervisor')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Assign a supervisor to a team' })
  async assignSupervisor(
    @Param('id') teamId: string,
    @Body('supervisorId') supervisorId: string,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.teamsService.assignSupervisor(teamId, supervisorId, adminId, ip, ua);
  }
}
