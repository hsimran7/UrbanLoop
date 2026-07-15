import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BinTelemetry, BinAlert, Bin, TelemetrySource, BinAlertType, AlertSeverity, AlertStatus, IoTDeviceStatus, TelemetryStatus } from '@prisma/client';
import { timingSafeEqual, createHash } from 'crypto';

export interface TelemetryPayload {
  fillLevel: number;
  batteryLevel?: number;
  temperature?: number;
  signalStrength?: number;
  recordedAt: string | Date;
  eventId?: string;
}

@Injectable()
export class BinStateService {
  constructor(private prisma: PrismaService) {}

  // Central config values
  private readonly config = {
    staleMinutes: 15,
    offlineMinutes: 60,
    hysteresis: {
      nearFullTrigger: 80,
      nearFullRelease: 75,
      fullTrigger: 95,
      fullRelease: 90,
      overflowTrigger: 100,
      overflowRelease: 95,
      lowBatteryTrigger: 20,
      lowBatteryRelease: 25,
    }
  };

  /**
   * Process incoming telemetry atomically inside a Prisma transaction.
   * Handles M2M data validation, idempotency, out-of-order checks, and alert transitions.
   */
  async processTelemetry(
    binId: string,
    payload: TelemetryPayload,
    source: TelemetrySource,
    deviceId?: string,
  ): Promise<BinTelemetry> {
    // 1. Validation Range
    if (payload.fillLevel < 0 || payload.fillLevel > 100) {
      throw new BadRequestException('fillLevel must be in the range [0, 100].');
    }
    if (payload.batteryLevel !== undefined && (payload.batteryLevel < 0 || payload.batteryLevel > 100)) {
      throw new BadRequestException('batteryLevel must be in the range [0, 100].');
    }

    const recordedDate = new Date(payload.recordedAt);
    const now = new Date();

    if (isNaN(recordedDate.getTime())) {
      throw new BadRequestException('Invalid timestamp format for recordedAt.');
    }

    // Future timestamp check with 5 minutes tolerance
    if (recordedDate.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw new BadRequestException('Telemetry timestamp cannot be in the future.');
    }

    // Reject excessively old telemetry (> 30 days)
    if (recordedDate.getTime() < now.getTime() - 30 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Telemetry is older than the allowed 30-day window.');
    }

    // 2. Transaction Scope
    return this.prisma.$transaction(async (tx) => {
      // Idempotency check inside database to avoid race conditions
      if (deviceId && payload.eventId) {
        const existing = await tx.binTelemetry.findUnique({
          where: {
            deviceId_eventId: {
              deviceId,
              eventId: payload.eventId,
            },
          },
        });
        if (existing) {
          throw new ConflictException(`Duplicate event received for eventId: ${payload.eventId} on device: ${deviceId}`);
        }
      }

      // Fetch bin
      const bin = await tx.bin.findUnique({
        where: { id: binId },
      });
      if (!bin) {
        throw new NotFoundException('Bin not found.');
      }

      // Create telemetry record
      const telemetry = await tx.binTelemetry.create({
        data: {
          binId,
          fillLevel: payload.fillLevel,
          batteryLevel: payload.batteryLevel || null,
          temperature: payload.temperature || null,
          signalStrength: payload.signalStrength || null,
          recordedAt: recordedDate,
          receivedAt: now,
          source,
          deviceId: deviceId || null,
          eventId: payload.eventId || null,
        },
      });

      // Update IoTDevice lastSeenAt if it is a real device
      if (deviceId) {
        await tx.ioTDevice.update({
          where: { id: deviceId },
          data: { lastSeenAt: now },
        });
      }

      // Out-Of-Order Check:
      // A valid older reading is saved but must not update Bin current state or alerts
      const isNewer = !bin.lastTelemetryAt || recordedDate > bin.lastTelemetryAt;

      if (isNewer) {
        // Resolve online status dynamics
        const updatedStatus = TelemetryStatus.ONLINE;

        // Update Bin current state
        await tx.bin.update({
          where: { id: binId },
          data: {
            currentFillLevel: payload.fillLevel,
            lastTelemetryAt: recordedDate,
            telemetryStatus: updatedStatus,
          },
        });

        // Evaluate alerts for the current telemetry values
        await this.evaluateAlerts(tx, binId, payload.fillLevel, payload.batteryLevel, recordedDate);
      }

      return telemetry;
    });
  }

