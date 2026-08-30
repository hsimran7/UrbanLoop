const mongoose = require('mongoose');

const iotDeviceSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: [true, 'Please add a device ID'],
    unique: true
  },
  deviceType: {
    type: String,
    enum: ['bin_sensor', 'vehicle_tracker', 'rfid_scanner'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'error'],
    default: 'active'
  },
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  lastPing: {
    type: Date
  },
  firmwareVersion: String,
  linkedEntityId: {
    type: mongoose.Schema.ObjectId, // Could be SmartBin or Vehicle ID
    refPath: 'linkedEntityType'
  },
  linkedEntityType: {
    type: String,
    enum: ['SmartBin', 'Vehicle']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('IoTDevice', iotDeviceSchema);
