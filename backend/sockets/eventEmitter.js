const { EventEmitter } = require('events');

/**
 * Global in-process event emitter — equivalent to the original NestJS realtimeEventEmitter.
 * Services emit events here; the Socket.IO gateway (sockets/index.js) listens and broadcasts.
 */
const realtimeEventEmitter = new EventEmitter();
realtimeEventEmitter.setMaxListeners(100);

module.exports = realtimeEventEmitter;
