const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Property = require('../models/Property');
const CollectionPoint = require('../models/CollectionPoint');
const Bin = require('../models/Bin');
const { State, District, City, Ward, Area } = require('../models/Geo');
const Notification = require('../models/Notification');
const { protect, requireRoles } = require('../middleware/auth');
const { log } = require('../utils/audit');
const realtimeEventEmitter = require('../sockets/eventEmitter');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR'];

// GET /api/v1/properties
router.get('/', protect, async (req, res, next) => {
  try {
    let query = {};
    if (req.user.role === 'CITIZEN') {
      query.ownerId = req.user.id;
    }

    const properties = await Property.find(query)
      .populate({ path: 'areaId', populate: { path: 'wardId', populate: { path: 'cityId' } } })
      .populate('ownerId', 'email')
      .sort({ createdAt: -1 })
      .lean();

    const propIds = properties.map(p => p._id);
    const cps = await CollectionPoint.find({ propertyId: { $in: propIds } }).lean();
    const cpIds = cps.map(cp => cp._id);
    const bins = await Bin.find({ collectionPointId: { $in: cpIds } }).lean();

    const result = properties.map(p => {
      const pCps = cps.filter(cp => cp.propertyId?.toString() === p._id.toString());
      const pCpsWithBins = pCps.map(cp => ({
        ...cp,
        id: cp._id.toString(),
        bins: bins.filter(b => b.collectionPointId?.toString() === cp._id.toString()).map(b => ({ ...b, id: b._id.toString() })),
      }));
      return { ...p, id: p._id.toString(), collectionPoints: pCpsWithBins };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/properties/:id
router.get('/:id', protect, async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate({ path: 'areaId', populate: { path: 'wardId', populate: { path: 'cityId' } } })
      .populate('ownerId', 'email')
      .lean();
    
    if (!property) return res.status(404).json({ message: 'Property not found.' });

    const cps = await CollectionPoint.find({ propertyId: property._id }).lean();
    const cpIds = cps.map(cp => cp._id);
    const bins = await Bin.find({ collectionPointId: { $in: cpIds } }).lean();

    const pCpsWithBins = cps.map(cp => ({
      ...cp,
      id: cp._id.toString(),
      bins: bins.filter(b => b.collectionPointId?.toString() === cp._id.toString()).map(b => ({ ...b, id: b._id.toString() })),
    }));

    res.json({ ...property, id: property._id.toString(), collectionPoints: pCpsWithBins });
  } catch (err) { next(err); }
});

// POST /api/v1/properties
router.post('/', protect, async (req, res, next) => {
  try {
    const { address, latitude, longitude, areaId, cityName, stateName, areaName, wardNumber, wardName } = req.body;
    let finalAreaId = areaId;

    if (!finalAreaId) {
      if (!cityName || !stateName || !areaName) {
        return res.status(400).json({ message: 'Either areaId or cityName, stateName, and areaName must be provided.' });
      }

      const stateNameClean = stateName.trim();
      const cityNameClean = cityName.trim();
      
      let state = await State.findOne({ name: stateNameClean });
      if (!state) state = await State.create({ name: stateNameClean });

      const districtNameClean = `${cityNameClean} District`;
      let district = await District.findOne({ name: districtNameClean, stateId: state._id });
      if (!district) district = await District.create({ name: districtNameClean, stateId: state._id });

      let city = await City.findOne({ name: cityNameClean });
      if (!city) city = await City.create({ name: cityNameClean, districtId: district._id, timezone: 'Asia/Kolkata' });

      const wNum = wardNumber || 1;
      let ward = await Ward.findOne({ cityId: city._id, number: wNum });
      if (!ward) ward = await Ward.create({ number: wNum, name: wardName ? wardName.trim() : `Ward ${wNum}`, cityId: city._id });

      const areaNameClean = areaName.trim();
      let area = await Area.findOne({ wardId: ward._id, name: areaNameClean });
      if (!area) area = await Area.create({ name: areaNameClean, wardId: ward._id });

      finalAreaId = area._id.toString();
    } else {
      const area = await Area.findById(finalAreaId);
      if (!area) return res.status(404).json({ message: 'Selected area does not exist.' });
    }

    const property = await Property.create({
      address: address.trim(),
      latitude,
      longitude,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      ownerId: req.user.id,
      areaId: finalAreaId,
      status: 'PENDING',
    });

    await log(req.user.id, 'CREATE_PROPERTY', req.ip, req.headers['user-agent'], { propertyId: property._id, address: property.address });

    res.status(201).json({ ...property.toObject(), id: property._id.toString() });
  } catch (err) { next(err); }
});

// POST & PATCH /api/v1/properties/:id/verify
const handlePropertyVerify = async (req, res, next) => {
  try {
    const { status } = req.body; // 'VERIFIED' | 'REJECTED'
    const property = await Property.findById(req.params.id);
    
    if (!property) return res.status(404).json({ message: 'Property not found.' });
    if (property.status !== 'PENDING') return res.status(400).json({ message: 'Property has already been reviewed.' });
    if (status === 'PENDING') return res.status(400).json({ message: 'Invalid status update.' });

    property.status = status;
    await property.save();
    
    await log(req.user.id, 'VERIFY_PROPERTY', req.ip, req.headers['user-agent'], { propertyId: property._id, status });

    if (status === 'VERIFIED') {
      let cp = await CollectionPoint.findOne({ propertyId: property._id });
      if (!cp) {
        cp = await CollectionPoint.create({
          name: `CP for ${property.address}`,
          latitude: property.latitude,
          longitude: property.longitude,
          location: { type: 'Point', coordinates: [property.longitude, property.latitude] },
          propertyId: property._id,
          areaId: property.areaId,
          status: 'ACTIVE',
        });
        await log(req.user.id, 'CREATE_COLLECTION_POINT', req.ip, req.headers['user-agent'], { collectionPointId: cp._id, propertyId: property._id });

        const dryBinId = `UL-BIN-DRY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const wetBinId = `UL-BIN-WET-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        await Bin.create([
          { qrCodeId: dryBinId, type: 'DRY', collectionPointId: cp._id },
          { qrCodeId: wetBinId, type: 'WET', collectionPointId: cp._id }
        ]);
        await log(req.user.id, 'REGISTER_DEFAULT_BINS', req.ip, req.headers['user-agent'], { collectionPointId: cp._id, dryBin: dryBinId, wetBin: wetBinId });
      }
    }

    realtimeEventEmitter.emit('propertyApproved', {
      propertyId: property._id.toString(),
      status,
      timestamp: new Date().toISOString(),
    });

    await Notification.create({
      userId: property.ownerId,
      title: `Property Registration ${status === 'VERIFIED' ? 'Verified' : 'Rejected'}`,
      body: `Your property registration at ${property.address} has been ${status.toLowerCase()}.`,
      type: status === 'VERIFIED' ? 'INFO' : 'ALERT',
    });

    realtimeEventEmitter.emit('notification', {
      userId: property.ownerId.toString(),
      title: `Property Registration ${status === 'VERIFIED' ? 'Verified' : 'Rejected'}`,
      body: `Your property registration at ${property.address} has been ${status.toLowerCase()}.`,
    });

    res.json({ ...property.toObject(), id: property._id.toString() });
  } catch (err) { next(err); }
};

router.post('/:id/verify', protect, requireRoles(...ADMIN_ROLES), handlePropertyVerify);
router.patch('/:id/verify', protect, requireRoles(...ADMIN_ROLES), handlePropertyVerify);

module.exports = router;
