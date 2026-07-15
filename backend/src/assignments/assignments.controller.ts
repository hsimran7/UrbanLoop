import { Controller, Post, Get, Body, Query, UseGuards, Ip, Headers, Param, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CreateResponsibilityDto } from './dto/create-responsibility.dto';
import { GenerateAssignmentsDto } from './dto/generate-assignments.dto';
import {
  VerifyBinDto,
  CollectTargetDto,
  MissTargetDto,
  SkipTargetDto,
  CorrectTargetDto,
} from './dto/execution.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, GenerationSource } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

@ApiTags('assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @Post('responsibilities')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Assign a team to a service zone for planning responsibility' })
  async createResponsibility(
    @Body() dto: CreateResponsibilityDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.createResponsibility(dto, adminId, ip, ua);
  }

  @Get('responsibilities')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List team service responsibilities' })
  async listResponsibilities() {
    return this.assignmentsService.listResponsibilities();
  }

  @Post('generate')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Generate daily work assignments' })
  async generateDailyAssignments(
    @Body() dto: GenerateAssignmentsDto,
    @GetUser('id') adminId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.generateDailyAssignments(dto, adminId, GenerationSource.MANUAL, ip, ua);
  }

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List all daily assignments' })
  async listAssignments(@Query('date') date?: string) {
    return this.assignmentsService.getAssignmentsList(date);
  }

  @Get('my-today')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Worker portal: Get today\'s active assignments' })
  async getWorkerToday(@GetUser('id') userId: string) {
    return this.assignmentsService.getWorkerTodayAssignments(userId);
  }

  @Post(':id/start')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Worker portal: Start daily assignment' })
  async startAssignment(
    @Param('id') assignmentId: string,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.startAssignment(assignmentId, userId, ip, ua);
  }

  @Post(':assignmentId/verify-bin')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Worker portal: Verify scanned bin QR code' })
  async verifyBin(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: VerifyBinDto,
    @GetUser('id') userId: string,
  ) {
    return this.assignmentsService.verifyBin(assignmentId, dto.qrCodeId, userId);
  }

  @Post(':assignmentId/targets/:targetId/collect')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Worker portal: Record successful bin collection' })
  async collectTarget(
    @Param('assignmentId') assignmentId: string,
    @Param('targetId') targetId: string,
    @Body() dto: CollectTargetDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.collectTarget(assignmentId, targetId, dto, userId, ip, ua);
  }

  @Post(':assignmentId/targets/:targetId/miss')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Worker portal: Record missed collection point' })
  async missTarget(
    @Param('assignmentId') assignmentId: string,
    @Param('targetId') targetId: string,
    @Body() dto: MissTargetDto,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.missTarget(assignmentId, targetId, dto, userId, ip, ua);
  }

  @Post(':assignmentId/targets/:targetId/skip')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Record skipped collection point (requires auth rules)' })
  async skipTarget(
    @Param('assignmentId') assignmentId: string,
    @Param('targetId') targetId: string,
    @Body() dto: SkipTargetDto,
    @GetUser('id') userId: string,
    @GetUser('role') userRole: UserRole,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.skipTarget(assignmentId, targetId, dto, userId, userRole, ip, ua);
  }

  @Post(':id/complete')
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Worker portal: Complete daily assignment shift' })
  async completeAssignment(
    @Param('id') assignmentId: string,
    @GetUser('id') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.completeAssignment(assignmentId, userId, ip, ua);
  }

  @Post(':assignmentId/targets/:targetId/correct')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Supervisor portal: Controlled correction/override' })
  async correctTarget(
    @Param('assignmentId') assignmentId: string,
    @Param('targetId') targetId: string,
    @Body() dto: CorrectTargetDto,
    @GetUser('id') supervisorUserId: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.assignmentsService.correctTarget(assignmentId, targetId, dto, supervisorUserId, ip, ua);
  }

  @Get('active-ops')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Supervisor portal: Get active assignments progress' })
  async getActiveOperations(
    @GetUser('id') supervisorUserId: string,
    @GetUser('role') userRole: UserRole,
  ) {
    return this.assignmentsService.getActiveOperations(supervisorUserId, userRole);
  }

  @Post('evidence/upload')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file evidence (image, max 5MB)' })
  async uploadEvidence(
    @UploadedFile() file: any,
    @GetUser('id') userId: string,
  ) {
    return this.assignmentsService.saveEvidenceFile(file, userId);
  }

  @Get('evidence/:id')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Download/view uploaded file evidence' })
  async getEvidence(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { filePath, mimeType } = await this.assignmentsService.getEvidenceFile(id);
    res.setHeader('Content-Type', mimeType);
    return res.sendFile(filePath);
  }

  @Get('citizen-history')
  @Roles(UserRole.CITIZEN)
  @ApiOperation({ summary: 'Citizen: Get verified properties emptying history' })
  async getCitizenHistory(@GetUser('id') citizenUserId: string) {
    return this.assignmentsService.getCitizenCollectionHistory(citizenUserId);
  }
}
