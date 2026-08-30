require('dotenv').config();
const mongoose = require('mongoose');
const Municipality = require('../models/Municipality');
const User = require('../models/User');
const SmartBin = require('../models/SmartBin');
const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const Zone = require('../models/Zone');
const Ward = require('../models/Ward');
const Analytics = require('../models/Analytics');
const IoTDevice = require('../models/IoTDevice');
const Notification = require('../models/Notification');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(uri);
    console.log('MongoDB Connected for Seeding');
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const importData = async () => {
  try {
    await Municipality.deleteMany();
    await User.deleteMany();
    await SmartBin.deleteMany();
    await Vehicle.deleteMany();
    await Route.deleteMany();
    await Zone.deleteMany();
    await Ward.deleteMany();
    await Analytics.deleteMany();
    await IoTDevice.deleteMany();
    await Notification.deleteMany();

    // 1. Create Municipality
    const muni = await Municipality.create({
      name: 'Metro City',
      state: 'Metro State',
      country: 'India',
      contactEmail: 'admin@metrocity.gov.in',
      contactPhone: '1800112233'
    });

    // 2. Create Admin
    const admin = await User.create({
      municipalityId: muni._id,
      name: 'Super Admin',
      email: 'admin@example.com',
      password: 'password123',
      role: 'super_admin'
    });
    
    // Create Citizen
    const citizen = await User.create({
      municipalityId: muni._id,
      name: 'John Citizen',
      email: 'citizen@example.com',
      password: 'password123',
      role: 'citizen'
    });
    
    // Create Worker
    const worker = await User.create({
      municipalityId: muni._id,
      name: 'Mike Worker',
      email: 'worker@example.com',
      password: 'password123',
      role: 'worker'
    });

    // 3. Create Vehicles
    const vehicle1 = await Vehicle.create({
      municipalityId: muni._id,
      registrationNumber: 'MH-01-AB-1234',
      qrCode: 'VEH-MH01AB1234',
      driver: worker._id,
      capacity: 5000,
      fuelCapacity: 100,
      currentFuelLevel: 80,
      location: { type: 'Point', coordinates: [72.8777, 19.0760] }
    });

    // 4. Create Bins
    const bin1 = await SmartBin.create({
      municipalityId: muni._id,
      qrCode: 'BIN-1001',
      rfid: 'RFID-1001',
      location: { type: 'Point', coordinates: [72.8777, 19.0760] },
      ward: 'Ward A',
      capacity: 50,
      currentFillLevel: 95,
      isOverflowing: true,
      batteryStatus: 80,
      sensorStatus: 'online',
      binType: 'wet',
      assignedVehicle: vehicle1._id
    });
    
    const bin2 = await SmartBin.create({
      municipalityId: muni._id,
      qrCode: 'BIN-1002',
      rfid: 'RFID-1002',
      location: { type: 'Point', coordinates: [72.8787, 19.0770] },
      ward: 'Ward A',
      capacity: 50,
      currentFillLevel: 20,
      isOverflowing: false,
      batteryStatus: 90,
      sensorStatus: 'online',
      binType: 'dry',
      assignedVehicle: vehicle1._id
    });

    // 5. Create Routes
    await Route.create({
      municipalityId: muni._id,
      name: 'Downtown Route A',
      assignedVehicle: vehicle1._id,
      assignedWorker: worker._id,
      path: {
        type: 'LineString',
        coordinates: [
          [72.8777, 19.0760],
          [72.8787, 19.0770]
        ]
      },
      bins: [bin1._id, bin2._id],
      estimatedDuration: 120
    });

    // 6. Create Zone and Ward
    const zone = await Zone.create({
      municipalityId: muni._id,
      name: 'North Zone',
      description: 'Northern part of Metro City',
      boundary: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
      }
    });
    
    const ward = await Ward.create({
      municipalityId: muni._id,
      zoneId: zone._id,
      name: 'Ward A',
      wardNumber: 'W-01',
      wardManager: admin._id,
      boundary: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 0.5], [0.5, 0.5], [0.5, 0], [0, 0]]]
      }
    });

    // 7. Create Analytics for past 7 days
    const analyticsData = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      analyticsData.push({
        municipalityId: muni._id,
        date: d,
        metrics: {
          totalCollections: Math.floor(Math.random() * 50) + 20,
          completedCollections: Math.floor(Math.random() * 20) + 10,
          pendingCollections: Math.floor(Math.random() * 10),
          totalComplaints: Math.floor(Math.random() * 20) + 5,
          resolvedComplaints: Math.floor(Math.random() * 15),
          activeVehicles: Math.floor(Math.random() * 10) + 5,
          activeRoutes: Math.floor(Math.random() * 5) + 2,
          wasteCollectedKg: Math.floor(Math.random() * 5000) + 1000
        }
      });
    }
    await Analytics.insertMany(analyticsData);

    // 8. Create IoT Device
    await IoTDevice.create({
      municipalityId: muni._id,
      deviceId: 'IOT-BIN-1001',
      deviceType: 'bin_sensor',
      status: 'active',
      batteryLevel: 85,
      linkedEntityId: bin1._id,
      linkedEntityType: 'SmartBin'
    });

    // 9. Create Notification
    await Notification.create({
      municipalityId: muni._id,
      userId: admin._id,
      title: 'Welcome!',
      message: 'System initialization complete.',
      type: 'system'
    });

    console.log('Data Imported!');
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

connectDB().then(importData);
