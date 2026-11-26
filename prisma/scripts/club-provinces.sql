-- Asigna provincia a los clubes por el nombre con que aparecen en los PDF de Meet Manager.
-- Solo toca clubes sin provincia (province IS NULL): se puede correr de nuevo sin pisar correcciones manuales.
-- Clubes de otras provincias o países quedan en NULL a propósito. Revisar y ampliar a mano.
-- Uso: psql "$DATABASE_URL" -f prisma/scripts/club-provinces.sql

BEGIN;

CREATE TEMP TABLE _prov_rules (ord serial, patron text, provincia text);
INSERT INTO _prov_rules (patron, provincia) VALUES
  -- Tucumán
  ('azucena', 'Tucumán'),
  ('central c?o?r?doba tucuman|central codoba tucuman|atletico central cordoba', 'Tucumán'),
  ('tucuman y gimnasia', 'Tucumán'),
  ('^(instituto|inst) de natacion y deport|^inyd$|^ind$', 'Tucumán'),
  ('instituto saleciano', 'Tucumán'),
  ('aguilares|municipalidad de la cocha|h2o concepcion|lomas fitness yerba', 'Tucumán'),
  ('^ftn$|mitre tucuman|^(club )?mitre$|^club asociacion mi?c?tre', 'Tucumán'),
  -- Santiago del Estero
  ('madre d[e]? ?ciudades', 'Santiago del Estero'),
  ('manuel belgrano', 'Santiago del Estero'),
  ('lawn tennis clusantiago|santiago lawn tennis|lawn tennis cede', 'Santiago del Estero'),
  ('termas del rio hondo|delfines trh|olimpico la band', 'Santiago del Estero'),
  -- Salta
  ('de salta$|^gyt$|^ses$|municipalidad de salta|ucasal|uzzi|fesalna|salte', 'Salta'),
  ('^gimnasia y tiro de salta|unio sirio libanesa|sociedad espan', 'Salta'),
  -- Jujuy
  ('natacion ju$|^fanj$|che.?il|jujuy|jujen|^mnj$|los pinguinos|mantar', 'Jujuy'),
  ('^soc.* ?tiro.*gimn|^soc.* gimnasia y esgrima ju|^soc de tiro', 'Jujuy'),
  -- Catamarca
  ('catamarca', 'Catamarca'),
  -- La Rioja
  ('la rioja|^centro 5$|educacion fisica n5', 'La Rioja');

UPDATE clubs c
SET province = x.provincia
FROM (
  SELECT DISTINCT ON (cl.id) cl.id, r.provincia
  FROM clubs cl
  JOIN _prov_rules r ON lower(cl.name) ~ r.patron
  WHERE cl.province IS NULL
  ORDER BY cl.id, r.ord
) x
WHERE c.id = x.id;

COMMIT;

-- Informe: clubes que aparecen en torneos provinciales o NOA y siguen sin provincia.
SELECT c.name AS "sin provincia", count(*) AS resultados
FROM clubs c
JOIN results r ON r.club_id = c.id
JOIN heats h ON h.id = r.heat_id
JOIN events e ON e.id = h.event_id
JOIN tournaments t ON t.id = e.tournament_id
WHERE c.province IS NULL AND t.scope IN ('provincial', 'noa')
GROUP BY c.name
ORDER BY 2 DESC;
