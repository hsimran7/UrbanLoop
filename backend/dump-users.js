/**
 * dump-users.js
 * Utility script: dumps all users (email, role, status) from MongoDB.
 * Usage: node dump-users.js
 */
const connectDB = require('./db');
const User = require('./models/User');

async function main() {
  await connectDB();

  const users = await User.find({}).select('email role status').lean();
  console.log(JSON.stringify(users, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
