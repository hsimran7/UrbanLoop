import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const vehicles = await prisma.vehicle.findMany();
  console.log('Total DB Vehicles:', vehicles.length);
  if (vehicles.length > 0) console.log(vehicles[0]);
}
main().finally(() => prisma.$disconnect());