  /**
   * Evaluates fillLevel and batteryLevel alerts inside the transaction.
   * Enforces at-most-one active fill alert, status transitions, and threshold hysteresis.
   */
  private async evaluateAlerts(
    tx: any,
    binId: string,
    fillLevel: number,
    batteryLevel: number | undefined,
    timestamp: Date,
  ): Promise<void> {
    // 1. Resolve active fill alerts
    const activeAlerts = await tx.binAlert.findMany({
      where: { binId, status: AlertStatus.ACTIVE },
    });

    const activeFillAlert = activeAlerts.find((a: any) =>
      [BinAlertType.BIN_NEAR_FULL, BinAlertType.BIN_FULL, BinAlertType.BIN_OVERFLOW_RISK].includes(a.type),
    );

    let targetFillType: BinAlertType | null = null;
    let targetSeverity: AlertSeverity = AlertSeverity.INFO;

    // Apply thresholds with hysteresis
    if (activeFillAlert) {
      const type = activeFillAlert.type;

      if (type === BinAlertType.BIN_NEAR_FULL) {
        if (fillLevel >= this.config.hysteresis.fullTrigger) {
          targetFillType = BinAlertType.BIN_FULL;
          targetSeverity = AlertSeverity.CRITICAL;
        } else if (fillLevel < this.config.hysteresis.nearFullRelease) {
          targetFillType = null; // drop below 75 resolves near full
        } else {
          targetFillType = BinAlertType.BIN_NEAR_FULL; // keep active
        }
      } else if (type === BinAlertType.BIN_FULL) {
        if (fillLevel >= this.config.hysteresis.overflowTrigger) {
          targetFillType = BinAlertType.BIN_OVERFLOW_RISK;
          targetSeverity = AlertSeverity.CRITICAL;
        } else if (fillLevel < this.config.hysteresis.fullRelease) {
          // If drop below 90, determine if it falls into NEAR_FULL or clean normal
          if (fillLevel >= this.config.hysteresis.nearFullTrigger) {
            targetFillType = BinAlertType.BIN_NEAR_FULL;
            targetSeverity = AlertSeverity.WARNING;
          } else if (fillLevel < this.config.hysteresis.nearFullRelease) {
            targetFillType = null;
          } else {
            targetFillType = BinAlertType.BIN_NEAR_FULL;
            targetSeverity = AlertSeverity.WARNING;
          }
        } else {
          targetFillType = BinAlertType.BIN_FULL;
        }
      } else if (type === BinAlertType.BIN_OVERFLOW_RISK) {
        if (fillLevel < this.config.hysteresis.overflowRelease) {
          if (fillLevel >= this.config.hysteresis.fullTrigger) {
            targetFillType = BinAlertType.BIN_FULL;
            targetSeverity = AlertSeverity.CRITICAL;
          } else {
            targetFillType = BinAlertType.BIN_NEAR_FULL;
            targetSeverity = AlertSeverity.WARNING;
          }
        } else {
          targetFillType = BinAlertType.BIN_OVERFLOW_RISK;
        }
      }
    } else {
      // No active fill alert, verify trigger points
      if (fillLevel >= this.config.hysteresis.overflowTrigger) {
        targetFillType = BinAlertType.BIN_OVERFLOW_RISK;
        targetSeverity = AlertSeverity.CRITICAL;
      } else if (fillLevel >= this.config.hysteresis.fullTrigger) {
        targetFillType = BinAlertType.BIN_FULL;
        targetSeverity = AlertSeverity.CRITICAL;
      } else if (fillLevel >= this.config.hysteresis.nearFullTrigger) {
        targetFillType = BinAlertType.BIN_NEAR_FULL;
        targetSeverity = AlertSeverity.WARNING;
      }
    }

    // Transitions for fill alerts
    if (activeFillAlert) {
      if (targetFillType === null) {
        // Resolve active alert
        await tx.binAlert.update({
          where: { id: activeFillAlert.id },
          data: { status: AlertStatus.RESOLVED, resolvedAt: timestamp, latestValue: fillLevel },
        });
      } else if (activeFillAlert.type !== targetFillType) {
        // Resolve old one and create new one
        await tx.binAlert.update({
          where: { id: activeFillAlert.id },
          data: { status: AlertStatus.RESOLVED, resolvedAt: timestamp, latestValue: fillLevel },
        });
        await tx.binAlert.create({
          data: {
            binId,
            type: targetFillType,
            severity: targetSeverity,
            status: AlertStatus.ACTIVE,
            triggeredAt: timestamp,
            latestValue: fillLevel,
          },
        });
      } else {
        // Just update latest value on the active alert
        await tx.binAlert.update({
          where: { id: activeFillAlert.id },
          data: { latestValue: fillLevel },
        });
      }
    } else if (targetFillType !== null) {
      // Create new fill alert
      await tx.binAlert.create({
        data: {
          binId,
          type: targetFillType,
          severity: targetSeverity,
          status: AlertStatus.ACTIVE,
          triggeredAt: timestamp,
          latestValue: fillLevel,
        },
      });
    }

    // 2. Battery alerts (co-exist with fill alerts)
    if (batteryLevel !== undefined) {
      const activeBatteryAlert = activeAlerts.find((a: any) => a.type === BinAlertType.LOW_BATTERY);

      let targetBatteryActive = false;
      if (activeBatteryAlert) {
        targetBatteryActive = batteryLevel < this.config.hysteresis.lowBatteryRelease;
      } else {
        targetBatteryActive = batteryLevel < this.config.hysteresis.lowBatteryTrigger;
      }

      if (activeBatteryAlert && !targetBatteryActive) {
        // Resolve battery alert
        await tx.binAlert.update({
          where: { id: activeBatteryAlert.id },
          data: { status: AlertStatus.RESOLVED, resolvedAt: timestamp, latestValue: batteryLevel },
        });
      } else if (!activeBatteryAlert && targetBatteryActive) {
        // Trigger battery alert
        await tx.binAlert.create({
          data: {
            binId,
            type: BinAlertType.LOW_BATTERY,
            severity: AlertSeverity.WARNING,
            status: AlertStatus.ACTIVE,
            triggeredAt: timestamp,
            latestValue: batteryLevel,
          },
        });
      } else if (activeBatteryAlert) {
        // Update value
        await tx.binAlert.update({
          where: { id: activeBatteryAlert.id },
          data: { latestValue: batteryLevel },
        });
      }
    }

    // 3. Resolve any active connectivity alerts when telemetry resumes
    const connectivityAlerts = activeAlerts.filter((a: any) =>
      [BinAlertType.DEVICE_STALE, BinAlertType.DEVICE_OFFLINE].includes(a.type),
    );
    for (const ca of connectivityAlerts) {
      await tx.binAlert.update({
        where: { id: ca.id },
        data: { status: AlertStatus.RESOLVED, resolvedAt: timestamp },
      });
    }
  }

