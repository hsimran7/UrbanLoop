import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { BinType, DayOfWeek, ScheduleStatus, ExceptionType } from '@prisma/client';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let prisma: any;
  let auditService: any;

  const mockPrisma = {
    area: {
      findUnique: jest.fn(),
    },
    collectionSchedule: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    scheduleException: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    property: {
      findMany: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkScheduleConflict & Timezone logic', () => {
    it('should catch overlapping effective date ranges with open-ended effectiveUntil', async () => {
      mockPrisma.collectionSchedule.findMany.mockResolvedValue([
        {
          id: 'schedule-1',
          startTime: '08:00',
          endTime: '11:00',
          effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
          effectiveUntil: null,
          status: ScheduleStatus.ACTIVE,
        },
      ]);

      await expect(
        service.checkScheduleConflict(
          'area-1',
          BinType.DRY,
          DayOfWeek.TUESDAY,
          '09:00',
          '10:00',
          new Date('2026-07-15T00:00:00.000Z'),
          null,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should resolve timezone days correctly (e.g. Kolkata time offset shifts local day)', () => {
      const timezone = 'Asia/Kolkata';
      // UTC: 2026-07-15T22:00:00Z -> Kolkata: 2026-07-16T03:30:00 (Thursday)
      const date = new Date('2026-07-15T22:00:00.000Z');
      const localDay = service.getLocalDayOfWeek(date, timezone);
      const localDateStr = service.getLocalDateString(date, timezone);

      expect(localDay).toBe('THURSDAY');
      expect(localDateStr).toBe('2026-07-16');
    });
  });

  describe('Exception Handling & Rescheduling', () => {
    it('should reject schedule exceptions if target schedule and area do not match', async () => {
      mockPrisma.area.findUnique.mockResolvedValue({
        id: 'area-1',
        ward: { city: { timezone: 'Asia/Kolkata' } },
      });

      mockPrisma.collectionSchedule.findUnique.mockResolvedValue({
        id: 'schedule-abc',
        areaId: 'area-2',
        dayOfWeek: DayOfWeek.TUESDAY,
      });

      const dto = {
        areaId: 'area-1',
        scheduleId: 'schedule-abc',
        originalDate: new Date('2026-07-14T00:00:00.000Z'),
        reason: 'Mismatch Area Test',
        type: ExceptionType.CANCELLED,
      };

      await expect(service.createException(dto, 'admin-id')).rejects.toThrow(BadRequestException);
    });

    it('should compile resolved citizen occurrences, applying cancellations and rescheduled replacements correctly', async () => {
      mockPrisma.property.findMany.mockResolvedValue([
        {
          id: 'property-1',
          address: '742 Evergreen',
          areaId: 'area-1',
          area: {
            id: 'area-1',
            name: 'Sector A',
            ward: { city: { timezone: 'Asia/Kolkata' } },
          },
        },
      ]);

      mockPrisma.collectionSchedule.findMany.mockResolvedValue([
        {
          id: 'sched-1',
          areaId: 'area-1',
          wasteType: BinType.DRY,
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: '08:00',
          endTime: '11:00',
          effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
          effectiveUntil: null,
        },
      ]);

      mockPrisma.scheduleException.findMany.mockResolvedValue([
        {
          id: 'ex-1',
          areaId: 'area-1',
          scheduleId: 'sched-1',
          type: ExceptionType.RESCHEDULED,
          originalDate: new Date('2026-07-21T00:00:00.000Z'),
          replacementDate: new Date('2026-07-22T00:00:00.000Z'),
          replacementStartTime: '14:00',
          replacementEndTime: '17:00',
          reason: 'Holiday Reschedule',
          schedule: { id: 'sched-1', wasteType: BinType.DRY },
        },
        {
          id: 'ex-2',
          areaId: 'area-1',
          scheduleId: null,
          type: ExceptionType.SPECIAL_COLLECTION,
          originalDate: new Date('2026-07-25T00:00:00.000Z'),
          replacementStartTime: '10:00',
          replacementEndTime: '12:00',
          reason: 'Electronic Drive',
          wasteType: BinType.E_WASTE,
        },
      ]);

      const start = new Date('2026-07-20T00:00:00.000Z');
      const end = new Date('2026-07-26T00:00:00.000Z');

      const result = await service.getCitizenSchedules('citizen-1', start, end);
      const occurrences = result[0].occurrences;

      const tuesdayRegular = occurrences.find(
        (o: any) => o.collectionDate === '2026-07-21' && o.source === 'REGULAR',
      );
      expect(tuesdayRegular).toBeUndefined();

      const wednesdayRescheduled = occurrences.find(
        (o: any) => o.collectionDate === '2026-07-22' && o.source === 'RESCHEDULED',
      );
      expect(wednesdayRescheduled).toBeDefined();
      expect(wednesdayRescheduled.startTime).toBe('14:00');
      expect(wednesdayRescheduled.changeReason).toBe('Holiday Reschedule');

      const saturdaySpecial = occurrences.find(
        (o: any) => o.collectionDate === '2026-07-25' && o.source === 'SPECIAL',
      );
      expect(saturdaySpecial).toBeDefined();
      expect(saturdaySpecial.wasteType).toBe(BinType.E_WASTE);
      expect(saturdaySpecial.startTime).toBe('10:00');
    });
  });
});
