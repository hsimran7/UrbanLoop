const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Validate that Cloudinary env vars are set before configuring
const validateCloudinary = () => {
  const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[Cloudinary] WARNING: Missing env vars: ${missing.join(', ')}. File uploads will be disabled.`);
    return false;
  }
  return true;
};

let upload = null;

if (validateCloudinary()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'urbanloop',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  console.log('[Cloudinary] ✅ Configured with cloud_name:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  // Fallback: in-memory multer (files won't persist, but server won't crash)
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
}

module.exports = { upload, cloudinary };
