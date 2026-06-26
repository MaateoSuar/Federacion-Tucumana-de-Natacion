-- AlterTable
ALTER TABLE "meet_manager_imports" ADD COLUMN     "match_results" JSONB;

-- CreateTable
CREATE TABLE "external_id_map" (
    "id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "swimmer_id" TEXT,
    "club_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_id_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_id_map_source_system_external_id_key" ON "external_id_map"("source_system", "external_id");

-- AddForeignKey
ALTER TABLE "external_id_map" ADD CONSTRAINT "external_id_map_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_id_map" ADD CONSTRAINT "external_id_map_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