  /**
   * Simulates verified manual administrative emptying.
   */
  async recordEmptying(binId: string, userId: string): Promise<Bin> {
    const bin = await this.prisma.bin.findUnique({ where: { id: binId } });
    if (!bin) {
      throw new NotFoundException('Bin not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Resolve all fill alerts
      await tx.binAlert.updateMany({
        where: { binId, status: AlertStatus.ACTIVE, type: { in: [BinAlertType.BIN_NEAR_FULL, BinAlertType.BIN_FULL, BinAlertType.BIN_OVERFLOW_RISK] } },
        data: { status: AlertStatus.RESOLVED, resolvedAt: new Date(), latestValue: 0 },
      });

      return tx.bin.update({
        where: { id: binId },
        data: {
          currentFillLevel: 0,
          lastEmptiedAt: new Date(),
        },
      });
    });
  }

  /**
   * Background Status Evaluation task.
   * Evaluates offline/stale connectivity thresholds.
   */
  async evaluateConnectivityStates(): Promise<void> {
    const now = new Date();
    const bins = await this.prisma.bin.findMany({
      where: {
        lastTelemetryAt: { not: null },
      },
      include: {
        alerts: {
          where: { status: AlertStatus.ACTIVE },
        },
      },
    });

    for (const bin of bins) {
      const diffMs = now.getTime() - bin.lastTelemetryAt!.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      let targetStatus: TelemetryStatus = TelemetryStatus.ONLINE;
      if (diffMinutes > this.config.offlineMinutes) {
        targetStatus = TelemetryStatus.OFFLINE;
      } else if (diffMinutes > this.config.staleMinutes) {
        targetStatus = TelemetryStatus.STALE;
      }

      if (bin.telemetryStatus !== targetStatus) {
        await this.prisma.$transaction(async (tx) => {
          await tx.bin.update({
            where: { id: bin.id },
            data: { telemetryStatus: targetStatus },
          });

          // Manage connectivity alerts
          const activeStale = bin.alerts.find((a) => a.type === BinAlertType.DEVICE_STALE);
          const activeOffline = bin.alerts.find((a) => a.type === BinAlertType.DEVICE_OFFLINE);

          if (targetStatus === TelemetryStatus.STALE) {
            if (!activeStale) {
              await tx.binAlert.create({
                data: {
                  binId: bin.id,
                  type: BinAlertType.DEVICE_STALE,
                  severity: AlertSeverity.WARNING,
                  status: AlertStatus.ACTIVE,
                  triggeredAt: now,
                },
              });
            }
          } else if (targetStatus === TelemetryStatus.OFFLINE) {
            // Resolve STALE alert if active
            if (activeStale) {
              await tx.binAlert.update({
                where: { id: activeStale.id },
                data: { status: AlertStatus.RESOLVED, resolvedAt: now },
              });
            }
            // Trigger OFFLINE alert
            if (!activeOffline) {
              await tx.binAlert.create({
                data: {
                  binId: bin.id,
                  type: BinAlertType.DEVICE_OFFLINE,
                  severity: AlertSeverity.CRITICAL,
                  status: AlertStatus.ACTIVE,
                  triggeredAt: now,
                },
              });
            }
          }
        });
      }
    }
  }
}
