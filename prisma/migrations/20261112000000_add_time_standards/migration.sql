-- CreateTable
CREATE TABLE "time_standard_sets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_label" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order_no" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "season_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_standard_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_standards" (
    "id" TEXT NOT NULL,
    "set_id" TEXT NOT NULL,
    "event_definition_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "pool_length" "PoolLength" NOT NULL,
    "time_ms" INTEGER NOT NULL,

    CONSTRAINT "time_standards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "time_standard_sets_code_key" ON "time_standard_sets"("code");

-- CreateIndex
CREATE INDEX "time_standards_event_definition_id_pool_length_gender_idx" ON "time_standards"("event_definition_id", "pool_length", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "time_standards_set_id_event_definition_id_category_id_gende_key" ON "time_standards"("set_id", "event_definition_id", "category_id", "gender", "pool_length");

-- AddForeignKey
ALTER TABLE "time_standard_sets" ADD CONSTRAINT "time_standard_sets_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_standards" ADD CONSTRAINT "time_standards_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "time_standard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_standards" ADD CONSTRAINT "time_standards_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_standards" ADD CONSTRAINT "time_standards_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

