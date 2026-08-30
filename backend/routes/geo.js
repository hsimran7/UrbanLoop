const express = require('express');
const router = express.Router();
const { State, District, City, Ward, Area, Street } = require('../models/Geo');
const ServiceZone = require('../models/ServiceZone');
const CollectionPoint = require('../models/CollectionPoint');
const { protect, requireRoles } = require('../middleware/auth');
const { log } = require('../utils/audit');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR'];

// ── States ─────────────────────────────────────────────────────────────────
router.get('/states', protect, async (req, res, next) => {
  try {
    const states = await State.find().sort({ name: 1 }).lean();
    res.json(states.map(s => ({ ...s, id: s._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/states', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required.' });
    const existing = await State.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: `State "${name}" already exists.` });
    const state = await State.create({ name: name.trim() });
    await log(req.user.id, 'CREATE_STATE', req.ip, req.headers['user-agent'], { stateId: state._id, name: state.name });
    res.status(201).json({ ...state.toObject(), id: state._id.toString() });
  } catch (err) { next(err); }
});

router.get('/states/:stateId/districts', protect, async (req, res, next) => {
  try {
    const districts = await District.find({ stateId: req.params.stateId }).sort({ name: 1 }).lean();
    res.json(districts.map(d => ({ ...d, id: d._id.toString() })));
  } catch (err) { next(err); }
});

// ── Districts ───────────────────────────────────────────────────────────────
router.get('/districts', protect, async (req, res, next) => {
  try {
    const { stateId } = req.query;
    const filter = stateId ? { stateId } : {};
    const districts = await District.find(filter).sort({ name: 1 }).lean();
    res.json(districts.map(d => ({ ...d, id: d._id.toString() })));
  } catch (err) { next(err); }
});

