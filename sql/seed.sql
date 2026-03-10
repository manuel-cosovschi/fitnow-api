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
