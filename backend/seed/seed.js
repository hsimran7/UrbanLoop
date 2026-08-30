require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { State, District, City, Ward, Area } = require('../models/Geo');
const Property = require('../models/Property');
const CollectionPoint = require('../models/CollectionPoint');
const Bin = require('../models/Bin');
const { BinAlert, BinTelemetry } = require('../models/BinTelemetry');
const { WorkerProfile, TeamMembership, CollectionTeam } = require('../models/Workforce');
const { DailyAssignment, DailyAssignmentTarget } = require('../models/Assignment');
const { Vehicle } = require('../models/Fleet');
const { Shift } = require('../models/Shift');
const { hashPassword } = require('../utils/crypto');
const crypto = require('crypto');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('ERROR: MONGODB_URI is not set in backend/.env');
      console.error('Please configure your own MongoDB connection string first.');
      process.exit(1);
    }
    await mongoose.connect(uri);
    let dbName = 'unknown';
    try { dbName = new URL(uri).pathname.replace('/', ''); } catch (_) {}
    console.log(`MongoDB Connected for Seeding — Database: ${dbName}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const importData = async () => {
  try {
    // Clear collections
    await User.deleteMany();
    await State.deleteMany();
    await District.deleteMany();
    await City.deleteMany();
    await Ward.deleteMany();
    await Area.deleteMany();
    await Property.deleteMany();
    await CollectionPoint.deleteMany();
    await Bin.deleteMany();
    await BinAlert.deleteMany();
    await BinTelemetry.deleteMany();
    await WorkerProfile.deleteMany();
    await TeamMembership.deleteMany();
    await CollectionTeam.deleteMany();
    await DailyAssignment.deleteMany();
    await DailyAssignmentTarget.deleteMany();
    await Vehicle.deleteMany();
    await Shift.deleteMany();

    // 1. Create Geo (Punjab + All 23 Districts)
    const state = await State.create({ name: 'Punjab' });

    const punjabDistricts = [
      'Amritsar', 'Barnala', 'Bathinda', 'Faridkot', 'Fatehgarh Sahib',
      'Fazilka', 'Ferozepur', 'Gurdaspur', 'Hoshiarpur', 'Jalandhar',
      'Kapurthala', 'Ludhiana', 'Malerkotla', 'Mansa', 'Moga',
      'Pathankot', 'Patiala', 'Rupnagar', 'Sahibzada Ajit Singh Nagar (Mohali)',
      'Sangrur', 'Shaheed Bhagat Singh Nagar (Nawanshahr)', 'Sri Muktsar Sahib', 'Tarn Taran'
    ];

    const districtDocs = await Promise.all(
      punjabDistricts.map(name => District.create({ name, stateId: state._id }))
    );

    const ludhianaDistrict = districtDocs.find(d => d.name === 'Ludhiana') || districtDocs[0];
    const city = await City.create({ name: 'Ludhiana', timezone: 'Asia/Kolkata', districtId: ludhianaDistrict._id });
    const ward = await Ward.create({ name: 'Ward 54', number: 54, cityId: city._id });
    const area = await Area.create({ name: 'Sarabha Nagar', wardId: ward._id });

    // 2. Create Users
    const defaultPasswordHash = await hashPassword('password123');

    const admin = await User.create({
      email: 'admin@urbanloop.gov',
      passwordHash: defaultPasswordHash,
      role: 'SYSTEM_ADMIN',
      name: 'System Admin',
      phone: '+919999999999',
      status: 'ACTIVE'
    });

    const workerUser = await User.create({
      email: 'worker@urbanloop.gov',
      passwordHash: defaultPasswordHash,
      role: 'WORKER',
      name: 'Harbhajan Singh',
      phone: '+919876543210',
      status: 'ACTIVE'
    });

    const workerProfile = await WorkerProfile.create({
      userId: workerUser._id,
      employeeCode: 'EMP-001',
      employmentStatus: 'ACTIVE',
      joinedAt: new Date()
    });

    const shiftMorning = await Shift.create({
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
      cutoffMinutes: 60,
      status: 'ACTIVE'
    });
    const shiftEvening = await Shift.create({
      name: 'Evening',
      startTime: '14:00',
      endTime: '22:00',
      cutoffMinutes: 60,
      status: 'ACTIVE'
    });
    const shiftNight = await Shift.create({
      name: 'Night',
      startTime: '22:00',
      endTime: '06:00',
      cutoffMinutes: 60,
      status: 'ACTIVE'
    });
    const shift = shiftMorning;

    // 3. Create Properties & Bins
    const prop1 = await Property.create({
      address: 'House 123, Block A, Sarabha Nagar',
      latitude: 30.8920,
      longitude: 75.8010,
      location: { type: 'Point', coordinates: [75.8010, 30.8920] },
      areaId: area._id,
      ownerId: admin._id,
      status: 'VERIFIED'
    });

    const cp1 = await CollectionPoint.create({
      name: 'CP H123',
      latitude: 30.8920,
      longitude: 75.8010,
      location: { type: 'Point', coordinates: [75.8010, 30.8920] },
      propertyId: prop1._id,
      areaId: area._id,
      status: 'ACTIVE'
    });

    const binWet = await Bin.create({
      qrCodeId: `UL-BIN-WET-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      type: 'WET',
      collectionPointId: cp1._id,
      currentFillLevel: 95, // OVERFLOWING!
      status: 'OVERFLOWING',
      telemetryStatus: 'ONLINE'
    });
    
    // Add Telemetry and Alert for wet bin
    await BinTelemetry.create({
      binId: binWet._id,
      fillLevel: 95,
      batteryLevel: 80,
      temperature: 30,
      signalStrength: -60,
      recordedAt: new Date(),
      source: 'SIMULATOR'
    });

    await BinAlert.create({
      binId: binWet._id,
      type: 'BIN_OVERFLOW_RISK',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      triggeredAt: new Date()
    });

    const binDry = await Bin.create({
      qrCodeId: `UL-BIN-DRY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      type: 'DRY',
      collectionPointId: cp1._id,
      currentFillLevel: 20,
      status: 'EMPTY',
      telemetryStatus: 'ONLINE'
    });

    console.log('Data Imported!');
    process.exit();
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
};

connectDB().then(importData);
