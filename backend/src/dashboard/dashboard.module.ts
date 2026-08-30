import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [PrismaModule, AnalyticsModule, SchedulesModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
