-- AlterTable
ALTER TABLE "DailyAssignment" ADD COLUMN     "estimatedBinCount" INTEGER,
ADD COLUMN     "estimatedDuration" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL';
