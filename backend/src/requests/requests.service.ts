import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { realtimeEventEmitter } from '../realtime/realtime.event-emitter';
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
import {
  UserRole,
  ServiceRequestPriority,
  ServiceRequestStatus,
  ServiceRequestSource,
  CommentVisibility,
} from '@prisma/client';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Helper: check property/bin ownership for citizen requests
  private async validateResourceOwnership(dto: CreateServiceRequestDto, userId: string) {
    if (dto.propertyId) {
      const prop = await this.prisma.property.findUnique({
        where: { id: dto.propertyId },
      });
      if (!prop) throw new NotFoundException('Property not found.');
      if (prop.ownerId !== userId) {
        throw new ForbiddenException('Property does not belong to the authenticated citizen.');
      }
    }

    if (dto.binId) {
      const bin = await this.prisma.bin.findUnique({
        where: { id: dto.binId },
        include: { collectionPoint: true },
      });
      if (!bin) throw new NotFoundException('Bin not found.');
      
      if (dto.propertyId && bin.collectionPoint.propertyId !== dto.propertyId) {
        throw new BadRequestException('Bin does not belong to the selected property.');
      }
    }
  }

  // Helper: check duplicates in short window (15 minutes)
  private async detectDuplicate(dto: CreateServiceRequestDto) {
    const cooldownLimit = new Date(Date.now() - 15 * 60000);

    const match = await this.prisma.serviceRequest.findFirst({
      where: {
        categoryId: dto.categoryId,
        areaId: dto.areaId,
        propertyId: dto.propertyId || null,
        binId: dto.binId || null,
        status: {
          notIn: [
            ServiceRequestStatus.CLOSED,
            ServiceRequestStatus.REJECTED,
            ServiceRequestStatus.CANCELLED,
            ServiceRequestStatus.RESOLVED,
          ],
        },
        createdAt: { gte: cooldownLimit },
      },
    });

    if (match && !dto.ignoreDuplicateWarning) {
      throw new BadRequestException({
        message: 'Possible duplicate request detected.',
        requestCode: match.requestCode,
        status: match.status,
      });
    }
  }

  // Helper: check worker access scopes
  private async checkWorkerAccess(request: any, userId: string) {
    if (request.assignedUserId === userId) return;
    if (request.assignedTeamId) {
      const workerProfile = await this.prisma.workerProfile.findUnique({
        where: { userId },
      });
      if (workerProfile) {
        const isMember = await this.prisma.teamMembership.findFirst({
          where: {
            workerId: workerProfile.id,
            teamId: request.assignedTeamId,
          },
        });
        if (isMember) return;
      }
    }
    throw new ForbiddenException('Worker is not authorized to access this service request.');
  }

  // Helper: Validate request access permission
  private async validateRequestAccess(request: any, userId: string, userRole: UserRole) {
    if (userRole === UserRole.SYSTEM_ADMIN || userRole === UserRole.GOVERNMENT_OFFICIAL || userRole === UserRole.SUPERVISOR) {
      return;
    }
    if (userRole === UserRole.CITIZEN) {
      if (request.createdByUserId !== userId) {
        throw new ForbiddenException('You do not have access permissions for this request.');
      }
      return;
    }
    if (userRole === UserRole.WORKER) {
      await this.checkWorkerAccess(request, userId);
    }
  }

  // Missed Collection context resolving
  private async resolveMissedCollectionContext(dto: CreateServiceRequestDto) {
    if (!dto.propertyId) return null;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);

    const target = await this.prisma.dailyAssignmentTarget.findFirst({
      where: {
        collectionPoint: { propertyId: dto.propertyId },
        createdAt: { gte: startOfToday, lte: endOfToday },
      },
      include: {
        assignment: true,
      },
    });

    if (!target) {
      return { scheduled: false, context: 'No collections scheduled for today.' };
    }

    const event = await this.prisma.collectionEvent.findFirst({
      where: { targetId: target.id },
    });

    return {
      scheduled: true,
      assignmentId: target.assignmentId,
      status: target.status,
      wasteType: target.assignment.wasteType,
      targetCollectedAt: target.collectedAt,
      workerAction: event ? {
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        verificationLevel: event.verificationLevel,
        reasonCode: event.reasonCode,
      } : null,
    };
  }

  async listCategories() {
    return this.prisma.serviceRequestCategory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  async createRequest(dto: CreateServiceRequestDto, userId?: string, userRole?: UserRole, ip?: string, ua?: string) {
    const category = await this.prisma.serviceRequestCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category || category.status !== 'ACTIVE') {
      throw new BadRequestException('Request category is inactive or not found.');
    }

    if (category.requiresLocation && !dto.latitude && !dto.longitude) {
      throw new BadRequestException('Location coordinates are required.');
    }
    if (category.requiresEvidence && !dto.evidenceId) {
      throw new BadRequestException('Evidence attachment is required.');
    }

    // Enforce ownership checks for citizens
    if (userRole === UserRole.CITIZEN) {
      if (userId) {
        await this.validateResourceOwnership(dto, userId);
      }
    }

    // Cooldown deduplication for system-generated alerts
    const source = dto.source ?? (userId ? (userRole === UserRole.WORKER ? ServiceRequestSource.WORKER : ServiceRequestSource.CITIZEN_PORTAL) : ServiceRequestSource.CITIZEN_PORTAL);
    if (source === ServiceRequestSource.SYSTEM_GENERATED && dto.deduplicationKey) {
      const activeSystemReq = await this.prisma.serviceRequest.findFirst({
        where: {
          categoryId: dto.categoryId,
          binId: dto.binId || null,
          source: ServiceRequestSource.SYSTEM_GENERATED,
          status: {
            notIn: [ServiceRequestStatus.CLOSED, ServiceRequestStatus.REJECTED, ServiceRequestStatus.CANCELLED],
          },
        },
      });
      if (activeSystemReq) {
        // Return existing request without creating a duplicate
        return activeSystemReq;
      }
    }

    // Duplicate warnings checks
    await this.detectDuplicate(dto);

    let contextMeta: any = null;
    if (category.code === 'MISSED_COLLECTION') {
      contextMeta = await this.resolveMissedCollectionContext(dto);
    }

    const requestCode = `SR-2026-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const priority = category.defaultPriority;

    const request = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.create({
        data: {
          requestCode,
          createdByUserId: userId ?? null,
          categoryId: dto.categoryId,
          areaId: dto.areaId,
          propertyId: dto.propertyId ?? null,
          collectionPointId: dto.collectionPointId ?? null,
          binId: dto.binId ?? null,
          collectionEventId: dto.collectionEventId ?? null,
          title: dto.title,
          description: dto.description,
          priority,
          status: ServiceRequestStatus.SUBMITTED,
          source,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          addressText: dto.addressText ?? null,
          assignedDepartmentId: category.defaultDepartmentId ?? null,
        },
      });

      if (dto.evidenceId) {
        await tx.serviceRequestEvidence.create({
          data: {
            serviceRequestId: sr.id,
            uploadedBy: userId ?? 'SYSTEM',
            storageKey: dto.evidenceId,
            mimeType: 'image/png',
            size: 1000,
            evidenceType: 'CITIZEN_PHOTO',
          },
        });
      }

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: sr.id,
          eventType: 'REQUEST_SUBMITTED',
          actorId: userId ?? null,
          metadata: contextMeta ? { missedCollectionContext: contextMeta } : null,
        },
      });

      const slaPolicy = await tx.sLAPolicy.findUnique({
        where: { priority },
      });

      if (slaPolicy) {
        const now = new Date();
        const ackDue = new Date(now.getTime() + slaPolicy.acknowledgmentTargetMinutes * 60000);
        const resDue = new Date(now.getTime() + slaPolicy.resolutionTargetMinutes * 60000);

        await tx.serviceRequestSLA.create({
          data: {
            serviceRequestId: sr.id,
            slaPolicyId: slaPolicy.id,
            startedAt: now,
            acknowledgmentDueAt: ackDue,
            resolutionDueAt: resDue,
          },
        });
      }

      return sr;
    });

    if (userId) {
      await this.auditService.log(userId, 'SERVICE_REQUEST_CREATED', ip, ua, { requestId: request.id });
    }

    // Broadcast real-time event to dashboards
    realtimeEventEmitter.emit('complaint.submitted', {
      requestId: request.id,
      requestCode: request.requestCode,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    });

    if (userId) {
      await this.prisma.notification.create({
        data: {
          userId,
          title: 'Service Request Created',
          body: `Your service request ${request.requestCode} has been received and is being processed.`,
          type: 'INFO',
        }
      });
      realtimeEventEmitter.emit('notification', {
        userId,
        title: 'Service Request Created',
        body: `Your service request ${request.requestCode} has been received and is being processed.`,
        type: 'INFO',
      });
    }

    return request;
  }

  async triageRequest(id: string, dto: TriageRequestDto, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { sla: true },
    });
    if (!request) throw new NotFoundException('Service request not found.');

    // State machine check
    if (request.status === ServiceRequestStatus.CLOSED || request.status === ServiceRequestStatus.REJECTED || request.status === ServiceRequestStatus.CANCELLED) {
      throw new BadRequestException('Closed or terminal service requests cannot be triaged.');
    }
    if (request.status !== ServiceRequestStatus.SUBMITTED) {
      throw new BadRequestException('Service request is already triaged.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: any = {};
      if (dto.categoryId) data.categoryId = dto.categoryId;
      if (dto.priority) {
        data.priority = dto.priority;
        data.status = ServiceRequestStatus.TRIAGED;
      }

      const sr = await tx.serviceRequest.update({
        where: { id },
        data,
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'TRIAGED',
          actorId: userId,
          metadata: { priority: dto.priority, categoryId: dto.categoryId },
        },
      });

      if (dto.priority && request.sla) {
        const slaPolicy = await tx.sLAPolicy.findUnique({
          where: { priority: dto.priority },
        });
        if (slaPolicy) {
          const now = new Date();
          const ackDue = new Date(now.getTime() + slaPolicy.acknowledgmentTargetMinutes * 60000);
          const resDue = new Date(now.getTime() + slaPolicy.resolutionTargetMinutes * 60000);

          await tx.serviceRequestSLA.update({
            where: { serviceRequestId: id },
            data: {
              slaPolicyId: slaPolicy.id,
              acknowledgmentDueAt: ackDue,
              resolutionDueAt: resDue,
            },
          });
        }
      }

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_TRIAGED', ip, ua, { requestId: id });
    return updated;
  }

  async assignRequest(id: string, dto: AssignRequestDto, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { sla: true },
    });
    if (!request) throw new NotFoundException('Service request not found.');

    // State machine check
    if (request.status === ServiceRequestStatus.CLOSED || request.status === ServiceRequestStatus.REJECTED || request.status === ServiceRequestStatus.CANCELLED) {
      throw new BadRequestException('Closed or terminal service requests cannot be assigned.');
    }
    if (request.status !== ServiceRequestStatus.SUBMITTED && request.status !== ServiceRequestStatus.TRIAGED) {
      throw new BadRequestException('Request must be SUBMITTED or TRIAGED for assignment.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.serviceRequestAssignmentHistory.create({
        data: {
          serviceRequestId: id,
          fromDepartmentId: request.assignedDepartmentId,
          toDepartmentId: dto.assignedDepartmentId || request.assignedDepartmentId,
          fromTeamId: request.assignedTeamId,
          toTeamId: dto.assignedTeamId || request.assignedTeamId,
          fromUserId: request.assignedUserId,
          toUserId: dto.assignedUserId || request.assignedUserId,
          assignedBy: userId,
          reason: dto.reason || null,
        },
      });

      const sr = await tx.serviceRequest.update({
        where: { id },
        data: {
          assignedDepartmentId: dto.assignedDepartmentId ?? request.assignedDepartmentId,
          assignedTeamId: dto.assignedTeamId ?? request.assignedTeamId,
          assignedUserId: dto.assignedUserId ?? request.assignedUserId,
          status: ServiceRequestStatus.ASSIGNED,
          acknowledgedAt: new Date(),
        },
      });

      if (request.sla && !request.sla.acknowledgedAt) {
        await tx.serviceRequestSLA.update({
          where: { serviceRequestId: id },
          data: { acknowledgedAt: new Date() },
        });
      }

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'ASSIGNED',
          actorId: userId,
          metadata: { toUser: dto.assignedUserId, toDepartment: dto.assignedDepartmentId, reason: dto.reason },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_ASSIGNED', ip, ua, { requestId: id });
    return updated;
  }

  async startWork(id: string, userId: string, userRole: UserRole, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    // State machine check
    if (request.status !== ServiceRequestStatus.ASSIGNED && request.status !== ServiceRequestStatus.REOPENED) {
      throw new BadRequestException('Request must be ASSIGNED or REOPENED to start work.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: {
          status: ServiceRequestStatus.IN_PROGRESS,
          workStartedAt: new Date(),
        },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'WORK_STARTED',
          actorId: userId,
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_STARTED', ip, ua, { requestId: id });
    return updated;
  }

  async requestInformation(id: string, dto: RequestInformationDto, userId: string, userRole: UserRole, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { sla: true },
    });
    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    // State machine check
    if (request.status !== ServiceRequestStatus.IN_PROGRESS) {
      throw new BadRequestException('SLA pauses can only be requested from IN_PROGRESS state.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.WAITING_FOR_INFORMATION },
      });

      if (request.sla) {
        // Log to SLA Pause history
        await tx.serviceRequestSLAPause.create({
          data: {
            serviceRequestSlaId: request.sla.id,
            reason: dto.notes,
            pausedAt: new Date(),
            pausedBy: userId,
          },
        });

        await tx.serviceRequestSLA.update({
          where: { serviceRequestId: id },
          data: { pausedAt: new Date() },
        });
      }

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'WAITING_FOR_INFORMATION',
          actorId: userId,
          metadata: { notes: dto.notes },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_INFO_REQUESTED', ip, ua, { requestId: id });
    return updated;
  }

  async provideInformation(id: string, dto: ProvideInformationDto, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { sla: { include: { pauses: true } } },
    });
    if (!request) throw new NotFoundException('Request not found.');
    
    // Enforce owner check
    if (request.createdByUserId !== userId) {
      throw new ForbiddenException('Only the citizen who filed the request can provide information.');
    }
    
    // State machine check
    if (request.status !== ServiceRequestStatus.WAITING_FOR_INFORMATION) {
      throw new BadRequestException('Request is not WAITING_FOR_INFORMATION.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.IN_PROGRESS },
      });

      if (request.sla) {
        const activePause = request.sla.pauses.find((p) => p.resumedAt === null);
        if (activePause) {
          const now = new Date();
          const pausedAtTime = new Date(activePause.pausedAt).getTime();
          const pauseDurationSeconds = Math.floor((now.getTime() - pausedAtTime) / 1000);
          const newResolutionDue = new Date(request.sla.resolutionDueAt.getTime() + pauseDurationSeconds * 1000);

          await tx.serviceRequestSLAPause.update({
            where: { id: activePause.id },
            data: {
              resumedAt: now,
              resumedBy: userId,
            },
          });

          await tx.serviceRequestSLA.update({
            where: { serviceRequestId: id },
            data: {
              pausedAt: null,
              totalPausedDurationSeconds: request.sla.totalPausedDurationSeconds + pauseDurationSeconds,
              resolutionDueAt: newResolutionDue,
            },
          });
        }
      }

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'INFORMATION_PROVIDED',
          actorId: userId,
          metadata: { message: dto.message },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_INFO_PROVIDED', ip, ua, { requestId: id });
    return updated;
  }

  async resolveRequest(id: string, dto: ResolveRequestDto, userId: string, userRole: UserRole, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { sla: true },
    });
    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    // State machine check
    if (request.status !== ServiceRequestStatus.IN_PROGRESS) {
      throw new BadRequestException('Request must be IN_PROGRESS to be marked RESOLVED.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: {
          status: ServiceRequestStatus.RESOLVED,
          resolvedAt: new Date(),
        },
      });

      if (request.sla && !request.sla.resolvedAt) {
        await tx.serviceRequestSLA.update({
          where: { serviceRequestId: id },
          data: { resolvedAt: new Date() },
        });
      }

      if (dto.evidenceId) {
        await tx.serviceRequestEvidence.create({
          data: {
            serviceRequestId: id,
            uploadedBy: userId,
            storageKey: dto.evidenceId,
            mimeType: 'image/png',
            size: 1000,
            evidenceType: 'RESOLUTION_PROOF',
          },
        });
      }

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'RESOLVED',
          actorId: userId,
          metadata: { code: dto.resolutionCode, summary: dto.resolutionSummary },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_RESOLVED', ip, ua, { requestId: id });
    return updated;
  }

  async rejectRequest(id: string, reason: string, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');

    // State machine check
    if (request.status !== ServiceRequestStatus.SUBMITTED && request.status !== ServiceRequestStatus.TRIAGED && request.status !== ServiceRequestStatus.ASSIGNED) {
      throw new BadRequestException('Only requests in pre-work stages can be rejected.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.REJECTED },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'REJECTED',
          actorId: userId,
          metadata: { reason },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_REJECTED', ip, ua, { requestId: id, reason });
    return updated;
  }

  async reopenRequest(id: string, dto: ReopenRequestDto, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');
    
    // State machine check
    if (request.status !== ServiceRequestStatus.RESOLVED) {
      throw new BadRequestException('Only RESOLVED requests can be reopened.');
    }

    // Verify ownership
    if (request.createdByUserId !== userId) {
      throw new ForbiddenException('Only the citizen who created the request can reopen it.');
    }

    // Reopen window check (24 hours)
    const resolveTime = request.resolvedAt ? new Date(request.resolvedAt).getTime() : 0;
    if (Date.now() - resolveTime > 24 * 60 * 60000) {
      throw new BadRequestException('Resolved requests can only be reopened within 24 hours.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.REOPENED },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'REOPENED',
          actorId: userId,
          metadata: { reason: dto.reason },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_REOPENED', ip, ua, { requestId: id });
    return updated;
  }

  async closeRequest(id: string, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');

    // State machine check
    if (request.status !== ServiceRequestStatus.RESOLVED) {
      throw new BadRequestException('Only RESOLVED requests can be CLOSED.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.CLOSED, closedAt: new Date() },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'CLOSED',
          actorId: userId,
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_CLOSED', ip, ua, { requestId: id });
    return updated;
  }

  async cancelRequest(id: string, reason: string, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');
    if (!reason) throw new BadRequestException('Cancellation reason is required.');

    // State machine check
    if (request.status === ServiceRequestStatus.CLOSED || request.status === ServiceRequestStatus.REJECTED || request.status === ServiceRequestStatus.CANCELLED) {
      throw new BadRequestException('Terminal state requests cannot be cancelled.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.CANCELLED, cancelledAt: new Date() },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'CANCELLED',
          actorId: userId,
          metadata: { reason },
        },
      });

      return sr;
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_CANCELLED', ip, ua, { requestId: id, reason });
    return updated;
  }

  async submitFeedback(id: string, dto: SubmitFeedbackDto, userId: string, ip?: string, ua?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');
    if (request.createdByUserId !== userId) {
      throw new ForbiddenException('Only the citizen owner can rate resolution feedback.');
    }

    const existing = await this.prisma.serviceRequestFeedback.findUnique({
      where: { serviceRequestId: id },
    });
    if (existing) {
      throw new BadRequestException('Feedback already submitted.');
    }

    const feedback = await this.prisma.serviceRequestFeedback.create({
      data: {
        serviceRequestId: id,
        citizenId: userId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      },
    });

    await this.auditService.log(userId, 'SERVICE_REQUEST_FEEDBACK_SUBMITTED', ip, ua, { requestId: id, rating: dto.rating });
    return feedback;
  }

  async addComment(id: string, dto: AddCommentDto, userId: string, userRole: UserRole) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    if (dto.visibility === CommentVisibility.INTERNAL && userRole === UserRole.CITIZEN) {
      throw new ForbiddenException('Citizens cannot post internal comments.');
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.serviceRequestComment.create({
        data: {
          serviceRequestId: id,
          authorId: userId,
          visibility: dto.visibility,
          message: dto.message,
        },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: id,
          eventType: 'COMMENT_ADDED',
          actorId: userId,
          metadata: { commentId: c.id, visibility: dto.visibility },
        },
      });

      return c;
    });

    return comment;
  }

  async getTimeline(id: string, userId: string, userRole: UserRole) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    const events = await this.prisma.serviceRequestEvent.findMany({
      where: { serviceRequestId: id },
      orderBy: { occurredAt: 'asc' },
    });

    // Enforce privacy logs filters for citizens
    if (userRole === UserRole.CITIZEN) {
      const publicEventTypes = [
        'REQUEST_SUBMITTED',
        'TRIAGED',
        'ASSIGNED',
        'WORK_STARTED',
        'COMMENT_ADDED',
        'INFORMATION_PROVIDED',
        'RESOLVED',
        'REOPENED',
        'CLOSED',
        'REJECTED',
        'CANCELLED',
      ];

      return events.filter((evt) => {
        if (!publicEventTypes.includes(evt.eventType)) return false;
        
        // Hide internal comments additions
        if (evt.eventType === 'COMMENT_ADDED' && evt.metadata) {
          const meta = evt.metadata as any;
          if (meta.visibility === CommentVisibility.INTERNAL) return false;
        }
        return true;
      });
    }

    return events;
  }

  async getComments(id: string, userId: string, userRole: UserRole) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    if (userRole === UserRole.CITIZEN) {
      return this.prisma.serviceRequestComment.findMany({
        where: { serviceRequestId: id, visibility: CommentVisibility.PUBLIC },
        orderBy: { createdAt: 'asc' },
      });
    }

    return this.prisma.serviceRequestComment.findMany({
      where: { serviceRequestId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRequest(id: string, userId: string, userRole: UserRole) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: true,
        sla: { include: { pauses: true } },
        escalations: true,
        evidences: true,
        feedbacks: true,
        creator: { select: { id: true, name: true, email: true, phone: true } },
        property: true,
        area: true,
        assignee: { select: { id: true, name: true, email: true, phone: true } },
        team: true,
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });

    if (!request) throw new NotFoundException('Request not found.');

    await this.validateRequestAccess(request, userId, userRole);

    // Privacy-Safe filtering
    if (userRole === UserRole.CITIZEN) {
      return {
        id: request.id,
        requestCode: request.requestCode,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        source: request.source,
        latitude: request.latitude,
        longitude: request.longitude,
        addressText: request.addressText,
        submittedAt: request.submittedAt,
        acknowledgedAt: request.acknowledgedAt,
        workStartedAt: request.workStartedAt,
        resolvedAt: request.resolvedAt,
        closedAt: request.closedAt,
        cancelledAt: request.cancelledAt,
        category: request.category,
        sla: request.sla ? {
          resolutionDueAt: request.sla.resolutionDueAt,
          acknowledgmentDueAt: request.sla.acknowledgmentDueAt,
        } : null,
        feedbacks: request.feedbacks,
      };
    }

    return request;
  }

  async listRequests(userId: string, userRole: UserRole) {
    if (userRole === UserRole.CITIZEN) {
      return this.prisma.serviceRequest.findMany({
        where: { createdByUserId: userId },
        include: { category: true, sla: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Workers restricted to assigned requests only
    if (userRole === UserRole.WORKER) {
      const workerProfile = await this.prisma.workerProfile.findUnique({
        where: { userId },
      });
      const teamId = workerProfile ? (
        await this.prisma.teamMembership.findFirst({
          where: { workerId: workerProfile.id },
        })
      )?.teamId : undefined;

      return this.prisma.serviceRequest.findMany({
        where: {
          OR: [
            { assignedUserId: userId },
            { assignedTeamId: teamId ?? 'NO_TEAM_MAPPED' },
          ],
        },
        include: { category: true, sla: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.serviceRequest.findMany({
      include: { category: true, sla: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── BACKGROUND SLA BREACH DETECTION CRON ─────────────────────────────────
  @Cron(CronExpression.EVERY_MINUTE)
  async checkSLAEscalations() {
    const now = new Date();

    const activeSLAs = await this.prisma.serviceRequestSLA.findMany({
      where: {
        resolvedAt: null,
        pausedAt: null,
      },
      include: {
        serviceRequest: true,
      },
    });

    for (const sla of activeSLAs) {
      // 1. Acknowledgment Breach detection
      if (!sla.acknowledgedAt && now > sla.acknowledgmentDueAt && !sla.acknowledgmentBreached) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.serviceRequestSLA.update({
              where: { id: sla.id },
              data: { acknowledgmentBreached: true },
            });

            await tx.serviceRequestEscalation.create({
              data: {
                serviceRequestId: sla.serviceRequestId,
                level: 1,
                reason: 'Acknowledgment SLA breached.',
              },
            });

            await tx.serviceRequestEvent.create({
              data: {
                serviceRequestId: sla.serviceRequestId,
                eventType: 'SLA_BREACHED',
                metadata: { breachType: 'ACKNOWLEDGMENT' },
              },
            });
          });
        } catch {
          // Idempotency: database unique constraints caught duplicate trigger safely
        }
      }

      // 2. Resolution Breach detection
      if (now > sla.resolutionDueAt && !sla.resolutionBreached) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.serviceRequestSLA.update({
              where: { id: sla.id },
              data: { resolutionBreached: true },
            });

            await tx.serviceRequestEscalation.create({
              data: {
                serviceRequestId: sla.serviceRequestId,
                level: 2,
                reason: 'Resolution SLA breached.',
              },
            });

            await tx.serviceRequestEvent.create({
              data: {
                serviceRequestId: sla.serviceRequestId,
                eventType: 'SLA_BREACHED',
                metadata: { breachType: 'RESOLUTION' },
              },
            });
          });
        } catch {
          // Idempotency: database unique constraints caught duplicate trigger safely
        }
      }

      // 3. 75% Warning Consumed detection
      const totalSlaWindow = sla.resolutionDueAt.getTime() - sla.startedAt.getTime();
      const elapsed = now.getTime() - sla.startedAt.getTime() - (sla.totalPausedDurationSeconds * 1000);
      const consumedPercentage = elapsed / totalSlaWindow;

      if (consumedPercentage >= 0.75 && !sla.resolutionBreached) {
        const warningExists = await this.prisma.serviceRequestEscalation.findFirst({
          where: {
            serviceRequestId: sla.serviceRequestId,
            level: 0,
          },
        });

        if (!warningExists) {
          try {
            await this.prisma.$transaction(async (tx) => {
              await tx.serviceRequestEscalation.create({
                data: {
                  serviceRequestId: sla.serviceRequestId,
                  level: 0,
                  reason: '75% of resolution SLA consumed.',
                },
              });

              await tx.serviceRequestEvent.create({
                data: {
                  serviceRequestId: sla.serviceRequestId,
                  eventType: 'SLA_WARNING',
                  metadata: { consumedPercentage },
                },
              });
            });
          } catch {
            // Unique constraints caught race condition safely
          }
        }
      }
    }
  }
}
