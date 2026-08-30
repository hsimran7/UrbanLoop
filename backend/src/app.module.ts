import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { DashboardModule } from './dashboard/dashboard.module';
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
import { FacilitiesModule } from './facilities/facilities.module';
import { LoadsModule } from './loads/loads.module';
import { RequestsModule } from './requests/requests.module';
import { FleetModule } from './fleet/fleet.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AIModule } from './ai/ai.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DepartmentsModule } from './departments/departments.module';
import { MetaModule } from './meta/meta.module';
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
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
    FacilitiesModule,
    LoadsModule,
    RequestsModule,
    FleetModule,
    AnalyticsModule,
    AIModule,
    RealtimeModule,
    DepartmentsModule,
    MetaModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
