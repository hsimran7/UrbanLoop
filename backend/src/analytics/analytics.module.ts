import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { OpenDataController } from './open-data.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController, OpenDataController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
