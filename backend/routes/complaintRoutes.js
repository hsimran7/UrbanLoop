const express = require('express');
const { getComplaints, createComplaint, updateComplaint } = require('../controllers/complaintController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const auditLog = require('../middleware/auditMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');
const upload = require('../config/upload');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(getComplaints)
  .post(authorize('citizen', 'super_admin'), upload.single('photo'), auditLog('CREATE_COMPLAINT', 'Complaint'), createComplaint);

router.route('/:id')
  .put(authorize('super_admin', 'municipal_admin', 'ward_manager', 'worker'), auditLog('UPDATE_COMPLAINT', 'Complaint'), updateComplaint);

module.exports = router;
