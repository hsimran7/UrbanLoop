import { Controller, Post, Get, Patch, Body, Param, UseGuards, Ip, Headers } from '@nestjs/common';
import { WorkforceService } from './workforce.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, WorkerEmploymentStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('workforce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workforce')
export class WorkforceController {
  constructor(private workforceService: WorkforceService) {}

  @Post('workers')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create/invite a new worker' })
  async createWorker(
    @Body() dto: CreateWorkerDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.workforceService.createWorker(dto, adminId, ip, ua);
  }

  @Get('workers')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all worker profiles' })
  async listWorkers() {
    return this.workforceService.listWorkers();
  }

  @Patch('workers/:id/status')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update worker employment status' })
  async updateWorkerStatus(
    @Param('id') id: string,
    @Body('status') status: WorkerEmploymentStatus,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.workforceService.updateWorkerStatus(id, status, adminId, ip, ua);
  }
}
