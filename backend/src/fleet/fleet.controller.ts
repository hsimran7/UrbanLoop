import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { FleetService } from './fleet.service';
import {
  CreateDepotDto,
  CreateVehicleDto,
  CreateDriverDto,
  CreateRouteDto,
  CreateDailyRouteAssignmentDto,
  SubmitInspectionDto,
  SubmitTelemetryDto,
  LogBreakdownDto,
  LogFuelDto,
  ScheduleMaintenanceDto,
} from './dto/fleet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, VehicleStatus } from '@prisma/client';

@Controller('fleet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FleetController {
  constructor(private readonly service: FleetService) {}

  @Post('depots')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  createDepot(@Body() dto: CreateDepotDto) {
    return this.service.createDepot(dto);
  }

  @Get('depots')
  getDepots() {
    return this.service.getDepots();
  }

  @Post('vehicles')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.service.createVehicle(dto);
  }

  @Get('vehicles')
  getVehicles() {
    return this.service.getVehicles();
  }

  @Post('drivers')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  createDriver(@Body() dto: CreateDriverDto) {
    return this.service.createDriver(dto);
  }

  @Post('shifts/clock-in')
  @Roles(UserRole.WORKER)
  clockIn(@Req() req: any) {
    return this.service.clockInShift(req.user.id);
  }

  @Post('shifts/clock-out')
  @Roles(UserRole.WORKER)
  clockOut(@Req() req: any) {
    return this.service.clockOutShift(req.user.id);
  }

  @Post('vehicles/:id/status')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  updateStatus(@Param('id') id: string, @Body('status') status: VehicleStatus, @Req() req: any) {
    return this.service.updateVehicleStatus(id, status, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post('vehicles/:id/inspection')
  @Roles(UserRole.WORKER)
  submitInspection(@Param('id') id: string, @Body() dto: SubmitInspectionDto, @Req() req: any) {
    return this.service.submitPreTripInspection(id, dto, req.user.id);
  }

  @Post('routes')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  createRoute(@Body() dto: CreateRouteDto) {
    return this.service.createRoute(dto);
  }

  @Post('assignments')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  createAssignment(@Body() dto: CreateDailyRouteAssignmentDto, @Req() req: any) {
    return this.service.createAssignment(dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post('telemetry')
  submitTelemetry(@Body() dto: SubmitTelemetryDto) {
    return this.service.submitTelemetry(dto);
  }

  @Post('vehicles/:id/breakdown')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR)
  logBreakdown(@Param('id') id: string, @Body() dto: LogBreakdownDto, @Req() req: any) {
    return this.service.logBreakdown(id, dto, req.user.id);
  }

  @Post('vehicles/:id/fuel')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR)
  logFuel(@Param('id') id: string, @Body() dto: LogFuelDto, @Req() req: any) {
    return this.service.logFuelRefill(id, dto, req.user.id);
  }

  @Post('vehicles/:id/maintenance')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN)
  scheduleMaintenance(@Param('id') id: string, @Body() dto: ScheduleMaintenanceDto) {
    return this.service.scheduleMaintenance(id, dto);
  }

  @Get('driver/my-assignment')
  @Roles(UserRole.WORKER)
  myAssignment(@Req() req: any) {
    return this.service.getMyDriverAssignment(req.user.id);
  }

  @Get('driver/kpis')
  @Roles(UserRole.WORKER)
  myKPIs(@Req() req: any) {
    return this.service.getDriverKPIs(req.user.id);
  }

  @Get('vehicles/:id/telemetry')
  getTelemetryHistory(@Param('id') id: string) {
    return this.service.getVehicleTelemetryHistory(id);
  }

  @Get('notifications')
  getNotifications() {
    return this.service.getNotifications();
  }
}
