const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌  MONGODB_URI is not set in backend/.env                  ║');
    console.error('║                                                              ║');
    console.error('║  Open backend/.env and set your own MongoDB connection:      ║');
    console.error('║  MONGODB_URI=mongodb+srv://...                               ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    // Extract database name from URI without leaking credentials
    let dbName = 'unknown';
    try {
      const urlObj = new URL(uri);
      dbName = urlObj.pathname.replace('/', '') || 'default';
    } catch (_) {}

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ✅  UrbanLoop Backend Started                               ║');
    console.log(`║  ✅  MongoDB Connected: ${conn.connection.host.padEnd(36)}║`);
    console.log(`║  ✅  Database:          ${dbName.padEnd(36)}║`);
    console.log(`║  ✅  Port:              ${(process.env.PORT || '3000').padEnd(36)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
  } catch (err) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌  MongoDB Connection FAILED                               ║');
    console.error(`║  Error: ${err.message.substring(0, 54).padEnd(54)}║`);
    console.error('║                                                              ║');
    console.error('║  Check your MONGODB_URI in backend/.env                      ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }
};

module.exports = connectDB;
