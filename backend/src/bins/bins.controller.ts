import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Ip,
  Headers,
} from '@nestjs/common';
import { BinsService } from './bins.service';
import { CreateBinDto } from './dto/create-bin.dto';
import { UpdateBinDto } from './dto/update-bin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ResourceOwnershipService } from '../auth/services/resource-ownership.service';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('bins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bins')
export class BinsController {
  constructor(
    private binsService: BinsService,
    private ownershipService: ResourceOwnershipService,
  ) {}

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Register a new waste bin (Admin/Official only)' })
  async create(
    @Body() dto: CreateBinDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.create(dto, adminId, ip, ua);
  }

  @Post('register')
  @Roles(UserRole.CITIZEN)
  @ApiOperation({ summary: 'Register a new waste bin (Citizen)' })
  async registerBin(
    @Body() dto: CreateBinDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.registerBin(dto, userId, ip, ua);
  }

  @Patch(':id/verify')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Approve or reject bin registration (Admin/Official only)' })
  async verifyBin(
    @Param('id') id: string,
    @Body('status') status: 'VERIFIED' | 'REJECTED',
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.verifyBin(id, status, adminId, ip, ua);
  }

  @Get()
  @ApiOperation({ summary: 'Get list of bins (filtered by role)' })
  async findAll(@GetUser() user: any) {
    return this.binsService.findAll(user);
  }

  @Get('hierarchy')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get geographical hierarchy structure' })
  async getHierarchy() {
    return this.binsService.getHierarchy();
  }

  @Get('area-summaries')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get summary metrics grouped by Area' })
  async getAreaSummaries(@Query() query: any) {
    return this.binsService.getAreaSummaries(query);
  }

  @Get('area-notifications')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get operational alerts at area level' })
  async getAreaNotifications(@Query() query: any) {
    return this.binsService.getAreaNotifications(query);
  }

  @Get('operational-queue')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get prioritized queue of areas' })
  async getOperationalQueue(@Query() query: any) {
    return this.binsService.getOperationalQueue(query);
  }

  @Get('area-drilldown/:areaId')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get deep drilldown operations metrics for a specific area' })
  async getAreaDrilldown(@Param('areaId') areaId: string) {
    return this.binsService.getAreaDrilldown(areaId);
  }

  @Get('predictive-intelligence')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get predictive operational forecasts' })
  async getPredictiveIntelligence(@Query() query: any) {
    return this.binsService.getPredictiveIntelligence(query);
  }

  @Get('live-activity')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get chronological activity stream' })
  async getLiveActivity(@Query() query: any) {
    return this.binsService.getLiveActivity(query);
  }

  @Get('resource-allocation')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get resource allocation vs requirement' })
  async getResourceAllocation(@Query() query: any) {
    return this.binsService.getResourceAllocation(query);
  }

  @Get('ai-recommendations')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get automated AI-driven recommendations' })
  async getAiRecommendations(@Query() query: any) {
    return this.binsService.getAiRecommendations(query);
  }

  @Post('actions/:action')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Execute command action log' })
  async executeAction(
    @Param('action') action: string,
    @Body() body: any,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.executeCommandAction(action, body, userId, ip, ua);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a bin' })
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    await this.ownershipService.checkBinOwnership(id, user);
    return this.binsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bin capacity status or physical condition' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBinDto,
    @GetUser() user: any,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    await this.ownershipService.checkBinOwnership(id, user);
    return this.binsService.update(id, dto, user.id, user.role, ip, ua);
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  @ApiOperation({ summary: 'Delete a bin (Admin/Official only)' })
  async delete(
    @Param('id') id: string,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.binsService.delete(id, adminId, ip, ua);
  }
}
