-- CreateTable
CREATE TABLE "swimmer_aliases" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "alias_normalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swimmer_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_aliases" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "alias_normalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swimmer_aliases_alias_normalized_idx" ON "swimmer_aliases"("alias_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "swimmer_aliases_swimmer_id_alias_normalized_key" ON "swimmer_aliases"("swimmer_id", "alias_normalized");

-- CreateIndex
CREATE INDEX "club_aliases_alias_normalized_idx" ON "club_aliases"("alias_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "club_aliases_club_id_alias_normalized_key" ON "club_aliases"("club_id", "alias_normalized");

-- AddForeignKey
ALTER TABLE "swimmer_aliases" ADD CONSTRAINT "swimmer_aliases_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_aliases" ADD CONSTRAINT "club_aliases_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
