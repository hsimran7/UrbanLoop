import { EventEmitter } from 'events';

export const realtimeEventEmitter = new EventEmitter();
// Increase listener limit to avoid Node.js memory-leak warnings
realtimeEventEmitter.setMaxListeners(50);
