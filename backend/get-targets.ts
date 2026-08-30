import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assignmentId = 'ad33f97a-21c3-46fe-83cd-1f2796cf9ffd';
  const assignment = await prisma.dailyAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      targets: {
        include: {
          bin: true
        }
      }
    }
  });

  if (!assignment) {
    console.log('Assignment not found');
    return;
  }

  console.log('Targets:');
  console.table(assignment.targets.map(t => ({
    id: t.id,
    qrCodeId: t.bin?.qrCodeId,
    type: t.bin?.type,
    status: t.status,
    binId: t.binId
  })));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
