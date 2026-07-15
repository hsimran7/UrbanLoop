import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { CitizenScheduleController } from './citizen-schedule.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SchedulesController, CitizenScheduleController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
