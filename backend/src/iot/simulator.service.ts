import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BinStateService } from '../bins/bin-state.service';
import { TelemetrySource, BinStatus } from '@prisma/client';

interface SimulatorBinState {
  binId: string;
  fillLevel: number;
  batteryLevel: number;
  fillRate: number; // % per tick (0.5 – 3.0)
  drainRate: number; // battery drain per tick (0.1 – 0.5)
}

/**
 * SimulatorService
 * ─────────────────────────────────────────────────────────────────────
 * Lifecycle-aware singleton background service that continuously sends
 * synthetic telemetry for all registered bins so the system behaves
 * as if real smart-bin sensors are connected.
 *
 * Safety guarantees:
 *   - One tick loop per application lifecycle (no double-start).
 *   - Gracefully drains in-progress work on module destroy.
 *   - All ticks use the same validated BinStateService path as real IoT.
 *   - Fill resets to 0 when a manual "Emptied" is recorded so the
 *     simulation stays consistent with the real operational state.
 */
@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);

  private readonly TICK_INTERVAL_MS = 30_000; // 30 seconds between ticks
  private readonly BINS_PER_TICK = 20;         // Process at most N bins per tick to avoid DB overload

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private destroyed = false;

  /** In-memory map of per-bin simulation state */
  private binStates = new Map<string, SimulatorBinState>();

  constructor(
    private prisma: PrismaService,
    private binStateService: BinStateService,
  ) {}

  onModuleInit() {
    this.logger.log('SimulatorService starting...');
    this.scheduleNextTick();
  }

  onModuleDestroy() {
    this.logger.log('SimulatorService stopping...');
    this.destroyed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ─── Tick Loop ───────────────────────────────────────────────────────────────

  private scheduleNextTick() {
    if (this.destroyed) return;
    this.timer = setTimeout(() => this.runTick(), this.TICK_INTERVAL_MS);
  }

  private async runTick() {
    if (this.destroyed) return;
    if (this.running) {
      // Prevent overlapping ticks under slow DB
      this.logger.warn('SimulatorService: previous tick still running, skipping.');
      this.scheduleNextTick();
      return;
    }

    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error('SimulatorService tick error:', err);
    } finally {
      this.running = false;
      this.scheduleNextTick();
    }
  }

  private async tick() {
    // Fetch a page of bins to simulate
    const bins = await this.prisma.bin.findMany({
      take: this.BINS_PER_TICK,
      orderBy: { updatedAt: 'asc' }, // round-robin by least recently touched
    });

    const now = new Date();

    for (const bin of bins) {
      try {
        let state = this.binStates.get(bin.id);

        if (!state) {
          // Initialise new bin state from DB values
          state = {
            binId: bin.id,
            fillLevel: bin.currentFillLevel,
            batteryLevel: 85 + Math.floor(Math.random() * 15), // 85-100%
            fillRate: 0.5 + Math.random() * 2.5, // 0.5-3.0% per tick
            drainRate: 0.1 + Math.random() * 0.4,
          };
          this.binStates.set(bin.id, state);
        } else {
          // Sync fill from DB if it was manually emptied
          if (bin.currentFillLevel < state.fillLevel - 5) {
            state.fillLevel = bin.currentFillLevel;
          }
        }

        // Advance simulation
        state.fillLevel = Math.min(100, state.fillLevel + state.fillRate);
        state.batteryLevel = Math.max(0, state.batteryLevel - state.drainRate);

        // Slowly recharge (simulating solar/grid top-up at night)
        if (state.batteryLevel < 30) {
          state.batteryLevel = Math.min(100, state.batteryLevel + 1.5);
        }

        const eventId = `sim_${bin.id}_${now.getTime()}`;

        await this.binStateService.processTelemetry(
          bin.id,
          {
            fillLevel: Math.round(state.fillLevel),
            batteryLevel: Math.round(state.batteryLevel),
            recordedAt: now,
            eventId,
          },
          TelemetrySource.SIMULATOR,
        );
      } catch (err: any) {
        // Log per-bin errors without crashing the whole tick
        if (err?.status !== 409) {
          // 409 = duplicate eventId (harmless race)
          this.logger.error(`Simulator tick failed for bin ${bin.id}: ${err?.message}`);
        }
      }
    }

    this.logger.debug(`Simulator tick complete: processed ${bins.length} bins`);
  }

  // ─── Admin Controls ──────────────────────────────────────────────────────────

  /** Force an immediate tick (useful for testing / demo). */
  async forceTick(): Promise<void> {
    if (this.running) return;
    await this.tick();
  }

  /** Remove cached state for a bin (forces re-init on next tick). */
  evictBinState(binId: string): void {
    this.binStates.delete(binId);
  }

  /** Expose simulator health for dashboards. */
  getStatus(): { running: boolean; trackedBins: number; tickIntervalMs: number } {
    return {
      running: !this.destroyed,
      trackedBins: this.binStates.size,
      tickIntervalMs: this.TICK_INTERVAL_MS,
    };
  }
}
