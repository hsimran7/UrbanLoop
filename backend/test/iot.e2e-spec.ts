import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { BinStateService } from '../src/bins/bin-state.service';
import { IoTService } from '../src/iot/iot.service';
import {
  IoTDeviceStatus,
  TelemetrySource,
  AlertStatus,
  BinAlertType,
  AlertSeverity,
  TelemetryStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function makeBin(overrides: Partial<any> = {}) {
  return {
    id: 'bin-001',
    qrCodeId: 'QR-001',
    type: 'DRY',
    status: 'EMPTY',
    condition: 'GOOD',
    currentFillLevel: 0,
    lastTelemetryAt: null,
    telemetryStatus: TelemetryStatus.NEVER_CONNECTED,
    lastEmptiedAt: null,
    ...overrides,
  };
}

function makeDevice(overrides: Partial<any> = {}) {
  const rawKey = randomBytes(32).toString('hex');
  return {
    rawKey,
    device: {
      id: 'device-001',
      deviceIdentifier: 'TEST-SN-001',
      binId: 'bin-001',
      credentialHash: sha256(rawKey),
      status: IoTDeviceStatus.ACTIVE,
      lastSeenAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
  };
}

// ─── BinStateService Unit Tests ───────────────────────────────────────────────

describe('BinStateService Unit Tests', () => {
  let service: BinStateService;
  let mockPrisma: any;

  const baseBin = makeBin();

  beforeEach(async () => {
    mockPrisma = {
      bin: {
        findUnique: jest.fn().mockResolvedValue(baseBin),
        update: jest.fn().mockResolvedValue({ ...baseBin }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      binTelemetry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'telem-001' }),
      },
      binAlert: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'alert-001' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      ioTDevice: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((fn: any) =>
        fn({
          bin: mockPrisma.bin,
          binTelemetry: mockPrisma.binTelemetry,
          binAlert: mockPrisma.binAlert,
          ioTDevice: mockPrisma.ioTDevice,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BinStateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BinStateService>(BinStateService);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('should reject fillLevel outside [0,100]', async () => {
    await expect(
      service.processTelemetry('bin-001', { fillLevel: 101, recordedAt: new Date() }, TelemetrySource.SIMULATOR),
    ).rejects.toThrow('fillLevel must be in the range');

    await expect(
      service.processTelemetry('bin-001', { fillLevel: -1, recordedAt: new Date() }, TelemetrySource.SIMULATOR),
    ).rejects.toThrow('fillLevel must be in the range');
  });

  it('should reject future timestamps beyond 5-minute tolerance', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000); // 10 min in future
    await expect(
      service.processTelemetry('bin-001', { fillLevel: 50, recordedAt: future }, TelemetrySource.SIMULATOR),
    ).rejects.toThrow('cannot be in the future');
  });

  it('should reject telemetry older than 30 days', async () => {
    const ancient = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await expect(
      service.processTelemetry('bin-001', { fillLevel: 50, recordedAt: ancient }, TelemetrySource.SIMULATOR),
    ).rejects.toThrow('30-day window');
  });

  // ── Out-of-order handling ────────────────────────────────────────────────────

  it('should save out-of-order telemetry but NOT update Bin current state', async () => {
    const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    mockPrisma.bin.findUnique.mockResolvedValue({
      ...baseBin,
      lastTelemetryAt: new Date(), // newer timestamp already recorded
    });

    await service.processTelemetry(
      'bin-001',
      { fillLevel: 30, recordedAt: oldTimestamp },
      TelemetrySource.SIMULATOR,
    );

    // Telemetry should be created
    expect(mockPrisma.binTelemetry.create).toHaveBeenCalledTimes(1);
    // Bin state should NOT be updated (out-of-order)
    expect(mockPrisma.bin.update).not.toHaveBeenCalled();
  });

  // ── Idempotency ──────────────────────────────────────────────────────────────

  it('should reject duplicate eventId for same device', async () => {
    mockPrisma.binTelemetry.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.processTelemetry(
        'bin-001',
        { fillLevel: 50, recordedAt: new Date(), eventId: 'evt-dup' },
        TelemetrySource.IOT_DEVICE,
        'device-001',
      ),
    ).rejects.toThrow('Duplicate event');
  });

  // ── Alert hysteresis ─────────────────────────────────────────────────────────

  it('should trigger BIN_NEAR_FULL alert when fillLevel >= 80', async () => {
    await service.processTelemetry('bin-001', { fillLevel: 82, recordedAt: new Date() }, TelemetrySource.SIMULATOR);
    expect(mockPrisma.binAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: BinAlertType.BIN_NEAR_FULL }),
      }),
    );
  });

  it('should NOT re-trigger NEAR_FULL while already active and fill stays in hysteresis band [75,95)', async () => {
    mockPrisma.binAlert.findMany.mockResolvedValue([
      { id: 'alert-near', type: BinAlertType.BIN_NEAR_FULL, status: AlertStatus.ACTIVE, severity: AlertSeverity.WARNING },
    ]);
    // Fill at 82 – still near full, no change expected
    await service.processTelemetry('bin-001', { fillLevel: 82, recordedAt: new Date() }, TelemetrySource.SIMULATOR);
    // Should update latestValue but NOT create a new alert
    expect(mockPrisma.binAlert.create).not.toHaveBeenCalled();
    expect(mockPrisma.binAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ latestValue: 82 }) }),
    );
  });

  it('should escalate NEAR_FULL to FULL when fillLevel >= 95', async () => {
    mockPrisma.binAlert.findMany.mockResolvedValue([
      { id: 'alert-near', type: BinAlertType.BIN_NEAR_FULL, status: AlertStatus.ACTIVE, severity: AlertSeverity.WARNING },
    ]);

    await service.processTelemetry('bin-001', { fillLevel: 96, recordedAt: new Date() }, TelemetrySource.SIMULATOR);

    // Old alert resolved
    expect(mockPrisma.binAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AlertStatus.RESOLVED }) }),
    );
    // New BIN_FULL alert created
    expect(mockPrisma.binAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: BinAlertType.BIN_FULL }),
      }),
    );
  });

  it('should resolve fill alert when fill drops below nearFullRelease (75)', async () => {
    mockPrisma.binAlert.findMany.mockResolvedValue([
      { id: 'alert-near', type: BinAlertType.BIN_NEAR_FULL, status: AlertStatus.ACTIVE, severity: AlertSeverity.WARNING },
    ]);

    await service.processTelemetry('bin-001', { fillLevel: 70, recordedAt: new Date() }, TelemetrySource.SIMULATOR);

    expect(mockPrisma.binAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AlertStatus.RESOLVED }) }),
    );
    expect(mockPrisma.binAlert.create).not.toHaveBeenCalled();
  });

  it('should trigger LOW_BATTERY when batteryLevel < 20', async () => {
    await service.processTelemetry(
      'bin-001',
      { fillLevel: 10, batteryLevel: 15, recordedAt: new Date() },
      TelemetrySource.SIMULATOR,
    );

    expect(mockPrisma.binAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: BinAlertType.LOW_BATTERY }),
      }),
    );
  });

  it('should resolve connectivity alerts when new telemetry arrives', async () => {
    mockPrisma.binAlert.findMany.mockResolvedValue([
      { id: 'alert-stale', type: BinAlertType.DEVICE_STALE, status: AlertStatus.ACTIVE, severity: AlertSeverity.WARNING },
    ]);

    await service.processTelemetry('bin-001', { fillLevel: 30, recordedAt: new Date() }, TelemetrySource.IOT_DEVICE, 'device-001');

    // STALE alert should be resolved
    expect(mockPrisma.binAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AlertStatus.RESOLVED }) }),
    );
  });

  // ── Emptying ─────────────────────────────────────────────────────────────────

  it('should reset fill and resolve fill alerts on recordEmptying', async () => {
    mockPrisma.bin.findUnique.mockResolvedValue({ ...baseBin, currentFillLevel: 90 });

    await service.recordEmptying('bin-001', 'admin-id');

    expect(mockPrisma.binAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AlertStatus.RESOLVED }),
      }),
    );
    expect(mockPrisma.bin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentFillLevel: 0 }),
      }),
    );
  });
});

