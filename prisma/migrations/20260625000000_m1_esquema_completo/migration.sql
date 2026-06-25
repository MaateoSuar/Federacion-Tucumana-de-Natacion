-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "PoolLength" AS ENUM ('P25', 'P50');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('provincial', 'nacional');

-- CreateEnum
CREATE TYPE "CategoryScope" AS ENUM ('provincial', 'nacional');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CLUB_DELEGATE', 'COACH', 'JUDGE', 'SWIMMER');

-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('afiliado', 'suspendido', 'baja');

-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('vigente', 'vencida', 'suspendida');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('programado', 'inscripciones_abiertas', 'cerrado', 'en_curso', 'finalizado', 'homologado');

-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('provincial', 'nacional', 'promocional');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('pendiente', 'en_curso', 'finalizado');

-- CreateEnum
CREATE TYPE "EventRound" AS ENUM ('clasificatorio', 'final', 'serie_unica');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pendiente', 'aceptada', 'rechazada', 'cancelada');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('OK', 'DSQ', 'DNS', 'DNF');

-- CreateEnum
CREATE TYPE "ResultSource" AS ENUM ('hy3', 'sd3', 'lenex', 'csv', 'excel', 'pdf', 'ftn_manager', 'manual');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('pending_homologation', 'homologated', 'superseded');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('uploaded', 'parsing', 'validating', 'matching', 'preview', 'confirmed', 'failed', 'rolled_back');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('meet_manager', 'lenex', 'csv', 'excel', 'pdf', 'manual', 'ftn_manager');

-- CreateEnum
CREATE TYPE "MeetFormat" AS ENUM ('hy3', 'sd3', 'lenex', 'csv', 'excel', 'pdf');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('lenex', 'sd3', 'pdf', 'html');

-- CreateEnum
CREATE TYPE "ExportScope" AS ENUM ('entries', 'results', 'heat_sheet');

-- CreateEnum
CREATE TYPE "TournamentDocType" AS ENUM ('convocatoria', 'reglamento', 'programa', 'resultados', 'otros');

-- CreateEnum
CREATE TYPE "AchievementType" AS ENUM ('medal', 'record', 'badge', 'milestone');

-- CreateEnum
CREATE TYPE "MedalType" AS ENUM ('gold', 'silver', 'bronze');

-- CreateEnum
CREATE TYPE "ScoringSchemeType" AS ENUM ('placement', 'fina_points', 'mixed');

