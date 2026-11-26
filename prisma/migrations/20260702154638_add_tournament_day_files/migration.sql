-- CreateEnum
CREATE TYPE "TournamentDayFileType" AS ENUM ('sembrados', 'resultados');

-- CreateTable
CREATE TABLE "tournament_day_files" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "type" "TournamentDayFileType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "parsed_rows" JSONB,
    "parse_warning" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_day_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_day_files_tournament_id_day_number_idx" ON "tournament_day_files"("tournament_id", "day_number");

-- AddForeignKey
ALTER TABLE "tournament_day_files" ADD CONSTRAINT "tournament_day_files_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_day_files" ADD CONSTRAINT "tournament_day_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
