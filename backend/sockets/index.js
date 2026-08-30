const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const realtimeEventEmitter = require('./eventEmitter');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  const realtimeNs = io.of('/realtime');

  realtimeNs.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    try {
      const cookies = socket.handshake.headers.cookie;
      let token = null;

      if (cookies) {
        const match = cookies.match(/(?:^|;\s*)accessToken=([^;]+)/);
        if (match) token = match[1];
      }
      if (!token && socket.handshake.headers.authorization?.startsWith('Bearer ')) {
        token = socket.handshake.headers.authorization.substring(7);
      }

      if (token) {
        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        if (payload && payload.sub) {
          socket.join(`user:${payload.sub}`);
          socket.join(`citizen:${payload.sub}`);
          socket.join(`worker:${payload.sub}`);
          console.log(`[SOCKET] User authenticated: ${payload.sub} (role: ${payload.role}) → joined rooms: user:${payload.sub}, worker:${payload.sub}`);
          
          if (['SYSTEM_ADMIN', 'SUPERVISOR', 'GOVERNMENT_OFFICIAL', 'FACILITY_MANAGER'].includes(payload.role)) {
            socket.join('admins');
            socket.join('municipality:default:admins');
            console.log(`[SOCKET] Admin ${payload.sub} joined admins room.`);
          }
        }
      } else {
        console.warn(`[SOCKET] Client ${socket.id} connected WITHOUT a valid auth token — NOT joining any user room`);
      }
    } catch (err) {
      // quiet catch
    }

    socket.on('join_room', (roomName) => {
      if (roomName) socket.join(roomName);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // ── REAL-TIME EVENT EMISSIONS ──────────────────────────────────────────────

  // 1. New Citizen Registration (Admin notification)
  realtimeEventEmitter.on('NEW_CITIZEN_REGISTRATION', (data) => {
    console.log('[Socket.IO Event] NEW_CITIZEN_REGISTRATION:', data.email);
    realtimeNs.to('admins').emit('NEW_CITIZEN_REGISTRATION', data);
    realtimeNs.emit('NEW_CITIZEN_REGISTRATION', data);
  });

  // 2. Citizen Verified / Rejected
  realtimeEventEmitter.on('CITIZEN_VERIFIED', (data) => {
    console.log('[Socket.IO Event] CITIZEN_VERIFIED:', data.userId);
    if (data.userId) {
      realtimeNs.to(`citizen:${data.userId}`).emit('CITIZEN_VERIFIED', data);
      realtimeNs.to(`user:${data.userId}`).emit('CITIZEN_VERIFIED', data);
    }
    realtimeNs.to('admins').emit('CITIZEN_VERIFIED', data);
    realtimeNs.emit('CITIZEN_VERIFIED', data);
    realtimeNs.emit('citizenVerified', data);
  });

  realtimeEventEmitter.on('CITIZEN_REJECTED', (data) => {
    console.log('[Socket.IO Event] CITIZEN_REJECTED:', data.userId);
    if (data.userId) {
      realtimeNs.to(`citizen:${data.userId}`).emit('CITIZEN_REJECTED', data);
      realtimeNs.to(`user:${data.userId}`).emit('CITIZEN_REJECTED', data);
    }
    realtimeNs.to('admins').emit('CITIZEN_REJECTED', data);
    realtimeNs.emit('CITIZEN_REJECTED', data);
  });

  // 3. Citizen Request / Query Workflow
  realtimeEventEmitter.on('NEW_CITIZEN_REQUEST', (data) => {
    console.log('[Socket.IO Event] NEW_CITIZEN_REQUEST:', data.requestCode);
    realtimeNs.to('admins').emit('NEW_CITIZEN_REQUEST', data);
    realtimeNs.emit('NEW_CITIZEN_REQUEST', data);
    realtimeNs.emit('complaintSubmitted', data);
  });

  realtimeEventEmitter.on('SERVICE_REQUEST_UPDATED', (data) => {
    console.log('[Socket.IO Event] SERVICE_REQUEST_UPDATED:', data.id, data.status);
    if (data.citizenId) {
      realtimeNs.to(`citizen:${data.citizenId}`).emit('SERVICE_REQUEST_UPDATED', data);
      realtimeNs.to(`user:${data.citizenId}`).emit('SERVICE_REQUEST_UPDATED', data);
      realtimeNs.to(`citizen:${data.citizenId}`).emit('complaintUpdated', data);
    }
    realtimeNs.to('admins').emit('SERVICE_REQUEST_UPDATED', data);
    realtimeNs.emit('SERVICE_REQUEST_UPDATED', data);
    realtimeNs.emit('complaintUpdated', data);
  });

  // 4. Bin Status / Telemetry Updates
  realtimeEventEmitter.on('BIN_UPDATED', (data) => {
    realtimeNs.emit('BIN_UPDATED', data);
    realtimeNs.emit('BIN_STATUS_UPDATED', data);
    realtimeNs.emit('BIN_TELEMETRY_UPDATED', data);
  });

  realtimeEventEmitter.on('binOverflow', (data) => {
    realtimeNs.emit('binOverflow', data);
    realtimeNs.emit('BIN_UPDATED', data);
    realtimeNs.emit('BIN_STATUS_UPDATED', data);
  });

  // 5. Worker Task Assignments - emit only to the specific worker's room
  realtimeEventEmitter.on('TASK_ASSIGNED', (data) => {
    if (data.workerIds && data.task) {
      data.workerIds.forEach((id) => {
        console.log(`[SOCKET] TASK_ASSIGNED → room: worker:${id}, assignmentId: ${data.task.id}`);
        // Emit task data to worker room
        realtimeNs.to(`worker:${id}`).emit('TASK_ASSIGNED', data.task);
        realtimeNs.to(`user:${id}`).emit('TASK_ASSIGNED', data.task);
        // Emit a separate notification event
        realtimeNs.to(`worker:${id}`).emit('NOTIFICATION', {
          type: 'TASK_ASSIGNED',
          title: 'New Work Assigned',
          body: data.task.notificationBody || `You have been assigned a new collection task for ${data.task.areaName || data.task.zoneName || 'your area'}.`,
          assignmentId: data.task.id,
          areaName: data.task.areaName,
          wardName: data.task.wardName,
          shiftName: data.task.shiftName,
          assignmentDate: data.task.assignmentDate,
          timestamp: new Date().toISOString(),
        });
        realtimeNs.to(`user:${id}`).emit('NOTIFICATION', {
          type: 'TASK_ASSIGNED',
          title: 'New Work Assigned',
          body: data.task.notificationBody || `You have been assigned a new collection task.`,
          assignmentId: data.task.id,
          timestamp: new Date().toISOString(),
        });
      });
    }
  });

  // 5b. Direct notification event - for ad-hoc notifications to a specific user
  realtimeEventEmitter.on('notification', (data) => {
    if (data.userId) {
      realtimeNs.to(`worker:${data.userId}`).emit('NOTIFICATION', data);
      realtimeNs.to(`user:${data.userId}`).emit('NOTIFICATION', data);
      realtimeNs.to(`citizen:${data.userId}`).emit('NOTIFICATION', data);
    }
  });

  // Other standard events
  realtimeEventEmitter.on('TASK_STATUS_UPDATED', (d) => {
    realtimeNs.emit('TASK_STATUS_UPDATED', d);
    realtimeNs.to('admins').emit('TASK_STATUS_UPDATED', d);
  });
  realtimeEventEmitter.on('assignmentCreated', (d) => realtimeNs.emit('assignmentCreated', d));
  realtimeEventEmitter.on('assignmentUpdated', (d) => realtimeNs.emit('assignmentUpdated', d));
  realtimeEventEmitter.on('assignmentCompleted', (d) => realtimeNs.emit('assignmentCompleted', d));
  realtimeEventEmitter.on('accountDeactivated', (d) => {
    realtimeNs.emit('accountDeactivated', d);
    if (d.userId) {
      realtimeNs.to(`worker:${d.userId}`).emit('accountDeactivated', d);
      realtimeNs.to(`user:${d.userId}`).emit('accountDeactivated', d);
    }
  });

  console.log('[Socket.IO] /realtime namespace initialized.');
  return realtimeNs;
}

function broadcast(event, payload) {
  if (io) io.of('/realtime').emit(event, payload);
}

module.exports = { init, broadcast };