// ─── IoTService Unit Tests ────────────────────────────────────────────────────

describe('IoTService Unit Tests', () => {
  let iotService: IoTService;
  let mockPrisma: any;
  let mockBinState: any;

  const { rawKey, device: baseDevice } = makeDevice();

  beforeEach(async () => {
    mockBinState = {
      processTelemetry: jest.fn().mockResolvedValue({ id: 'telem-001' }),
    };

    mockPrisma = {
      ioTDevice: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'device-001' }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      bin: {
        findUnique: jest.fn().mockResolvedValue(makeBin()),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IoTService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BinStateService, useValue: mockBinState },
      ],
    }).compile();

    iotService = module.get<IoTService>(IoTService);
  });

  it('should reject telemetry from unknown device identifier', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue(null);
    await expect(
      iotService.ingestTelemetry('UNKNOWN-DEVICE', 'any-key', { fillLevel: 50, recordedAt: new Date().toISOString() }),
    ).rejects.toThrow('Invalid device credentials');
  });

  it('should reject telemetry with invalid key (constant-time check)', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    await expect(
      iotService.ingestTelemetry(baseDevice.deviceIdentifier, 'wrong-key-' + randomBytes(32).toString('hex'), {
        fillLevel: 50,
        recordedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('Invalid device credentials');
  });

  it('should accept telemetry with valid credentials and forward to BinStateService', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    const result = await iotService.ingestTelemetry(baseDevice.deviceIdentifier, rawKey, {
      fillLevel: 60,
      recordedAt: new Date().toISOString(),
    });
    expect(result.accepted).toBe(true);
    expect(mockBinState.processTelemetry).toHaveBeenCalledWith(
      baseDevice.binId,
      expect.objectContaining({ fillLevel: 60 }),
      TelemetrySource.IOT_DEVICE,
      baseDevice.id,
    );
  });

  it('should reject telemetry from REVOKED device even with correct key', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue({ ...baseDevice, status: IoTDeviceStatus.REVOKED });
    await expect(
      iotService.ingestTelemetry(baseDevice.deviceIdentifier, rawKey, { fillLevel: 50, recordedAt: new Date().toISOString() }),
    ).rejects.toThrow('revoked');
  });

  it('should reject telemetry from DISABLED device even with correct key', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue({ ...baseDevice, status: IoTDeviceStatus.DISABLED });
    await expect(
      iotService.ingestTelemetry(baseDevice.deviceIdentifier, rawKey, { fillLevel: 50, recordedAt: new Date().toISOString() }),
    ).rejects.toThrow('disabled');
  });

  it('should prevent provisioning a second device on the same bin', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    await expect(
      iotService.provisionDevice({ binId: 'bin-001', deviceIdentifier: 'DUPLICATE-SN' }),
    ).rejects.toThrow('already has a provisioned device');
  });

  it('should prevent rotating credentials on a REVOKED device', async () => {
    // findUnique for rotateCredentials checks by id
    mockPrisma.ioTDevice.findUnique.mockResolvedValue({ ...baseDevice, status: IoTDeviceStatus.REVOKED });
    await expect(iotService.rotateCredentials('device-001')).rejects.toThrow('Cannot rotate credentials on a revoked device');
  });

  it('should prevent re-enabling a REVOKED device', async () => {
    mockPrisma.ioTDevice.findUnique.mockResolvedValue({ ...baseDevice, status: IoTDeviceStatus.REVOKED });
    await expect(iotService.enableDevice('device-001')).rejects.toThrow('Revoked devices cannot be re-enabled');
  });
});

