const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

let uploadMiddleware;

// Lazy-load cloudinary to avoid crash if env vars not yet set
const getUpload = () => {
  if (!uploadMiddleware) {
    const { upload } = require('../config/cloudinary');
    uploadMiddleware = upload;
  }
  return uploadMiddleware;
};

// POST /api/v1/upload/image
// Upload a single image to YOUR Cloudinary account
router.post('/image', protect, (req, res, next) => {
  const upload = getUpload();
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file provided.' });
    }

    // Cloudinary storage sets req.file.path to the Cloudinary URL
    const url = req.file.path || req.file.secure_url;
    const publicId = req.file.filename;

    res.json({
      success: true,
      url,
      publicId,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

// POST /api/v1/upload/images (multiple, up to 5)
router.post('/images', protect, (req, res, next) => {
  const upload = getUpload();
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided.' });
    }

    const results = req.files.map(f => ({
      url: f.path || f.secure_url,
      publicId: f.filename,
      originalName: f.originalname,
      size: f.size,
    }));

    res.json({ success: true, files: results });
  });
});

module.exports = router;
