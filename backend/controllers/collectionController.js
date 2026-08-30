const Collection = require('../models/Collection');
const SmartBin = require('../models/SmartBin');
const { getIO } = require('../sockets');

// @desc    Get all collections
// @route   GET /api/v1/collections
// @access  Private
exports.getCollections = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }
    
    // Workers see their assigned collections
    if (req.user.role === 'worker') {
      filter.workerId = req.user._id;
    }

    const collections = await Collection.find(filter)
      .populate('routeId')
      .populate('vehicleId')
      .populate('workerId', 'name')
      .populate('binsCollected.binId');
      
    res.status(200).json({ success: true, count: collections.length, data: collections });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new collection (Schedule it)
// @route   POST /api/v1/collections
// @access  Private (Admin/Manager)
exports.createCollection = async (req, res, next) => {
  try {
    const collection = await Collection.create(req.body);
    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    next(error);
  }
};

// @desc    Advance Collection Lifecycle Status
// @route   PUT /api/v1/collections/:id/status
// @access  Private (Worker/Admin)
exports.updateCollectionStatus = async (req, res, next) => {
  try {
    const collection = await Collection.findById(req.params.id);
    if (!collection) {
      return res.status(404).json({ success: false, error: 'Collection not found' });
    }

    // Workers can only update their own
    if (req.user.role === 'worker' && collection.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { status, binId, weight, photos } = req.body;
    
    if (status) {
      collection.status = status;
      if (status === 'vehicle_started') collection.startedAt = Date.now();
      if (status === 'closed') collection.completedAt = Date.now();
    }

    if (binId) {
      // Worker scanned a bin
      const bin = await SmartBin.findById(binId);
      if (bin) {
        collection.binsCollected.push({
          binId,
          scannedAt: Date.now(),
          fillLevelBefore: bin.currentFillLevel,
          weightCollected: weight || 0
        });
        collection.totalWeight += (weight || 0);
        
        // Reset bin fill level
        bin.currentFillLevel = 0;
        bin.isOverflowing = false;
        bin.lastCollectionTime = Date.now();
        await bin.save();
      }
    }

    if (photos && photos.length > 0) {
      collection.photos.push(...photos);
    }

    await collection.save();

    // Emit live update
    const io = getIO();
    io.to(`municipality_${collection.municipalityId}`).emit('COLLECTION_UPDATED', collection);

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    next(error);
  }
};
