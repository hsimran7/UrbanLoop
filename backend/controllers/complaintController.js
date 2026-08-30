const Complaint = require('../models/Complaint');
const { getIO } = require('../sockets');

// @desc    Get all complaints
// @route   GET /api/v1/complaints
// @access  Private
exports.getComplaints = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }
    
    // Citizens can only see their own complaints
    if (req.user.role === 'citizen') {
      filter.citizenId = req.user._id;
    }

    const complaints = await Complaint.find(filter).populate('citizenId', 'name email phone').populate('assignedWorker', 'name');
    res.status(200).json({ success: true, count: complaints.length, data: complaints });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new complaint
// @route   POST /api/v1/complaints
// @access  Private (Citizen)
exports.createComplaint = async (req, res, next) => {
  try {
    // Force citizenId to be the logged in user
    req.body.citizenId = req.user._id;

    // Handle photo upload
    if (req.file) {
      // In production with Cloudinary, this would be req.file.path from multer-storage-cloudinary
      // Here we store locally and serve from /uploads/
      req.body.photos = [`/uploads/${req.file.filename}`];
    }
    
    const complaint = await Complaint.create(req.body);
    
    // Notify admins of new complaint
    const io = getIO();
    io.to(`municipality_${complaint.municipalityId}`).emit('NEW_COMPLAINT', complaint);

    res.status(201).json({ success: true, data: complaint });
  } catch (error) {
    next(error);
  }
};

// @desc    Update complaint status
// @route   PUT /api/v1/complaints/:id
// @access  Private (Admin/Manager/Worker)
exports.updateComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, error: 'Complaint not found' });
    }

    // Workers can only update complaints assigned to them
    if (req.user.role === 'worker' && complaint.assignedWorker && complaint.assignedWorker.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this complaint' });
    }

    const updatedComplaint = await Complaint.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    const io = getIO();
    io.to(`municipality_${updatedComplaint.municipalityId}`).emit('COMPLAINT_UPDATED', updatedComplaint);

    res.status(200).json({ success: true, data: updatedComplaint });
  } catch (error) {
    next(error);
  }
};
