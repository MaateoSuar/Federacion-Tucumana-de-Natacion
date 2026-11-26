-- AlterEnum
ALTER TYPE "Scope" ADD VALUE 'noa';

-- AlterEnum
ALTER TYPE "CategoryScope" ADD VALUE 'noa';

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "province" TEXT;
