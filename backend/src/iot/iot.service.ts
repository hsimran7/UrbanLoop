import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IoTDeviceStatus, TelemetrySource } from '@prisma/client';
import { BinStateService } from '../bins/bin-state.service';
import { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import { ProvisionDeviceDto } from './dto/provision-device.dto';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class IoTService {
  private readonly logger = new Logger(IoTService.name);

  constructor(
    private prisma: PrismaService,
    private binStateService: BinStateService,
  ) {}

  // ─── Device Provisioning ────────────────────────────────────────────────────

  /**
   * Provision a new IoT device for a bin.
   * Returns the raw device key ONCE – it is never stored in plaintext.
   */
  async provisionDevice(dto: ProvisionDeviceDto): Promise<{ deviceId: string; deviceKey: string }> {
    const bin = await this.prisma.bin.findUnique({ where: { id: dto.binId } });
    if (!bin) throw new NotFoundException('Bin not found.');

    // A bin may only have one device at a time
    const existing = await this.prisma.ioTDevice.findUnique({ where: { binId: dto.binId } });
    if (existing) {
      throw new ConflictException('Bin already has a provisioned device. Revoke it before re-provisioning.');
    }

    const rawKey = randomBytes(32).toString('hex'); // 64 char hex, 256-bit entropy
    const credentialHash = this.hashKey(rawKey);

    const device = await this.prisma.ioTDevice.create({
      data: {
        deviceIdentifier: dto.deviceIdentifier,
        binId: dto.binId,
        credentialHash,
        status: IoTDeviceStatus.ACTIVE,
      },
    });

    this.logger.log(`Provisioned device ${device.id} for bin ${dto.binId}`);

    return { deviceId: device.id, deviceKey: rawKey };
  }

  /**
   * Rotate device credentials.
   * The old key is invalidated immediately; the new key is returned once.
   */
  async rotateCredentials(deviceId: string): Promise<{ deviceKey: string }> {
    const device = await this.prisma.ioTDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found.');
    if (device.status === IoTDeviceStatus.REVOKED) {
      throw new ForbiddenException('Cannot rotate credentials on a revoked device.');
    }

    const rawKey = randomBytes(32).toString('hex');
    const credentialHash = this.hashKey(rawKey);

    await this.prisma.ioTDevice.update({
      where: { id: deviceId },
      data: { credentialHash },
    });

    this.logger.log(`Rotated credentials for device ${deviceId}`);
    return { deviceKey: rawKey };
  }

  /**
   * Disable a device (soft-disable; can be re-enabled).
   */
  async disableDevice(deviceId: string): Promise<void> {
    await this.requireDevice(deviceId);
    await this.prisma.ioTDevice.update({
      where: { id: deviceId },
      data: { status: IoTDeviceStatus.DISABLED },
    });
  }

  /**
   * Re-enable a disabled device.
   */
  async enableDevice(deviceId: string): Promise<void> {
    const device = await this.requireDevice(deviceId);
    if (device.status === IoTDeviceStatus.REVOKED) {
      throw new ForbiddenException('Revoked devices cannot be re-enabled.');
    }
    await this.prisma.ioTDevice.update({
      where: { id: deviceId },
      data: { status: IoTDeviceStatus.ACTIVE },
    });
  }

  /**
   * Permanently revoke a device. Irreversible.
   */
  async revokeDevice(deviceId: string): Promise<void> {
    await this.requireDevice(deviceId);
    await this.prisma.ioTDevice.update({
      where: { id: deviceId },
      data: { status: IoTDeviceStatus.REVOKED },
    });
    this.logger.warn(`Device ${deviceId} has been permanently revoked.`);
  }

  /**
   * List all provisioned devices (optionally filtered by binId).
   */
  async listDevices(binId?: string) {
    return this.prisma.ioTDevice.findMany({
      where: binId ? { binId } : undefined,
      select: {
        id: true,
        deviceIdentifier: true,
        binId: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
        // Never expose credentialHash
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Telemetry Ingestion ─────────────────────────────────────────────────────

  /**
   * Machine-authenticated telemetry ingestion endpoint logic.
   * Validates device credentials using constant-time comparison.
   * NEVER logs deviceKey.
   */
  async ingestTelemetry(
    deviceIdentifier: string,
    rawKey: string,
    dto: IngestTelemetryDto,
  ): Promise<{ accepted: boolean; telemetryId: string }> {
    // Look up device by public identifier only
    const device = await this.prisma.ioTDevice.findUnique({
      where: { deviceIdentifier },
    });

    // Validate device + key – do both lookups before throwing to resist timing attacks
    if (!device) {
      this.logger.warn(`Telemetry rejected: unknown device identifier`);
      throw new UnauthorizedException('Invalid device credentials.');
    }

    const candidateHash = this.hashKey(rawKey);
    const storedHashBuf = Buffer.from(device.credentialHash, 'hex');
    const candidateBuf = Buffer.from(candidateHash, 'hex');

    let credentialValid = false;
    try {
      credentialValid =
        storedHashBuf.length === candidateBuf.length &&
        timingSafeEqual(storedHashBuf, candidateBuf);
    } catch {
      credentialValid = false;
    }

    if (!credentialValid) {
      this.logger.warn(`Telemetry rejected: invalid key for device ${device.id}`);
      throw new UnauthorizedException('Invalid device credentials.');
    }

    // Gate on device status AFTER credential check (constant-time; status checked second)
    if (device.status === IoTDeviceStatus.REVOKED) {
      this.logger.warn(`Telemetry rejected: device ${device.id} is REVOKED`);
      throw new ForbiddenException('Device has been revoked.');
    }
    if (device.status === IoTDeviceStatus.DISABLED) {
      this.logger.warn(`Telemetry rejected: device ${device.id} is DISABLED`);
      throw new ForbiddenException('Device is currently disabled.');
    }

    const telemetry = await this.binStateService.processTelemetry(
      device.binId,
      {
        fillLevel: dto.fillLevel,
        batteryLevel: dto.batteryLevel,
        temperature: dto.temperature,
        signalStrength: dto.signalStrength,
        recordedAt: dto.recordedAt,
        eventId: dto.eventId,
      },
      TelemetrySource.IOT_DEVICE,
      device.id,
    );

    return { accepted: true, telemetryId: telemetry.id };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  private async requireDevice(deviceId: string) {
    const device = await this.prisma.ioTDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found.');
    return device;
  }
}
