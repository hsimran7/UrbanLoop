import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { GeoModule } from './geo/geo.module';
import { PropertiesModule } from './properties/properties.module';
import { BinsModule } from './bins/bins.module';
import { SchedulesModule } from './schedules/schedules.module';
import { IoTModule } from './iot/iot.module';
import { WorkforceModule } from './workforce/workforce.module';
import { TeamsModule } from './teams/teams.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ZonesModule } from './zones/zones.module';
import { AssignmentsModule } from './assignments/assignments.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    GeoModule,
    PropertiesModule,
    BinsModule,
    SchedulesModule,
    IoTModule,
    WorkforceModule,
    TeamsModule,
    ShiftsModule,
    ZonesModule,
    AssignmentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
