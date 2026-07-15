import { Controller, Post, Get, Patch, Body, Param, UseGuards, Ip, Headers } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { AssignPointsDto } from './dto/assign-points.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('zones')
export class ZonesController {
  constructor(private zonesService: ZonesService) {}

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a service zone within an Area' })
  async createZone(
    @Body() dto: CreateZoneDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.zonesService.createZone(dto, adminId, ip, ua);
  }

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all service zones' })
  async listZones() {
    return this.zonesService.listZones();
  }

  @Patch(':id/collection-points')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Assign collection points to a service zone' })
  async assignCollectionPoints(
    @Param('id') zoneId: string,
    @Body() dto: AssignPointsDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.zonesService.assignCollectionPoints(zoneId, dto, adminId, ip, ua);
  }
}
