-- FitNow — Seeds iniciales (PostgreSQL / Supabase)
-- Idempotentes: ON CONFLICT DO NOTHING

INSERT INTO sports (name) VALUES
  ('Running'), ('CrossFit'), ('Yoga'), ('Ciclismo'),
  ('Natación'), ('Pilates'), ('Fútbol'), ('Pádel'),
  ('HIIT'), ('Funcional')
ON CONFLICT (name) DO NOTHING;

INSERT INTO ai_weights (version, label, w_distance, w_elev, w_hz_cnt, w_hz_sev, w_feedback, w_popularity, is_active)
SELECT 'v1.0', 'Pesos heurísticos iniciales', 0.20, 0.15, 0.25, 0.25, 0.10, 0.05, TRUE
WHERE NOT EXISTS (SELECT 1 FROM ai_weights WHERE is_active = TRUE);

INSERT INTO news (icon, title, subtitle, color, starts_at, ends_at)
SELECT '🏃', '¡Bienvenido a FitNow!', 'Explorá actividades y rutas de running cerca tuyo.', '#00C27C', NOW(), NOW() + INTERVAL '60 days'
WHERE NOT EXISTS (SELECT 1 FROM news LIMIT 1);

-- ─────────────────────────────────────────────
-- Demo providers (4 kinds: gym, trainer, club, studio)
-- ─────────────────────────────────────────────
INSERT INTO providers (name, kind, description, city, lat, lng, status)
SELECT 'FitCenter Buenos Aires', 'gym',
  'Gimnasio completo con equipamiento de última generación y clases grupales.',
  'Buenos Aires', -34.6037, -58.3816, 'active'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'FitCenter Buenos Aires');

INSERT INTO providers (name, kind, description, city, lat, lng, status)
SELECT 'Lucas Pérez — Personal Trainer', 'trainer',
  'Entrenador personal certificado, especialista en fuerza y acondicionamiento.',
  'Buenos Aires', -34.5875, -58.4398, 'active'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Lucas Pérez — Personal Trainer');

INSERT INTO providers (name, kind, description, city, lat, lng, status)
SELECT 'Club Atlético Palermo', 'club',
  'Club deportivo con canchas de pádel, fútbol y pileta olímpica.',
  'Buenos Aires', -34.5781, -58.4285, 'active'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Club Atlético Palermo');

INSERT INTO providers (name, kind, description, city, lat, lng, status)
SELECT 'Studio Zen Yoga & Pilates', 'studio',
  'Estudio especializado en yoga, pilates y técnicas de mindfulness.',
  'Buenos Aires', -34.6118, -58.4023, 'active'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Studio Zen Yoga & Pilates');

-- ─────────────────────────────────────────────
-- Demo activities (10 rows, covering kind: gym, trainer, club, club_sport)
-- IDs resueltos por nombre para evitar hardcodeo
-- ─────────────────────────────────────────────

-- kind = 'gym' (3)
INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'gym', 'active',
  'CrossFit Matutino', 'Sesión de CrossFit de alta intensidad. Todos los niveles bienvenidos.',
  'gimnasio', 'alta', 'FitCenter Buenos Aires — Av. Corrientes 1234', 2500,
  NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day' + INTERVAL '1 hour', 20, 20
FROM providers p, sports s
WHERE p.name = 'FitCenter Buenos Aires' AND s.name = 'CrossFit'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'CrossFit Matutino');

INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'gym', 'active',
  'HIIT Express 45 min', 'Entrenamiento funcional de alta intensidad en 45 minutos.',
  'gimnasio', 'alta', 'FitCenter Buenos Aires — Sala A', 1800,
  NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days' + INTERVAL '45 minutes', 15, 15
FROM providers p, sports s
WHERE p.name = 'FitCenter Buenos Aires' AND s.name = 'HIIT'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'HIIT Express 45 min');

INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'gym', 'active',
  'Funcional para Principiantes', 'Introducción al entrenamiento funcional. Sin experiencia previa necesaria.',
  'clase', 'baja', 'FitCenter Buenos Aires — Sala B', 1500,
  NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days' + INTERVAL '1 hour', 12, 12
FROM providers p, sports s
WHERE p.name = 'FitCenter Buenos Aires' AND s.name = 'Funcional'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Funcional para Principiantes');

-- kind = 'trainer' (3)
INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'trainer', 'active',
  'Sesión Personal de Running', 'Entrenamiento personalizado de running: técnica, ritmo y plan de carrera.',
  'outdoor', 'media', 'Parque Palermo — Entrada Av. del Libertador', 3500,
  NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days' + INTERVAL '1 hour', 1, 1
FROM providers p, sports s
WHERE p.name = 'Lucas Pérez — Personal Trainer' AND s.name = 'Running'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Sesión Personal de Running');

INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'trainer', 'active',
  'Plan de Fuerza — 4 semanas', 'Programa de fuerza estructurado, seguimiento semanal incluido.',
  'gimnasio', 'alta', 'FitCenter Buenos Aires', 12000,
  NOW() + INTERVAL '5 days', NOW() + INTERVAL '33 days', 1, 1
