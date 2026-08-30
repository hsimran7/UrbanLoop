import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { fleetEventEmitter } from './fleet.event-emitter';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'fleet',
})
@Injectable()
export class FleetGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(FleetGateway.name);

  afterInit(server: Server) {
    this.logger.log('Fleet WebSocket Gateway initialized.');
    
    // Connect EventEmitter listeners to Gateway broadcasts
    fleetEventEmitter.on('vehicle.event', (eventData) => {
      this.server.emit('vehicleEvent', eventData);
    });

    fleetEventEmitter.on('fleet.notification', (notificationData) => {
      this.server.emit('fleetNotification', notificationData);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to fleet updates: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastVehicleLocation(vehicleData: any) {
    if (this.server) {
      this.server.emit('vehicleLocationUpdated', vehicleData);
    }
  }
}