// ─── IoT Telemetry E2E API Tests ─────────────────────────────────────────────

describe('IoT Telemetry Endpoint (E2E)', () => {
  let app: INestApplication;
  let iotService: IoTService;

  const mockBinState = {
    processTelemetry: jest.fn().mockResolvedValue({ id: 'telem-001' }),
    recordEmptying: jest.fn(),
    evaluateConnectivityStates: jest.fn(),
  };

  const { rawKey, device: baseDevice } = makeDevice();

  const mockIotPrisma = {
    ioTDevice: {
      findUnique: jest.fn().mockResolvedValue(baseDevice),
      create: jest.fn().mockResolvedValue(baseDevice),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([baseDevice]),
    },
    bin: {
      findUnique: jest.fn().mockResolvedValue(makeBin()),
      update: jest.fn().mockResolvedValue(makeBin()),
      findMany: jest.fn().mockResolvedValue([]),
    },
    binTelemetry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'telem-001' }),
    },
    binAlert: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'alert-001' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    auditLog: { create: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    property: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    area: { findUnique: jest.fn().mockResolvedValue({ id: 'area-1', name: 'Test' }) },
    $transaction: jest.fn().mockImplementation((fn: any) => fn(mockIotPrisma)),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockIotPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.init();

    iotService = moduleFixture.get<IoTService>(IoTService);
  });

  afterAll(async () => { await app.close(); });

  it('POST /api/v1/iot/telemetry should accept valid device credentials (202)', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', baseDevice.deviceIdentifier)
      .set('x-device-key', rawKey)
      .send({ fillLevel: 60, recordedAt: new Date().toISOString() })
      .expect(202);
  });

  it('POST /api/v1/iot/telemetry should return 401 for unknown device', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue(null);
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', 'nonexistent-device')
      .set('x-device-key', 'any-key')
      .send({ fillLevel: 60, recordedAt: new Date().toISOString() })
      .expect(401);
  });

  it('POST /api/v1/iot/telemetry should return 401 for wrong key', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', baseDevice.deviceIdentifier)
      .set('x-device-key', 'completely-wrong-key')
      .send({ fillLevel: 60, recordedAt: new Date().toISOString() })
      .expect(401);
  });

  it('POST /api/v1/iot/telemetry should return 403 for REVOKED device', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue({ ...baseDevice, status: IoTDeviceStatus.REVOKED });
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', baseDevice.deviceIdentifier)
      .set('x-device-key', rawKey)
      .send({ fillLevel: 60, recordedAt: new Date().toISOString() })
      .expect(403);
  });

  it('POST /api/v1/iot/telemetry should return 403 for DISABLED device', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue({ ...baseDevice, status: IoTDeviceStatus.DISABLED });
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', baseDevice.deviceIdentifier)
      .set('x-device-key', rawKey)
      .send({ fillLevel: 60, recordedAt: new Date().toISOString() })
      .expect(403);
  });

  it('POST /api/v1/iot/telemetry should return 400 for invalid fillLevel', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', baseDevice.deviceIdentifier)
      .set('x-device-key', rawKey)
      .send({ fillLevel: 150, recordedAt: new Date().toISOString() })
      .expect(400);
  });

  it('POST /api/v1/iot/telemetry should return 400 for missing recordedAt', () => {
    mockIotPrisma.ioTDevice.findUnique.mockResolvedValue(baseDevice);
    return request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('x-device-id', baseDevice.deviceIdentifier)
      .set('x-device-key', rawKey)
      .send({ fillLevel: 60 })
      .expect(400);
  });

  it('GET /api/v1/iot/devices should return 401 without auth token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/iot/devices')
      .expect(401);
  });
});
