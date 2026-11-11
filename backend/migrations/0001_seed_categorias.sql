-- Categorías de la Etapa 1, según la tabla de docs/diseno-credenciales-qr.md.
-- U11 F (femenina) no se calcula por año: la asigna Mony.
-- Los años de vóley los fijó Ignacio (2026-11-11) sin confirmación de Mony; si cambian,
-- se corrigen con una migración nueva.
INSERT INTO "categorias" ("nombre", "disciplina", "anio_desde", "anio_hasta", "se_calcula") VALUES
  ('U9', 'basketball', 2017, 2018, true),
  ('U11', 'basketball', 2015, 2016, true),
  ('U11 F', 'basketball', 2015, 2016, false),
  ('U13', 'basketball', 2013, 2014, true),
  ('U15', 'basketball', 2011, 2012, true),
  ('U17', 'basketball', 2009, 2010, true),
  ('U21', 'basketball', 2005, 2008, true),
  ('U12', 'voleibol', 2015, 2016, true),
  ('U14', 'voleibol', 2013, 2014, true),
  ('U16', 'voleibol', 2011, 2012, true),
  ('U18', 'voleibol', 2009, 2010, true);
