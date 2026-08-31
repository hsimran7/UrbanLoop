// Database configuration
const config = {
  // MongoDB Atlas connection string
  mongodb: {
    uri: process.env.MONGODB_URI || ''
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || ''
  },

  // Server configuration
  server: {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // CORS configuration
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173'
  }
};

module.exports = config;
