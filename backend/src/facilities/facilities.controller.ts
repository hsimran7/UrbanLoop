import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto, AssignStaffDto } from './dto/facilities.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('facilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacilitiesController {
  constructor(private readonly service: FacilitiesService) {}

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  create(@Body() dto: CreateFacilityDto, @Req() req: any) {
    return this.service.createFacility(dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Get()
  list() {
    return this.service.listFacilities();
  }

  @Post(':id/staff')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  assignStaff(@Param('id') id: string, @Body() dto: AssignStaffDto, @Req() req: any) {
    return this.service.assignStaff(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Get('my-assignments')
  @Roles(UserRole.FACILITY_MANAGER)
  myAssignments(@Req() req: any) {
    return this.service.getMyAssignments(req.user.id);
  }

  @Get(':id/occupancy')
  getOccupancy(@Param('id') id: string) {
    return this.service.getOccupancy(id);
  }
}
