-- Un mismo resultado puede ser récord tucumano (categoría oficial y Absoluto) y récord NOA:
-- la clave única pasa de (source_result_id) a (source_result_id, scope, category_id).
-- No toca datos: los récords existentes ya cumplen la clave nueva.
DROP INDEX "records_source_result_id_key";
CREATE UNIQUE INDEX "records_source_result_id_scope_category_id_key" ON "records"("source_result_id", "scope", "category_id");
