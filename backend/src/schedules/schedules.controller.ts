import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Ip,
  Headers,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ScheduleStatus, UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  @Post('schedules')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Create a recurring collection schedule (Admin/Official only)' })
  async createSchedule(
    @Body() dto: CreateScheduleDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.schedulesService.createSchedule(dto, userId, ip, ua);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'Get list of recurring schedules' })
  async findAll(@GetUser() user: any) {
    return this.schedulesService.findAll(user);
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get recurring schedule details' })
  async findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }

  @Patch('schedules/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Update recurring schedule settings (Admin/Official only)' })
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: Partial<CreateScheduleDto>,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.schedulesService.updateSchedule(id, dto, userId, ip, ua);
  }

  @Patch('schedules/:id/status')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Activate or deactivate schedule (Admin/Official only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: ScheduleStatus,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.schedulesService.updateStatus(id, status, userId, ip, ua);
  }

  @Post('schedule-exceptions')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Register a schedule exception or special collection (Admin/Official only)' })
  async createException(
    @Body() dto: CreateExceptionDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.schedulesService.createException(dto, userId, ip, ua);
  }
}
