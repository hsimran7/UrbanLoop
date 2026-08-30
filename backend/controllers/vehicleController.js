const Vehicle = require('../models/Vehicle');
const { getIO } = require('../sockets');

// @desc    Get all vehicles
// @route   GET /api/v1/vehicles
// @access  Private
exports.getVehicles = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }
    const vehicles = await Vehicle.find(filter).populate('driver').populate('currentRoute');
    res.status(200).json({ success: true, count: vehicles.length, data: vehicles });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new vehicle
// @route   POST /api/v1/vehicles
// @access  Private (Admin/Manager)
exports.createVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.create(req.body);
    res.status(201).json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
};

// @desc    Update vehicle location (Simulate IoT/GPS)
// @route   PUT /api/v1/vehicles/:id/location
// @access  Private / IoT Device / Worker App
exports.updateLocation = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    const { coordinates } = req.body;
    if (coordinates && coordinates.length === 2) {
      vehicle.location.coordinates = coordinates;
      await vehicle.save();
      
      const io = getIO();
      io.to(`municipality_${vehicle.municipalityId}`).emit('VEHICLE_MOVED', vehicle);
    }

    res.status(200).json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
};