-- CreateEnum
CREATE TYPE "AccountLinkStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('borrador', 'publicada');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "club_id" TEXT,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "primary_role" "SystemRole" NOT NULL DEFAULT 'SWIMMER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "swimmer_id" TEXT,
    "club_id" TEXT,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "guardian_name" TEXT,
    "guardian_email" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "password_reset_token" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "refresh_token_hash" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "logo_url" TEXT,
    "founded_year" INTEGER,
    "contact_email" TEXT,
    "status" "ClubStatus" NOT NULL DEFAULT 'afiliado',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliations" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'vigente',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "scope" "CategoryScope" NOT NULL DEFAULT 'provincial',
    "order_no" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from_season_id" TEXT,
    "valid_to_season_id" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swimmers" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "document_id" TEXT,
    "birth_date" TIMESTAMP(3),
    "gender" "Gender" NOT NULL,
    "nationality" TEXT NOT NULL DEFAULT 'ARG',
    "current_club_id" TEXT,
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" "ResultSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swimmers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swimmer_club_history" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "swimmer_club_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "club_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "license_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_profiles" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "bio" TEXT,
    "photo_url" TEXT,
    "social_links" JSONB,
    "public_visibility" BOOLEAN NOT NULL DEFAULT true,
    "passport_public_token" TEXT NOT NULL,
    "preferences" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_link_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "status" "AccountLinkStatus" NOT NULL DEFAULT 'pending',
    "match_confidence" INTEGER NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stroke" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "is_relay" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "event_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host_club_id" TEXT,
    "venue" TEXT,
    "pool_length" "PoolLength" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "type" "TournamentType" NOT NULL,
    "scope" "Scope" NOT NULL DEFAULT 'provincial',
    "status" "TournamentStatus" NOT NULL DEFAULT 'programado',
    "season_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "event_definition_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "round" "EventRound" NOT NULL DEFAULT 'serie_unica',
    "order_no" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'pendiente',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heats" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "heat_number" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3),

    CONSTRAINT "heats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "entry_time" INTEGER,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lane_assignments" (
    "id" TEXT NOT NULL,
    "heat_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "lane" INTEGER NOT NULL,

    CONSTRAINT "lane_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "heat_id" TEXT,
    "lane" INTEGER,
    "final_time" INTEGER,
    "place" INTEGER,
    "status" "ResultStatus" NOT NULL DEFAULT 'OK',
    "fina_points" DECIMAL(8,4),
    "is_pb" BOOLEAN NOT NULL DEFAULT false,
    "is_record" BOOLEAN NOT NULL DEFAULT false,
    "homologated" BOOLEAN NOT NULL DEFAULT false,
    "homologated_at" TIMESTAMP(3),
    "homologated_by" TEXT,
    "dsq_code" TEXT,
    "reaction_time" INTEGER,
    "source" "ResultSource" NOT NULL DEFAULT 'manual',
    "category_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "splits" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "cumulative_time" INTEGER NOT NULL,

    CONSTRAINT "splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_bests" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "event_definition_id" TEXT NOT NULL,
    "pool_length" "PoolLength" NOT NULL,
    "best_time" INTEGER NOT NULL,
    "source_result_id" TEXT,
    "season_id" TEXT,
    "fina_points" DECIMAL(8,4),
    "achieved_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_bests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "event_definition_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "pool_length" "PoolLength" NOT NULL,
    "time_ms" INTEGER NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "record_date" TIMESTAMP(3) NOT NULL,
    "source_result_id" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'pending_homologation',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "previous_record_id" TEXT,
    "homologated_by" TEXT,
    "homologated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rankings" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "event_definition_id" TEXT NOT NULL,
    "pool_length" "PoolLength" NOT NULL,
    "gender" "Gender" NOT NULL,
    "scope" "Scope" NOT NULL DEFAULT 'provincial',
    "season_id" TEXT,
    "category_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "final_time" INTEGER NOT NULL,
    "fina_points" DECIMAL(8,4),
    "source_result_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_history" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "event_definition_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "pool_length" "PoolLength" NOT NULL,
    "scope" "Scope" NOT NULL DEFAULT 'provincial',
    "season_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "best_time_ms" INTEGER NOT NULL,
    "fina_points" DECIMAL(8,4),
    "snapshot_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_statistics" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "season_id" TEXT,
    "total_competitions" INTEGER NOT NULL DEFAULT 0,
    "total_events" INTEGER NOT NULL DEFAULT 0,
    "total_pbs" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "silver" INTEGER NOT NULL DEFAULT 0,
    "bronze" INTEGER NOT NULL DEFAULT 0,
    "total_medals" INTEGER NOT NULL DEFAULT 0,
    "best_fina_points" DECIMAL(8,4),
    "improvement_pct" DECIMAL(5,2),
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_achievements" (
    "id" TEXT NOT NULL,
    "swimmer_id" TEXT NOT NULL,
    "type" "AchievementType" NOT NULL,
    "medal" "MedalType",
    "tournament_id" TEXT,
    "event_id" TEXT,
    "record_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "achieved_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ScoringSchemeType" NOT NULL,
    "config" JSONB NOT NULL,
    "valid_from_season_id" TEXT,
    "valid_to_season_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_documents" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "type" "TournamentDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "file_url" TEXT,
    "file_hash" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'uploaded',
    "uploaded_by" TEXT NOT NULL,
    "tournament_id" TEXT,
    "total_rows" INTEGER,
    "ok_rows" INTEGER,
    "error_rows" INTEGER,
    "issues" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meet_manager_imports" (
    "id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "format" "MeetFormat" NOT NULL,
    "external_meet_id" TEXT,
    "meet_name" TEXT,
    "meet_course" "PoolLength",
    "parsed_payload" JSONB NOT NULL,
    "new_swimmers_count" INTEGER NOT NULL DEFAULT 0,
    "matched_swimmers_count" INTEGER NOT NULL DEFAULT 0,
    "records_detected_count" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meet_manager_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meet_manager_exports" (
    "id" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "scope" "ExportScope" NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meet_manager_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "cover_url" TEXT,
    "category" TEXT,
    "author_id" TEXT NOT NULL,
    "status" "NewsStatus" NOT NULL DEFAULT 'borrador',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER,
    "uploaded_by" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_user_id_role_id_club_id_key" ON "user_role_assignments"("user_id", "role_id", "club_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_swimmer_id_key" ON "users"("swimmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_year_key" ON "seasons"("year");

-- CreateIndex
CREATE UNIQUE INDEX "affiliations_club_id_season_id_key" ON "affiliations"("club_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "swimmers_document_id_key" ON "swimmers"("document_id");

-- CreateIndex
CREATE INDEX "swimmer_club_history_swimmer_id_season_id_idx" ON "swimmer_club_history"("swimmer_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_user_id_key" ON "coaches"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_profiles_swimmer_id_key" ON "athlete_profiles"("swimmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_profiles_passport_public_token_key" ON "athlete_profiles"("passport_public_token");

-- CreateIndex
CREATE INDEX "account_link_requests_swimmer_id_status_idx" ON "account_link_requests"("swimmer_id", "status");

-- CreateIndex
CREATE INDEX "account_link_requests_user_id_status_idx" ON "account_link_requests"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_definitions_code_key" ON "event_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "heats_event_id_heat_number_key" ON "heats"("event_id", "heat_number");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_event_id_swimmer_id_key" ON "registrations"("event_id", "swimmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "lane_assignments_heat_id_lane_key" ON "lane_assignments"("heat_id", "lane");

-- CreateIndex
CREATE INDEX "results_swimmer_id_event_id_idx" ON "results"("swimmer_id", "event_id");

-- CreateIndex
CREATE INDEX "results_homologated_event_id_idx" ON "results"("homologated", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "splits_result_id_distance_key" ON "splits"("result_id", "distance");

-- CreateIndex
CREATE UNIQUE INDEX "personal_bests_source_result_id_key" ON "personal_bests"("source_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "personal_bests_swimmer_id_event_definition_id_pool_length_key" ON "personal_bests"("swimmer_id", "event_definition_id", "pool_length");

-- CreateIndex
CREATE UNIQUE INDEX "records_source_result_id_key" ON "records"("source_result_id");

-- CreateIndex
CREATE INDEX "records_scope_event_definition_id_category_id_gender_pool_l_idx" ON "records"("scope", "event_definition_id", "category_id", "gender", "pool_length", "is_current");

-- CreateIndex
CREATE INDEX "rankings_event_definition_id_pool_length_gender_scope_seaso_idx" ON "rankings"("event_definition_id", "pool_length", "gender", "scope", "season_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "rankings_swimmer_id_event_definition_id_pool_length_scope_s_key" ON "rankings"("swimmer_id", "event_definition_id", "pool_length", "scope", "season_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_history_swimmer_id_event_definition_id_category_id__key" ON "ranking_history"("swimmer_id", "event_definition_id", "category_id", "pool_length", "scope", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_statistics_swimmer_id_season_id_key" ON "athlete_statistics"("swimmer_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_file_hash_key" ON "import_jobs"("file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "meet_manager_imports_import_job_id_key" ON "meet_manager_imports"("import_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "media_entity_type_entity_id_idx" ON "media"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_valid_from_season_id_fkey" FOREIGN KEY ("valid_from_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_valid_to_season_id_fkey" FOREIGN KEY ("valid_to_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swimmers" ADD CONSTRAINT "swimmers_current_club_id_fkey" FOREIGN KEY ("current_club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swimmer_club_history" ADD CONSTRAINT "swimmer_club_history_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swimmer_club_history" ADD CONSTRAINT "swimmer_club_history_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swimmer_club_history" ADD CONSTRAINT "swimmer_club_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_link_requests" ADD CONSTRAINT "account_link_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_link_requests" ADD CONSTRAINT "account_link_requests_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_link_requests" ADD CONSTRAINT "account_link_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_host_club_id_fkey" FOREIGN KEY ("host_club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heats" ADD CONSTRAINT "heats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lane_assignments" ADD CONSTRAINT "lane_assignments_heat_id_fkey" FOREIGN KEY ("heat_id") REFERENCES "heats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lane_assignments" ADD CONSTRAINT "lane_assignments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_heat_id_fkey" FOREIGN KEY ("heat_id") REFERENCES "heats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_homologated_by_fkey" FOREIGN KEY ("homologated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "splits" ADD CONSTRAINT "splits_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_source_result_id_fkey" FOREIGN KEY ("source_result_id") REFERENCES "results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_source_result_id_fkey" FOREIGN KEY ("source_result_id") REFERENCES "results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_homologated_by_fkey" FOREIGN KEY ("homologated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_previous_record_id_fkey" FOREIGN KEY ("previous_record_id") REFERENCES "records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_history" ADD CONSTRAINT "ranking_history_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_history" ADD CONSTRAINT "ranking_history_event_definition_id_fkey" FOREIGN KEY ("event_definition_id") REFERENCES "event_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_history" ADD CONSTRAINT "ranking_history_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_history" ADD CONSTRAINT "ranking_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_statistics" ADD CONSTRAINT "athlete_statistics_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_statistics" ADD CONSTRAINT "athlete_statistics_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_achievements" ADD CONSTRAINT "athlete_achievements_swimmer_id_fkey" FOREIGN KEY ("swimmer_id") REFERENCES "swimmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_achievements" ADD CONSTRAINT "athlete_achievements_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_achievements" ADD CONSTRAINT "athlete_achievements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_achievements" ADD CONSTRAINT "athlete_achievements_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_schemes" ADD CONSTRAINT "scoring_schemes_valid_from_season_id_fkey" FOREIGN KEY ("valid_from_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_schemes" ADD CONSTRAINT "scoring_schemes_valid_to_season_id_fkey" FOREIGN KEY ("valid_to_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_documents" ADD CONSTRAINT "tournament_documents_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_documents" ADD CONSTRAINT "tournament_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_manager_imports" ADD CONSTRAINT "meet_manager_imports_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_manager_exports" ADD CONSTRAINT "meet_manager_exports_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_manager_exports" ADD CONSTRAINT "meet_manager_exports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes (not natively supported by Prisma schema DSL)

-- Un solo récord vigente (is_current=true) por clave de récord
CREATE UNIQUE INDEX "uq_record_current"
  ON "records" ("scope", "event_definition_id", "category_id", "gender", "pool_length")
  WHERE "is_current" = true;

-- Un solo vínculo aprobado por swimmer (un swimmer ↔ una cuenta)
CREATE UNIQUE INDEX "uq_link_request_approved_swimmer"
  ON "account_link_requests" ("swimmer_id")
  WHERE "status" = 'approved';

-- Un solo vínculo aprobado por user (una cuenta ↔ un swimmer)
CREATE UNIQUE INDEX "uq_link_request_approved_user"
  ON "account_link_requests" ("user_id")
  WHERE "status" = 'approved';