FROM providers p, sports s
WHERE p.name = 'Lucas Pérez — Personal Trainer' AND s.name = 'Funcional'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Plan de Fuerza — 4 semanas');

INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'trainer', 'active',
  'Entrenamiento Outdoor Grupal', 'Sesión grupal reducida (máx. 4 personas) en el parque. Funcional + cardio.',
  'outdoor', 'media', 'Parque Tres de Febrero, Buenos Aires', 2200,
  NOW() + INTERVAL '4 days', NOW() + INTERVAL '4 days' + INTERVAL '1 hour', 4, 4
FROM providers p, sports s
WHERE p.name = 'Lucas Pérez — Personal Trainer' AND s.name = 'CrossFit'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Entrenamiento Outdoor Grupal');

-- kind = 'club' (2)
INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'club', 'active',
  'Pádel Mixto — Dobles', 'Partido de pádel mixto para socios y no socios. Se asigna cancha.',
  'clase', 'media', 'Club Atlético Palermo — Cancha 3', 1200,
  NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days' + INTERVAL '90 minutes', 4, 4
FROM providers p, sports s
WHERE p.name = 'Club Atlético Palermo' AND s.name = 'Pádel'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Pádel Mixto — Dobles');

INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'club', 'active',
  'Natación Adultos — Nivel Intermedio', 'Clases de natación para adultos, 3 veces por semana. Estilo libre y espalda.',
  'gimnasio', 'media', 'Club Atlético Palermo — Pileta Olímpica', 3000,
  NOW() + INTERVAL '1 day', NOW() + INTERVAL '30 days', 10, 10
FROM providers p, sports s
WHERE p.name = 'Club Atlético Palermo' AND s.name = 'Natación'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Natación Adultos — Nivel Intermedio');

-- kind = 'club_sport' (2)
INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'club_sport', 'active',
  'Torneo Interno de Fútbol 5', 'Torneo mensual de fútbol 5 para miembros del club. Inscripción por equipo.',
  'torneo', 'media', 'Club Atlético Palermo — Cancha de Fútbol 5', 800,
  NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days' + INTERVAL '3 hours', 30, 30
FROM providers p, sports s
WHERE p.name = 'Club Atlético Palermo' AND s.name = 'Fútbol'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Torneo Interno de Fútbol 5');

INSERT INTO activities (provider_id, sport_id, kind, status, title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left)
SELECT p.id, s.id, 'club_sport', 'active',
  'Ciclismo Grupal — Ruta del Río', 'Salida grupal en bicicleta por la costanera. Distancia: 40 km.',
  'outdoor', 'media', 'Club Atlético Palermo — Estacionamiento Principal', 500,
  NOW() + INTERVAL '6 days', NOW() + INTERVAL '6 days' + INTERVAL '3 hours', 25, 25
FROM providers p, sports s
WHERE p.name = 'Club Atlético Palermo' AND s.name = 'Ciclismo'
  AND NOT EXISTS (SELECT 1 FROM activities WHERE title = 'Ciclismo Grupal — Ruta del Río');

-- ─────────────────────────────────────────────
-- Badges
-- ─────────────────────────────────────────────
INSERT INTO badges (code, name, description, icon, category, threshold) VALUES
  ('first_run',        'Primer Kilómetro',     'Completaste tu primera sesión de running',     'figure.run',              'running',  1),
  ('run_5k',           'Corredor 5K',           'Corriste 5 km en total',                       'figure.run.circle',       'running',  5000),
  ('run_50k',          'Medio Centenar',        'Corriste 50 km en total',                      'medal',                   'running',  50000),
  ('run_100k',         'Centenario de km',      'Corriste 100 km en total',                     'trophy',                  'running',  100000),
  ('first_gym',        'Primera Sesión Gym',    'Completaste tu primera sesión de gimnasio',    'dumbbell',                'gym',      1),
  ('gym_10',           'Habitué del Gym',       'Completaste 10 sesiones de gimnasio',          'figure.strengthtraining', 'gym',      10),
  ('gym_50',           'Veterano del Gym',      'Completaste 50 sesiones de gimnasio',          'star.circle',             'gym',      50),
  ('streak_7',         'Semana Perfecta',       'Mantuviste 7 días de racha activa',            'flame',                   'streak',   7),
  ('streak_30',        'Mes Activo',            'Mantuviste 30 días de racha activa',           'flame.fill',              'streak',   30),
  ('first_enrollment', 'Primera Inscripción',   'Te inscribiste en tu primera actividad',       'checkmark.seal',          'social',   1),
  ('xp_500',           'En Forma',              'Acumulaste 500 XP',                            'bolt',                    'xp',       500),
  ('xp_2000',          'Atleta',                'Acumulaste 2000 XP',                           'bolt.circle',             'xp',       2000),
  ('xp_10000',         'Élite FitNow',          'Acumulaste 10.000 XP',                         'crown',                   'xp',       10000)
ON CONFLICT (code) DO NOTHING;
