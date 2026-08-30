import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Reset all ASSIGNED vehicles to AVAILABLE since no active daily assignments exist
  const result = await prisma.vehicle.updateMany({
    where: { status: 'ASSIGNED' },
    data: { status: 'AVAILABLE' },
  });
  console.log(`Reset ${result.count} vehicles to AVAILABLE status.`);
  
  // Verify
  const counts = await prisma.vehicle.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('Vehicle status counts:', counts);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
