-- AlterEnum: agregar MIX (relevos mixtos 2M+2F) al enum Gender.
-- Swimmer.gender sigue siendo siempre M o F; MIX solo aplica a
-- event_definitions/records/rankings de relevos mixtos.
ALTER TYPE "Gender" ADD VALUE 'MIX';
