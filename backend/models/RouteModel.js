const mongoose = require('mongoose');

// Route
const routeSchema = new mongoose.Schema({
  routeCode: { type: String, required: true, unique: true },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  expectedDistance: { type: Number, required: true },
  estimatedDuration: { type: Number, required: true },
  status: { type: String, default: 'PLANNED' },
}, { timestamps: true });

// RouteStop
const routeStopSchema = new mongoose.Schema({
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  stopOrder: { type: Number, required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  collectionPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionPoint', default: null },
  expectedArrival: { type: Date, default: null },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  status: { type: String, default: 'PENDING' },
  delayMinutes: { type: Number, default: 0 },
  delayStatus: { type: String, default: 'ON_TIME' },
});
routeStopSchema.index({ routeId: 1, stopOrder: 1 });

// DailyRouteAssignment
const dailyRouteAssignmentSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverProfile', default: null },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', default: null },
  status: { type: String, default: 'PLANNED' },
  dispatchedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

// GPSTelemetry
const gpsTelemetrySchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],
  },
  speed: { type: Number, required: true },
  heading: { type: Number, required: true },
  altitude: { type: Number, default: null },
  accuracy: { type: Number, default: null },
  ignitionStatus: { type: Boolean, default: false },
  gpsSource: { type: String, default: 'SIMULATOR' },
  odometerSnapshot: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});
gpsTelemetrySchema.index({ vehicleId: 1, timestamp: -1 });
gpsTelemetrySchema.index({ location: '2dsphere' });

module.exports = {
  Route: mongoose.model('Route', routeSchema),
  RouteStop: mongoose.model('RouteStop', routeStopSchema),
  DailyRouteAssignment: mongoose.model('DailyRouteAssignment', dailyRouteAssignmentSchema),
  GPSTelemetry: mongoose.model('GPSTelemetry', gpsTelemetrySchema),
};