router.get('/districts/:districtId/cities', protect, async (req, res, next) => {
  try {
    const cities = await City.find({ districtId: req.params.districtId }).sort({ name: 1 }).lean();
    res.json(cities.map(c => ({ ...c, id: c._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/districts', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, stateId } = req.body;
    if (!name || !stateId) return res.status(400).json({ message: 'name and stateId required.' });
    const district = await District.create({ name: name.trim(), stateId });
    await log(req.user.id, 'CREATE_DISTRICT', req.ip, req.headers['user-agent'], { id: district._id, name, stateId });
    res.status(201).json({ ...district.toObject(), id: district._id.toString() });
  } catch (err) { next(err); }
});

// ── Cities ───────────────────────────────────────────────────────────────────
router.get('/cities', protect, async (req, res, next) => {
  try {
    const { districtId } = req.query;
    const filter = districtId ? { districtId } : {};
    const cities = await City.find(filter).sort({ name: 1 }).lean();
    res.json(cities.map(c => ({ ...c, id: c._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/cities', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, districtId, timezone } = req.body;
    if (!name || !districtId) return res.status(400).json({ message: 'name and districtId required.' });
    const existing = await City.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: `City "${name}" already exists.` });
    const city = await City.create({ name: name.trim(), districtId, timezone: timezone || 'Asia/Kolkata' });
    await log(req.user.id, 'CREATE_CITY', req.ip, req.headers['user-agent'], { id: city._id, name, districtId });
    res.status(201).json({ ...city.toObject(), id: city._id.toString() });
  } catch (err) { next(err); }
});

router.get('/cities/:cityId/wards', protect, async (req, res, next) => {
  try {
    const wards = await Ward.find({ cityId: req.params.cityId }).sort({ number: 1 }).lean();
    res.json(wards.map(w => ({ ...w, id: w._id.toString() })));
  } catch (err) { next(err); }
});

// ── Wards ───────────────────────────────────────────────────────────────────
router.get('/wards', protect, async (req, res, next) => {
  try {
    const { cityId } = req.query;
    const filter = cityId ? { cityId } : {};
    const wards = await Ward.find(filter).sort({ number: 1 }).lean();
    res.json(wards.map(w => ({ ...w, id: w._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/wards', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { cityId, number, name } = req.body;
    if (!cityId || !number || !name) return res.status(400).json({ message: 'cityId, number, and name are required.' });
    const existing = await Ward.findOne({ cityId, number: parseInt(number) });
    if (existing) return res.status(409).json({ message: `Ward number ${number} already exists in this city.` });
    const ward = await Ward.create({ cityId, number: parseInt(number), name: name.trim() });
    await log(req.user.id, 'CREATE_WARD', req.ip, req.headers['user-agent'], { id: ward._id, name, cityId });
    res.status(201).json({ ...ward.toObject(), id: ward._id.toString() });
  } catch (err) { next(err); }
});

router.get('/wards/:wardId/areas', protect, async (req, res, next) => {
  try {
    const areas = await Area.find({ wardId: req.params.wardId })
      .populate({ path: 'wardId', populate: { path: 'cityId', populate: 'districtId' } })
      .sort({ name: 1 })
      .lean();
    res.json(areas.map(a => ({ ...a, id: a._id.toString() })));
  } catch (err) { next(err); }
});

// ── Areas ───────────────────────────────────────────────────────────────────
router.get('/areas', protect, async (req, res, next) => {
  try {
    const { wardId } = req.query;
    const filter = wardId ? { wardId } : {};
    const areas = await Area.find(filter)
      .populate({ path: 'wardId', populate: { path: 'cityId', populate: 'districtId' } })
      .sort({ name: 1 })
      .lean();
    res.json(areas.map(a => ({ ...a, id: a._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/areas', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { wardId, name } = req.body;
    if (!wardId || !name) return res.status(400).json({ message: 'wardId and name are required.' });
    const area = await Area.create({ wardId, name: name.trim() });
    await log(req.user.id, 'CREATE_AREA', req.ip, req.headers['user-agent'], { id: area._id, name, wardId });
    res.status(201).json({ ...area.toObject(), id: area._id.toString() });
  } catch (err) { next(err); }
});

// ── Service Zones ─────────────────────────────────────────────────────────────
router.get('/service-zones', protect, async (req, res, next) => {
  try {
    const { areaId } = req.query;
    const filter = areaId ? { areaId } : {};
    const zones = await ServiceZone.find(filter).populate('areaId').sort({ name: 1 }).lean();
    res.json(zones.map(z => ({ ...z, id: z._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/service-zones', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { areaId, name, code } = req.body;
    if (!areaId || !name || !code) return res.status(400).json({ message: 'areaId, name, and code required.' });
    const existing = await ServiceZone.findOne({ code });
    if (existing) return res.status(409).json({ message: `Zone code "${code}" already exists.` });
    const zone = await ServiceZone.create({ areaId, name: name.trim(), code });
    await log(req.user.id, 'CREATE_SERVICE_ZONE', req.ip, req.headers['user-agent'], { id: zone._id, name, areaId });
    res.status(201).json({ ...zone.toObject(), id: zone._id.toString() });
  } catch (err) { next(err); }
});

// ── Streets ─────────────────────────────────────────────────────────────────
router.get('/streets', protect, async (req, res, next) => {
  try {
    const { serviceZoneId } = req.query;
    const filter = serviceZoneId ? { serviceZoneId } : {};
    const streets = await Street.find(filter).sort({ name: 1 }).lean();
    res.json(streets.map(s => ({ ...s, id: s._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/streets', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { serviceZoneId, name } = req.body;
    if (!serviceZoneId || !name) return res.status(400).json({ message: 'serviceZoneId and name required.' });
    const existing = await Street.findOne({ serviceZoneId, name: name.trim() });
    if (existing) return res.status(409).json({ message: `Street "${name}" already exists in this zone.` });
    const street = await Street.create({ serviceZoneId, name: name.trim() });
    res.status(201).json({ ...street.toObject(), id: street._id.toString() });
  } catch (err) { next(err); }
});

// ── Collection Points ─────────────────────────────────────────────────────────
router.get('/collection-points', protect, async (req, res, next) => {
  try {
    const { areaId, propertyId } = req.query;
    const filter = {};
    if (areaId) filter.areaId = areaId;
    if (propertyId) filter.propertyId = propertyId;
    const points = await CollectionPoint.find(filter)
      .populate('propertyId areaId serviceZoneId streetId')
      .lean();
    res.json(points.map(p => ({ ...p, id: p._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/collection-points', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, latitude, longitude, propertyId, areaId, serviceZoneId, streetId } = req.body;
    if (!name || !latitude || !longitude || !areaId) {
      return res.status(400).json({ message: 'name, latitude, longitude, and areaId are required.' });
    }
    const cp = await CollectionPoint.create({
      name, latitude, longitude,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      propertyId: propertyId || null,
      areaId,
      serviceZoneId: serviceZoneId || null,
      streetId: streetId || null,
    });
    await log(req.user.id, 'CREATE_COLLECTION_POINT', req.ip, req.headers['user-agent'], { id: cp._id, name, areaId });
    res.status(201).json({ ...cp.toObject(), id: cp._id.toString() });
  } catch (err) { next(err); }
});

module.exports = router;
