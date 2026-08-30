require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const socketGateway = require('./sockets/index');

const PORT = process.env.PORT || 3001;

// Connect to MongoDB
connectDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with the server
socketGateway.init(server);

// Start listening
server.listen(PORT, () => {
  console.log(`[Express] Server running on port ${PORT}`);
  console.log(`[Express] Environment: ${process.env.NODE_ENV}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
  process.exit(0);
});
