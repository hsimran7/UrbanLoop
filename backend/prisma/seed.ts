import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 12);
  const officialPasswordHash = await bcrypt.hash('OfficialPassword123!', 12);
  const citizenPasswordHash = await bcrypt.hash('CitizenPassword123!', 12);
  const workerPasswordHash = await bcrypt.hash('WorkerPassword123!', 12);

  // 1. Seed System Admin
  await prisma.user.upsert({
    where: { email: 'admin@urbanloop.gov' },
    update: {},
    create: {
      email: 'admin@urbanloop.gov',
      passwordHash: adminPasswordHash,
      role: UserRole.SYSTEM_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log('Seeded Admin: admin@urbanloop.gov / AdminPassword123!');

  // 2. Seed Government Official
  await prisma.user.upsert({
    where: { email: 'official@urbanloop.gov' },
    update: {},
    create: {
      email: 'official@urbanloop.gov',
      passwordHash: officialPasswordHash,
      role: UserRole.GOVERNMENT_OFFICIAL,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log('Seeded Government Official: official@urbanloop.gov / OfficialPassword123!');

  // 3. Seed Worker
  await prisma.user.upsert({
    where: { email: 'worker@urbanloop.gov' },
    update: {},
    create: {
      email: 'worker@urbanloop.gov',
      passwordHash: workerPasswordHash,
      role: UserRole.WORKER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log('Seeded Worker: worker@urbanloop.gov / WorkerPassword123!');

  // 4. Seed verified Citizen
  await prisma.user.upsert({
    where: { email: 'citizen@urbanloop.gov' },
    update: {},
    create: {
      email: 'citizen@urbanloop.gov',
      passwordHash: citizenPasswordHash,
      role: UserRole.CITIZEN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log('Seeded Citizen: citizen@urbanloop.gov / CitizenPassword123!');

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
