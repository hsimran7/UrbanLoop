import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fleetEventEmitter } from './fleet.event-emitter';

@Injectable()
export class FleetNotificationService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Event listener: immutable VehicleEvent timeline logger
    fleetEventEmitter.on('vehicle.event', async (data) => {
      try {
        await this.prisma.vehicleEvent.create({
          data: {
            vehicleId: data.vehicleId,
            eventType: data.eventType,
            previousStatus: data.previousStatus ?? null,
            newStatus: data.newStatus ?? null,
            userId: data.userId ?? null,
            source: data.source ?? 'SYSTEM',
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            metadata: data.metadata ?? {},
          },
        });
      } catch (err) {
        console.error('Failed to log vehicle timeline event:', err);
      }
    });

    // Event listener: Fleet notifications logger
    fleetEventEmitter.on('fleet.notification', async (data) => {
      try {
        await this.prisma.fleetNotification.create({
          data: {
            vehicleId: data.vehicleId ?? null,
            type: data.type,
            message: data.message,
            severity: data.severity,
          },
        });
      } catch (err) {
        console.error('Failed to log fleet notification alert:', err);
      }
    });
  }
}
