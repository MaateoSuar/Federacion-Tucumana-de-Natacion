-- AlterTable: agregar campo tournament_name y notes a records
ALTER TABLE "records" ADD COLUMN "tournament_name" TEXT;
ALTER TABLE "records" ADD COLUMN "notes" TEXT;

-- AlterTable: hacer source_result_id nullable en rankings (permite rankings de récords históricos sin resultado de competencia)
ALTER TABLE "rankings" ALTER COLUMN "source_result_id" DROP NOT NULL;
