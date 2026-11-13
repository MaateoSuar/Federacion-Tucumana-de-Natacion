-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
