import { Controller, Post, Get, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import {
  CreateServiceRequestDto,
  TriageRequestDto,
  AssignRequestDto,
  RequestInformationDto,
  ProvideInformationDto,
  ResolveRequestDto,
  ReopenRequestDto,
  SubmitFeedbackDto,
  AddCommentDto,
} from './dto/requests.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('service-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post()
  create(@Body() dto: CreateServiceRequestDto, @Req() req: any) {
    return this.service.createRequest(dto, req.user?.id, req.user?.role, req.ip, req.headers['user-agent']);
  }

  @Post(':id/triage')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  triage(@Param('id') id: string, @Body() dto: TriageRequestDto, @Req() req: any) {
    return this.service.triageRequest(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/assign')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  assign(@Param('id') id: string, @Body() dto: AssignRequestDto, @Req() req: any) {
    return this.service.assignRequest(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/start')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN)
  start(@Param('id') id: string, @Req() req: any) {
    return this.service.startWork(id, req.user.id, req.user.role, req.ip, req.headers['user-agent']);
  }

  @Post(':id/request-information')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  requestInfo(@Param('id') id: string, @Body() dto: RequestInformationDto, @Req() req: any) {
    return this.service.requestInformation(id, dto, req.user.id, req.user.role, req.ip, req.headers['user-agent']);
  }

  @Post(':id/provide-information')
  @Roles(UserRole.CITIZEN, UserRole.SYSTEM_ADMIN)
  provideInfo(@Param('id') id: string, @Body() dto: ProvideInformationDto, @Req() req: any) {
    return this.service.provideInformation(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/resolve')
  @Roles(UserRole.WORKER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.GOVERNMENT_OFFICIAL)
  resolve(@Param('id') id: string, @Body() dto: ResolveRequestDto, @Req() req: any) {
    return this.service.resolveRequest(id, dto, req.user.id, req.user.role, req.ip, req.headers['user-agent']);
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  reject(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.service.rejectRequest(id, reason, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/reopen')
  @Roles(UserRole.CITIZEN, UserRole.SYSTEM_ADMIN)
  reopen(@Param('id') id: string, @Body() dto: ReopenRequestDto, @Req() req: any) {
    return this.service.reopenRequest(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/close')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  close(@Param('id') id: string, @Req() req: any) {
    return this.service.closeRequest(id, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/cancel')
  @Roles(UserRole.SUPERVISOR, UserRole.GOVERNMENT_OFFICIAL, UserRole.SYSTEM_ADMIN)
  cancel(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.service.cancelRequest(id, reason, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/feedback')
  @Roles(UserRole.CITIZEN, UserRole.SYSTEM_ADMIN)
  feedback(@Param('id') id: string, @Body() dto: SubmitFeedbackDto, @Req() req: any) {
    return this.service.submitFeedback(id, dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: AddCommentDto, @Req() req: any) {
    return this.service.addComment(id, dto, req.user.id, req.user.role);
  }

  @Get(':id/timeline')
  getTimeline(@Param('id') id: string, @Req() req: any) {
    return this.service.getTimeline(id, req.user.id, req.user.role);
  }

  @Get(':id/comments')
  getComments(@Param('id') id: string, @Req() req: any) {
    return this.service.getComments(id, req.user.id, req.user.role);
  }

  @Get('categories')
  getCategories() {
    return this.service.listCategories();
  }

  @Get(':id')
  getRequest(@Param('id') id: string, @Req() req: any) {
    return this.service.getRequest(id, req.user.id, req.user.role);
  }

  @Get()
  list(@Req() req: any) {
    return this.service.listRequests(req.user.id, req.user.role);
  }
}
