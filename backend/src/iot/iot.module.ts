import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { IoTService } from './iot.service';
import { IoTController } from './iot.controller';
import { SimulatorService } from './simulator.service';
import { ConnectivityCronService } from './connectivity-cron.service';
import { BinsModule } from '../bins/bins.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    BinsModule,
  ],
  controllers: [IoTController],
  providers: [IoTService, SimulatorService, ConnectivityCronService],
  exports: [IoTService, SimulatorService],
})
export class IoTModule {}
