import { Module } from '@nestjs/common';
import { BinsService } from './bins.service';
import { BinsController } from './bins.controller';
import { BinStateService } from './bin-state.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BinsController],
  providers: [BinsService, BinStateService],
  exports: [BinsService, BinStateService],
})
export class BinsModule {}
