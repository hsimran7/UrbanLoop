import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { realtimeEventEmitter } from './realtime.event-emitter';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'realtime',
})
@Injectable()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('Realtime WebSocket Gateway initialized.');

    // ── Real-Time Task Assignment ────────────────────────────────────────────
    realtimeEventEmitter.on('TASK_ASSIGNED', (data) => {
      if (data.workerIds && data.task) {
        data.workerIds.forEach((id: string) => {
          this.server.to(`worker:${id}`).emit('TASK_ASSIGNED', data.task);
        });
      }
    });

    // ── Assignment Lifecycle Events ──────────────────────────────────────────

    realtimeEventEmitter.on('assignmentCreated', (data) => {
      this.server.emit('assignmentCreated', data);
    });

    realtimeEventEmitter.on('assignmentUpdated', (data) => {
      this.server.emit('assignmentUpdated', data);
    });

    realtimeEventEmitter.on('assignmentAccepted', (data) => {
      this.server.emit('assignmentAccepted', data);
      this.server.emit('assignmentUpdated', data); // ensure all subscribers update
    });

    realtimeEventEmitter.on('assignmentRejected', (data) => {
      this.server.emit('assignmentRejected', data);
      this.server.emit('assignmentUpdated', data);
    });

    realtimeEventEmitter.on('assignmentStarted', (data) => {
      this.server.emit('assignmentStarted', data);
      this.server.emit('assignmentUpdated', data);
    });

    realtimeEventEmitter.on('assignmentCompleted', (data) => {
      this.server.emit('assignmentCompleted', data);
      this.server.emit('assignmentUpdated', data);
    });

    // ── Target-level Events (for supervisor live view) ───────────────────────

    realtimeEventEmitter.on('targetCollected', (data) => {
      this.server.emit('targetCollected', data);
      this.server.emit('assignmentUpdated', { assignmentId: data.assignmentId });
    });

    realtimeEventEmitter.on('targetMissed', (data) => {
      this.server.emit('targetMissed', data);
      this.server.emit('assignmentUpdated', { assignmentId: data.assignmentId });
    });

    realtimeEventEmitter.on('targetSkipped', (data) => {
      this.server.emit('targetSkipped', data);
      this.server.emit('assignmentUpdated', { assignmentId: data.assignmentId });
    });

    // ── Worker Events ────────────────────────────────────────────────────────

    realtimeEventEmitter.on('workerShiftStarted', (data) => {
      // Notifies Admin, Fleet, Government dashboards
      this.server.emit('workerShiftStarted', data);
    });

    // ── Area / Collection Completion (citizen alias) ─────────────────────────

    realtimeEventEmitter.on('areaCompleted', (data) => {
      // Notifies Citizen (collection done), Government (KPIs), Admin (progress)
      this.server.emit('areaCompleted', data);
      this.server.emit('collectionCompleted', data); // citizen alias
    });

    // ── Notification Events ──────────────────────────────────────────────────

    realtimeEventEmitter.on('notificationCreated', (data) => {
      this.server.emit('notificationCreated', data);
    });

    realtimeEventEmitter.on('notification', (data) => {
      // Per-user notification push — broadcast globally (clients filter by userId)
      this.server.emit('notification', data);
      this.server.emit('notificationCreated', data);
    });

    // ── Task / Bin Events ────────────────────────────────────────────────────

    realtimeEventEmitter.on('taskCompleted', (data) => {
      this.server.emit('taskCompleted', data);
    });

    realtimeEventEmitter.on('binOverflow', (data) => {
      this.server.emit('binOverflow', data);
    });

    // ── Complaint / Property Events ──────────────────────────────────────────

    realtimeEventEmitter.on('complaintSubmitted', (data) => {
      this.server.emit('complaintSubmitted', data);
    });

    realtimeEventEmitter.on('propertyApproved', (data) => {
      this.server.emit('propertyApproved', data);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to realtime hub: ${client.id}`);
    
    try {
      const cookies = client.handshake.headers.cookie;
      let token = null;
      if (cookies) {
        const match = cookies.match(/(?:^|;\s*)accessToken=([^;]+)/);
        if (match) token = match[1];
      }
      if (!token && client.handshake.headers.authorization?.startsWith('Bearer ')) {
        token = client.handshake.headers.authorization.substring(7);
      }
      if (token) {
        const payload = this.jwtService.verify(token);
        if (payload && payload.sub) {
          const roomName = `worker:${payload.sub}`;
          client.join(roomName);
          this.logger.log(`Client ${client.id} joined room ${roomName}`);
        }
      }
    } catch (err) {
      // Ignored: client stays in default room
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from realtime hub: ${client.id}`);
  }

  /** Convenience helper for other services to broadcast directly */
  broadcast(event: string, payload: any) {
    if (this.server) {
      this.server.emit(event, payload);
    }
  }
}
