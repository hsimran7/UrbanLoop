const SmartBin = require('../models/SmartBin');
const { getIO } = require('../sockets');

// @desc    Get all bins
// @route   GET /api/v1/bins
// @access  Private
exports.getBins = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }
    const bins = await SmartBin.find(filter).populate('assignedVehicle');
    res.status(200).json({ success: true, count: bins.length, data: bins });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new smart bin
// @route   POST /api/v1/bins
// @access  Private (Admin/Manager)
exports.createBin = async (req, res, next) => {
  try {
    // Generate simple QR Code string for demo (in production use real qrService)
    if (!req.body.qrCode) {
      req.body.qrCode = `BIN-${Date.now()}`;
    }
    const bin = await SmartBin.create(req.body);
    res.status(201).json({ success: true, data: bin });
  } catch (error) {
    next(error);
  }
};

// @desc    Update smart bin (Simulate IoT Telemetry)
// @route   PUT /api/v1/bins/:id/telemetry
// @access  Private / IoT Device
exports.updateTelemetry = async (req, res, next) => {
  try {
    const bin = await SmartBin.findById(req.params.id);
    if (!bin) {
      return res.status(404).json({ success: false, error: 'Bin not found' });
    }

    const { currentFillLevel, fireAlert, tamperDetected } = req.body;
    let needsSave = false;

    if (currentFillLevel !== undefined) {
      bin.currentFillLevel = currentFillLevel;
      bin.isOverflowing = currentFillLevel >= 90;
      needsSave = true;
    }

    if (fireAlert !== undefined) {
      bin.fireAlert = fireAlert;
      needsSave = true;
    }

    if (tamperDetected !== undefined) {
      bin.tamperDetected = tamperDetected;
      needsSave = true;
    }

    if (needsSave) {
      await bin.save();
      // Emit socket event for real-time dashboard
      const io = getIO();
      io.to(`municipality_${bin.municipalityId}`).emit('BIN_UPDATED', bin);
      
      if (bin.fireAlert) {
        io.to(`municipality_${bin.municipalityId}`).emit('FIRE_ALERT', { binId: bin._id, location: bin.location });
      }
    }

    res.status(200).json({ success: true, data: bin });
  } catch (error) {
    next(error);
  }
};
