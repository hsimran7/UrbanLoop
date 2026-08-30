import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetNotificationService } from './fleet-notification.service';
import { FleetGateway } from './fleet.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [PrismaModule, AuditModule, ScheduleModule.forRoot()],
  controllers: [FleetController],
  providers: [FleetService, FleetNotificationService, FleetGateway],
  exports: [FleetService],
})
export class FleetModule {}
