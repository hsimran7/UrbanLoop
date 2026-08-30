import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { LoadsService } from './loads.service';
import {
  CreateLoadDto,
  SealLoadDto,
  DispatchLoadDto,
  RecordWeighingDto,
  CreateReceiptDto,
  CreateProcessingDto,
} from './dto/loads.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('loads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoadsController {
  constructor(private readonly service: LoadsService) {}

  @Post()
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN)
  create(@Body() dto: CreateLoadDto, @Req() req: any) {
    return this.service.createLoad(dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/seal')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN)
  seal(@Param('id') id: string, @Body() dto: SealLoadDto, @Req() req: any) {
    return this.service.sealLoad(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/dispatch')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN)
  dispatch(@Param('id') id: string, @Body() dto: DispatchLoadDto, @Req() req: any) {
    return this.service.dispatchLoad(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/arrive')
  @Roles(UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMIN)
  arrive(@Param('id') id: string, @Req() req: any) {
    return this.service.arriveLoad(id, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/weigh')
  @Roles(UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMIN)
  weigh(@Param('id') id: string, @Body() dto: RecordWeighingDto, @Req() req: any) {
    return this.service.weighLoad(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/receipt')
  @Roles(UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMIN)
  receipt(@Param('id') id: string, @Body() dto: CreateReceiptDto, @Req() req: any) {
    return this.service.receiptLoad(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/process')
  @Roles(UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMIN)
  process(@Param('id') id: string, @Body() dto: CreateProcessingDto, @Req() req: any) {
    return this.service.processLoad(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Get(':id/trace')
  @Roles(UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN, UserRole.FACILITY_MANAGER, UserRole.SUPERVISOR)
  trace(@Param('id') id: string, @Req() req: any) {
    return this.service.getTraceability(id, req.user.id, req.user.role);
  }

  @Get()
  list(@Req() req: any) {
    return this.service.listLoads(req.user.id, req.user.role);
  }
}
