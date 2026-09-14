const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const geoRoutes = require('./routes/geo');
const binsRoutes = require('./routes/bins');
const assignmentsRoutes = require('./routes/assignments');
const propertiesRoutes = require('./routes/properties');
const workforceRoutes = require('./routes/workforce');
const fleetRoutes = require('./routes/fleet');
const analyticsRoutes = require('./routes/analytics');
const serviceRequestsRoutes = require('./routes/serviceRequests');
const uploadRoutes = require('./routes/upload');
const usersRoutes = require('./routes/users');
const schedulesRoutes = require('./routes/schedules');
const shiftsRoutes = require('./routes/shifts');
const teamsRoutes = require('./routes/teams');
const aiRoutes = require('./routes/ai');
const loadsRoutes = require('./routes/loads');

const app = express();

// Idempotent startup seeding — ensure complaint categories exist in DB
async function seedServiceRequestCategories() {
  try {
    const { ServiceRequestCategory } = require('./models/ServiceRequest');
    const count = await ServiceRequestCategory.countDocuments();
    if (count === 0) {
      await ServiceRequestCategory.insertMany([
        { code: 'MISSED_COLLECTION', name: 'Missed Waste Collection', description: 'Dry/Wet waste not collected on scheduled day', defaultPriority: 'NORMAL' },
        { code: 'OVERFLOWING_BIN', name: 'Overflowing Bin', description: 'Smart bin fill level exceeding limit', defaultPriority: 'HIGH' },
        { code: 'DAMAGED_BIN', name: 'Damaged Smart Bin', description: 'Broken lid or physical structure damage', defaultPriority: 'NORMAL' },
        { code: 'ILLEGAL_DUMPING', name: 'Illegal Dumping', description: 'Unauthorized waste disposal on street or public space', defaultPriority: 'HIGH' },
        { code: 'FACILITY_ODOR', name: 'Facility Odor', description: 'Bad odor from nearby waste processing center', defaultPriority: 'NORMAL' },
        { code: 'OTHER', name: 'Other Complaints', description: 'General citizen support query', defaultPriority: 'LOW' },
      ]);
      console.log('[Seed] ServiceRequestCategories seeded (6 categories).');
    }
  } catch (err) {
    console.error('[Seed] Failed to seed ServiceRequestCategories:', err.message);
  }
}

// Run seeding after DB connection is ready (mongoose emits 'connected')
const mongoose = require('mongoose');
mongoose.connection.once('open', () => {
  seedServiceRequestCategories();
});

// 1. Middleware
const getAllowedOrigins = () => {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const defaultOrigins = [
    'https://urban-loop-rho.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];

  return Array.from(new Set([...configured, ...defaultOrigins]));
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    const allowedOrigins = getAllowedOrigins();

    if (allowedOrigins.includes(normalizedOrigin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(normalizedOrigin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev')); // Logger

// 2. Routes (matching NestJS /api/v1 prefix)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/geo', geoRoutes);
app.use('/api/v1/bins', binsRoutes);
app.use('/api/v1/assignments', assignmentsRoutes);
app.use('/api/v1/properties', propertiesRoutes);
app.use('/api/v1/workforce', workforceRoutes);
app.use('/api/v1/fleet', fleetRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/service-requests', serviceRequestsRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/schedules', schedulesRoutes);
app.use('/api/v1/schedule-exceptions', schedulesRoutes);
app.use('/api/v1/shifts', shiftsRoutes);
app.use('/api/v1/teams', teamsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/loads', loadsRoutes);

// /api/v1/departments — Department model not yet implemented; return empty array to prevent 404 polling
const { protect: authProtectDept } = require('./middleware/auth');
app.get('/api/v1/departments', authProtectDept, (req, res) => {
  res.json([]);
});

const { protect: authProtect } = require('./middleware/auth');
const CollectionSchedule = require('./models/CollectionSchedule');

app.get('/api/v1/citizen/schedules', authProtect, async (req, res, next) => {
  try {
    const schedules = await CollectionSchedule.find().populate('areaId').lean();
    const todayStr = new Date().toISOString().split('T')[0];
    
    const formatted = [{
      propertyId: 'default-prop',
      address: 'Registered Property',
      areaId: schedules[0]?.areaId?._id?.toString() || 'default-area',
      areaName: schedules[0]?.areaId?.name || 'Local Service Area',
      occurrences: [
        {
          propertyId: 'default-prop',
          propertyName: 'Registered Residence',
          areaId: 'default-area',
          areaName: 'Local Service Area',
          wasteType: 'WET',
          collectionDate: todayStr,
          startTime: '08:00',
          endTime: '12:00',
          source: 'REGULAR'
        },
        {
          propertyId: 'default-prop',
          propertyName: 'Registered Residence',
          areaId: 'default-area',
          areaName: 'Local Service Area',
          wasteType: 'DRY',
          collectionDate: todayStr,
          startTime: '14:00',
          endTime: '17:00',
          source: 'REGULAR'
        }
      ]
    }];
    res.json(formatted);
  } catch (err) { next(err); }
});

app.get('/api/v1/zones', authProtect, async (req, res, next) => {
  try {
    const ServiceZone = require('./models/ServiceZone');
    const zones = await ServiceZone.find().lean();
    res.json(zones.map(z => ({ ...z, id: z._id.toString() })));
  } catch (err) { next(err); }
});

// 3. Global Error Handler (matching NestJS generic response)
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ statusCode: 400, message: err.message, error: 'Bad Request' });
  }
  
  if (err.code === 11000) {
    return res.status(409).json({ statusCode: 409, message: 'Duplicate entry detected.', error: 'Conflict' });
  }

  res.status(err.status || 500).json({
    statusCode: err.status || 500,
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;
