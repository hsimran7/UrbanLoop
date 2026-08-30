const express = require('express');
const { getCollections, createCollection, updateCollectionStatus } = require('../controllers/collectionController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const auditLog = require('../middleware/auditMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(getCollections)
  .post(authorize('super_admin', 'municipal_admin', 'ward_manager'), auditLog('CREATE_COLLECTION', 'Collection'), createCollection);

router.route('/:id/status')
  .put(auditLog('UPDATE_COLLECTION_STATUS', 'Collection'), updateCollectionStatus);

module.exports = router;
