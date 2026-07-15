import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BinStateService } from '../bins/bin-state.service';

/**
 * ConnectivityCronService
 * ─────────────────────────────────────────────────────────────────────
 * Runs every 5 minutes to evaluate stale/offline connectivity thresholds
 * for all bins that have ever received telemetry.
 *
 * Uses BinStateService.evaluateConnectivityStates() which processes
 * each transition inside a Prisma transaction (atomic alert creation).
 */
@Injectable()
export class ConnectivityCronService {
  private readonly logger = new Logger(ConnectivityCronService.name);

  constructor(private binStateService: BinStateService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateConnectivity(): Promise<void> {
    this.logger.debug('Running connectivity state evaluation...');
    try {
      await this.binStateService.evaluateConnectivityStates();
    } catch (err) {
      this.logger.error('Connectivity evaluation failed:', err);
    }
  }
}
