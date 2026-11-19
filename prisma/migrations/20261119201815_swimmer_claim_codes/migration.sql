-- CreateTable
CREATE TABLE "swimmer_claim_codes" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_hint" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swimmer_claim_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "swimmer_claim_codes_code_hash_key" ON "swimmer_claim_codes"("code_hash");

-- CreateIndex
CREATE INDEX "swimmer_claim_codes_swimmer_id_idx" ON "swimmer_claim_codes"("swimmer_id");

-- AddForeignKey
ALTER TABLE "swimmer_claim_codes" ADD CONSTRAINT "swimmer_claim_codes_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swimmer_claim_codes" ADD CONSTRAINT "swimmer_claim_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swimmer_claim_codes" ADD CONSTRAINT "swimmer_claim_codes_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
