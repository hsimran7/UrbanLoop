import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FacilitiesService } from '../facilities/facilities.service';
import {
  CreateLoadDto,
  SealLoadDto,
  DispatchLoadDto,
  RecordWeighingDto,
  CreateReceiptDto,
  CreateProcessingDto,
} from './dto/loads.dto';
import {
  UserRole,
  WasteLoadStatus,
  TransferStatus,
  ReceiptStatus,
  CustodyEventType,
  MassBalanceStatus,
} from '@prisma/client';

@Injectable()
export class LoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly facilitiesService: FacilitiesService,
  ) {}

  async createLoad(dto: CreateLoadDto, userId: string, ip?: string, ua?: string) {
    const assignment = await this.prisma.dailyAssignment.findUnique({
      where: { id: dto.assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    if (assignment.status === 'CANCELLED') {
      throw new BadRequestException('Cannot create a load for a cancelled assignment.');
    }

    // Load type validation
    if (assignment.wasteType !== dto.wasteType) {
      throw new BadRequestException('Waste type mismatch with assignment.');
    }

    // Verify all collectionEventIds belong to this assignment, are COLLECTED, and are not duplicated
    const events = await this.prisma.collectionEvent.findMany({
      where: {
        id: { in: dto.collectionEventIds },
        assignmentId: dto.assignmentId,
        eventType: 'COLLECTED',
      },
    });

    if (events.length !== dto.collectionEventIds.length) {
      throw new BadRequestException('Some events are missing, not COLLECTED, or do not belong to this assignment.');
    }

    // Ensure no duplicate items across active/valid loads (where load status is NOT REJECTED or CANCELLED)
    const activeLoadItems = await this.prisma.wasteLoadItem.findMany({
      where: {
        collectionEventId: { in: dto.collectionEventIds },
        wasteLoad: {
          status: { notIn: [WasteLoadStatus.REJECTED] },
        },
      },
    });

    if (activeLoadItems.length > 0) {
      throw new BadRequestException('One or more collection events are already included in another active waste load.');
    }

    const loadCode = `WL-2026-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const load = await this.prisma.$transaction(async (tx) => {
      const createdLoad = await tx.wasteLoad.create({
        data: {
          loadCode,
          assignmentId: dto.assignmentId,
          teamId: assignment.teamId,
          wasteType: dto.wasteType,
          status: WasteLoadStatus.OPEN,
          createdBy: userId,
        },
      });

      // Bulk create WasteLoadItems
      await Promise.all(
        events.map((evt) =>
          tx.wasteLoadItem.create({
            data: {
              wasteLoadId: createdLoad.id,
              collectionEventId: evt.id,
              assignmentTargetId: evt.targetId,
              binId: evt.binId,
              collectionPointId: evt.collectionPointId,
            },
          }),
        ),
      );

      // Log custody event
      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: createdLoad.id,
          eventType: CustodyEventType.LOAD_CREATED,
          actorId: userId,
          metadata: { itemCount: events.length },
        },
      });

      return createdLoad;
    });

    await this.auditService.log(userId, 'LOAD_CREATED', ip, ua, {
      loadId: load.id,
      loadCode: load.loadCode,
    });

    return load;
  }

  async sealLoad(loadId: string, dto: SealLoadDto, userId: string, ip?: string, ua?: string) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
    });
    if (!load) throw new NotFoundException('Waste load not found.');
    if (load.status !== WasteLoadStatus.OPEN) {
      throw new BadRequestException('Only OPEN loads can be sealed.');
    }

    const sealCode = dto.sealCode || `SEAL-${Date.now()}`;

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const sealed = await tx.wasteLoad.update({
        where: { id: loadId },
        data: {
          status: WasteLoadStatus.SEALED,
          sealedAt: new Date(),
          sealedBy: userId,
          sealCode,
        },
      });

      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: CustodyEventType.LOAD_SEALED,
          actorId: userId,
          metadata: { sealCode },
        },
      });

      return sealed;
    });

    await this.auditService.log(userId, 'LOAD_SEALED', ip, ua, {
      loadId,
      sealCode,
    });

    return updatedLoad;
  }

  async dispatchLoad(loadId: string, dto: DispatchLoadDto, userId: string, ip?: string, ua?: string) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
    });
    if (!load) throw new NotFoundException('Waste load not found.');
    if (load.status !== WasteLoadStatus.SEALED) {
      throw new BadRequestException('Only SEALED loads can be dispatched.');
    }

    const facility = await this.prisma.wasteFacility.findUnique({
      where: { id: dto.destinationFacilityId },
      include: { acceptedWasteTypes: true },
    });
    if (!facility || facility.status !== 'ACTIVE') {
      throw new BadRequestException('Destination facility is inactive or not found.');
    }

    // Verify waste type compatibility
    const supportsWaste = facility.acceptedWasteTypes.some((wt) => wt.wasteType === load.wasteType);
    if (!supportsWaste) {
      throw new BadRequestException('Facility does not accept this load waste type.');
    }

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const dispatched = await tx.wasteLoad.update({
        where: { id: loadId },
        data: { status: WasteLoadStatus.IN_TRANSIT },
      });

      await tx.wasteTransfer.create({
        data: {
          wasteLoadId: loadId,
          destinationFacilityId: dto.destinationFacilityId,
          status: TransferStatus.DISPATCHED,
          dispatchedAt: new Date(),
          dispatchedById: userId,
        },
      });

      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: CustodyEventType.DISPATCHED,
          actorId: userId,
          facilityId: dto.destinationFacilityId,
        },
      });

      return dispatched;
    });

    await this.auditService.log(userId, 'LOAD_DISPATCHED', ip, ua, {
      loadId,
      facilityId: dto.destinationFacilityId,
    });

    return updatedLoad;
  }

  async arriveLoad(loadId: string, userId: string, ip?: string, ua?: string) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
    });
    if (!load) throw new NotFoundException('Waste load not found.');
    if (load.status !== WasteLoadStatus.IN_TRANSIT) {
      throw new BadRequestException('Only IN_TRANSIT loads can arrive.');
    }

    const transfer = await this.prisma.wasteTransfer.findFirst({
      where: { wasteLoadId: loadId, status: TransferStatus.DISPATCHED },
    });
    if (!transfer) throw new NotFoundException('No active transfer record found for dispatch.');

    // Manager assignment check
    await this.facilitiesService.checkManagerAssignment(userId, transfer.destinationFacilityId);

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const arrived = await tx.wasteLoad.update({
        where: { id: loadId },
        data: {
          status: WasteLoadStatus.ARRIVED,
          deliveredAt: new Date(),
        },
      });

      await tx.wasteTransfer.update({
        where: { id: transfer.id },
        data: {
          status: TransferStatus.ARRIVED,
          arrivedAt: new Date(),
          arrivedById: userId,
        },
      });

      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: CustodyEventType.ARRIVED_AT_FACILITY,
          actorId: userId,
          facilityId: transfer.destinationFacilityId,
        },
      });

      return arrived;
    });

    await this.auditService.log(userId, 'LOAD_ARRIVED', ip, ua, {
      loadId,
      facilityId: transfer.destinationFacilityId,
    });

    return updatedLoad;
  }

  async weighLoad(loadId: string, dto: RecordWeighingDto, userId: string, ip?: string, ua?: string) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
    });
    if (!load) throw new NotFoundException('Waste load not found.');
    if (load.status !== WasteLoadStatus.ARRIVED) {
      throw new BadRequestException('Only ARRIVED loads can be weighed.');
    }

    const transfer = await this.prisma.wasteTransfer.findFirst({
      where: { wasteLoadId: loadId, status: TransferStatus.ARRIVED },
    });
    if (!transfer) throw new BadRequestException('No transfer records found at destination.');

    // Manager assignment check
    await this.facilitiesService.checkManagerAssignment(userId, transfer.destinationFacilityId);

    // Validate weight calculations server-side
    if (dto.grossWeightKg < dto.tareWeightKg) {
      throw new BadRequestException('Gross weight must be greater than or equal to tare weight.');
    }

    const netWeightKg = dto.grossWeightKg - dto.tareWeightKg;

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const record = await tx.weighingRecord.create({
        data: {
          wasteLoadId: loadId,
          facilityId: transfer.destinationFacilityId,
          grossWeightKg: dto.grossWeightKg,
          tareWeightKg: dto.tareWeightKg,
          netWeightKg,
          weighingMethod: dto.weighingMethod,
          recordedBy: userId,
          evidenceId: dto.evidenceId ?? null,
        },
      });

      const weighed = await tx.wasteLoad.update({
        where: { id: loadId },
        data: { status: WasteLoadStatus.WEIGHED },
      });

      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: CustodyEventType.WEIGHED,
          actorId: userId,
          facilityId: transfer.destinationFacilityId,
          metadata: { netWeightKg, weighingMethod: dto.weighingMethod },
        },
      });

      return weighed;
    });

    await this.auditService.log(userId, 'LOAD_WEIGHED', ip, ua, {
      loadId,
      netWeightKg,
    });

    return updatedLoad;
  }

  async receiptLoad(loadId: string, dto: CreateReceiptDto, userId: string, ip?: string, ua?: string) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
    });
    if (!load) throw new NotFoundException('Waste load not found.');
    if (load.status !== WasteLoadStatus.WEIGHED) {
      throw new BadRequestException('Only WEIGHED loads can receive receipts.');
    }

    const weighing = await this.prisma.weighingRecord.findFirst({
      where: { wasteLoadId: loadId },
      orderBy: { weighedAt: 'desc' },
    });
    if (!weighing) throw new NotFoundException('Weighing record not found.');

    // Manager assignment check
    await this.facilitiesService.checkManagerAssignment(userId, weighing.facilityId);

    // Validate receipts weights vs net weight
    const totalReceiptWeight = dto.acceptedWeightKg + dto.rejectedWeightKg;
    // Net weight tolerance check (max 5%)
    if (totalReceiptWeight > weighing.netWeightKg * 1.05) {
      throw new BadRequestException('Accepted plus rejected weights exceeds the verified scale net weight beyond 5% tolerance limit.');
    }

    const receiptCode = `REC-2026-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.facilityReceipt.create({
        data: {
          receiptCode,
          wasteLoadId: loadId,
          facilityId: weighing.facilityId,
          weighingRecordId: weighing.id,
          status: dto.status,
          acceptedWeightKg: dto.acceptedWeightKg,
          rejectedWeightKg: dto.rejectedWeightKg,
          rejectionReason: dto.rejectionReason ?? null,
          receivedBy: userId,
          notes: dto.notes ?? null,
        },
      });

      let nextStatus: WasteLoadStatus;
      let custodyType: CustodyEventType;
      if (dto.status === ReceiptStatus.ACCEPTED) {
        nextStatus = WasteLoadStatus.ACCEPTED;
        custodyType = CustodyEventType.ACCEPTED;
      } else if (dto.status === ReceiptStatus.PARTIALLY_ACCEPTED) {
        nextStatus = WasteLoadStatus.PARTIALLY_REJECTED;
        custodyType = CustodyEventType.PARTIALLY_REJECTED;
      } else {
        nextStatus = WasteLoadStatus.REJECTED;
        custodyType = CustodyEventType.REJECTED;
      }

      const updated = await tx.wasteLoad.update({
        where: { id: loadId },
        data: { status: nextStatus },
      });

      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: custodyType,
          actorId: userId,
          facilityId: weighing.facilityId,
          metadata: { receiptCode, acceptedWeightKg: dto.acceptedWeightKg, rejectedWeightKg: dto.rejectedWeightKg },
        },
      });

      return updated;
    });

    await this.auditService.log(userId, 'RECEIPT_CREATED', ip, ua, {
      loadId,
      receiptCode,
      acceptedWeightKg: dto.acceptedWeightKg,
    });

    return updatedLoad;
  }

  async processLoad(loadId: string, dto: CreateProcessingDto, userId: string, ip?: string, ua?: string) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
    });
    if (!load) throw new NotFoundException('Waste load not found.');
    if (load.status !== WasteLoadStatus.ACCEPTED && load.status !== WasteLoadStatus.PARTIALLY_REJECTED) {
      throw new BadRequestException('Only ACCEPTED or PARTIALLY_REJECTED loads can be processed.');
    }

    const receipt = await this.prisma.facilityReceipt.findFirst({
      where: { wasteLoadId: loadId },
      orderBy: { receivedAt: 'desc' },
    });
    if (!receipt) throw new NotFoundException('No facility receipt found.');

    // Manager assignment check
    await this.facilitiesService.checkManagerAssignment(userId, receipt.facilityId);

    // Available processing input is the receipt's acceptedWeightKg
    const acceptedWeight = receipt.acceptedWeightKg;
    // Input weight verification within 2% tolerance
    if (Math.abs(dto.inputWeightKg - acceptedWeight) > 0.02 * acceptedWeight) {
      throw new BadRequestException('Processing input weight mismatch with accepted receipt weight.');
    }

    // Mass balance: Recycled outputs + residue vs Input weight (2% tolerance check)
    const outputsTotal = (dto.outputWeightKg ?? 0) + (dto.residueWeightKg ?? 0);
    const balanceDiff = Math.abs(outputsTotal - dto.inputWeightKg);
    const toleranceLimit = 0.02 * dto.inputWeightKg;

    const massBalanceStatus = balanceDiff <= toleranceLimit ? MassBalanceStatus.BALANCED : MassBalanceStatus.MISMATCH;

    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const record = await tx.wasteProcessingRecord.create({
        data: {
          facilityReceiptId: receipt.id,
          processType: dto.processType,
          inputWeightKg: dto.inputWeightKg,
          outputWeightKg: dto.outputWeightKg ?? null,
          residueWeightKg: dto.residueWeightKg ?? null,
          massBalanceStatus,
          recordedBy: userId,
          notes: dto.notes ?? null,
        },
      });

      const closed = await tx.wasteLoad.update({
        where: { id: loadId },
        data: { status: WasteLoadStatus.CLOSED },
      });

      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: CustodyEventType.PROCESSING_RECORDED,
          actorId: userId,
          facilityId: receipt.facilityId,
          metadata: { recordId: record.id, massBalanceStatus },
        },
      });

      // Close custody chain
      await tx.wasteCustodyEvent.create({
        data: {
          wasteLoadId: loadId,
          eventType: CustodyEventType.CLOSED,
          actorId: userId,
          facilityId: receipt.facilityId,
        },
      });

      return closed;
    });

    await this.auditService.log(userId, 'LOAD_PROCESSED', ip, ua, {
      loadId,
      massBalanceStatus,
    });

    return updatedLoad;
  }

  async getTraceability(loadId: string, userId: string, userRole: UserRole) {
    const load = await this.prisma.wasteLoad.findUnique({
      where: { id: loadId },
      include: {
        items: {
          include: {
            collectionEvent: {
              include: {
                corrections: true,
              },
            },
          },
        },
        transfers: {
          include: {
            facility: {
              include: {
                acceptedWasteTypes: true,
              },
            },
          },
        },
        weighingRecords: true,
        receipts: {
          include: {
            processingRecords: true,
          },
        },
        custodyEvents: true,
      },
    });

    if (!load) throw new NotFoundException('Waste load not found.');

    // Tight scope checks for Facility Managers & Workers
    if (userRole === UserRole.FACILITY_MANAGER) {
      // Find if assigned to target load's destination facility
      const activeTransfer = load.transfers[0];
      if (activeTransfer) {
        await this.facilitiesService.checkManagerAssignment(userId, activeTransfer.destinationFacilityId);
      } else {
        throw new ForbiddenException('You do not have access to trace unassigned facilities loads.');
      }
    }

    // Hide citizen name / personal detail mapping for non-admins
    const showPII = userRole === UserRole.SYSTEM_ADMIN || userRole === UserRole.GOVERNMENT_OFFICIAL;

    // Resolve property details for trace list without exposing PII
    const traceItems = await Promise.all(
      load.items.map(async (item) => {
        const cp = await this.prisma.collectionPoint.findUnique({
          where: { id: item.collectionPointId },
          include: {
            property: true,
          },
        });

        return {
          itemId: item.id,
          binId: item.binId,
          collectionPointId: item.collectionPointId,
          collectionPointName: cp?.name || 'CP',
          address: cp?.property?.address || 'Anonymous address',
          ownerId: showPII ? cp?.property?.ownerId : undefined, // privacy safeguard
        };
      }),
    );

    return {
      loadId: load.id,
      loadCode: load.loadCode,
      wasteType: load.wasteType,
      status: load.status,
      openedAt: load.openedAt,
      sealedAt: load.sealedAt,
      deliveredAt: load.deliveredAt,
      items: traceItems,
      transfers: load.transfers,
      weighings: load.weighingRecords,
      receipts: load.receipts,
      custodyHistory: load.custodyEvents,
    };
  }

  async listLoads(userId: string, userRole: UserRole) {
    if (userRole === UserRole.FACILITY_MANAGER) {
      // Facility managers list loads arriving at their assigned facilities
      const assignments = await this.facilitiesService.getMyAssignments(userId);
      const facilityIds = assignments.map((a) => a.facilityId);

      return this.prisma.wasteLoad.findMany({
        where: {
          transfers: {
            some: {
              destinationFacilityId: { in: facilityIds },
            },
          },
        },
        include: {
          transfers: {
            include: { facility: true },
          },
          items: true,
        },
      });
    }

    // Supervisors and above can view all
    return this.prisma.wasteLoad.findMany({
      include: {
        transfers: {
          include: { facility: true },
        },
        items: true,
      },
    });
  }
}
