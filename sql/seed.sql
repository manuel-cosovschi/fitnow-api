-- Datos de ejemplo con fechas futuras y cupos
INSERT INTO activities (title, description, modality, difficulty, location, price, date_start, date_end, capacity, seats_left) VALUES
('Funcional en Parque', 'Clase grupal funcional', 'outdoor', 'media', 'Parque Centenario', 3000,
  DATE_ADD(NOW(), INTERVAL 2 DAY),
  DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 1 HOUR),
  20, 20),
('Cross Training', 'WOD de intensidad media', 'gimnasio', 'alta', 'Caja Palermo', 4500,
  DATE_ADD(NOW(), INTERVAL 3 DAY),
  DATE_ADD(DATE_ADD(NOW(), INTERVAL 3 DAY), INTERVAL 1 HOUR),
  15, 15),
('Yoga Vinyasa', 'Clase para todos los niveles', 'clase', 'baja', 'Estudio Núñez', 3500,
  DATE_ADD(NOW(), INTERVAL 4 DAY),
  DATE_ADD(DATE_ADD(NOW(), INTERVAL 4 DAY), INTERVAL 1 HOUR),
  12, 12);

SELECT CONCAT(
  "UPDATE activities SET date_start='", date_start,
  "', date_end='", date_end,
  "' WHERE id=", id, ";"
) AS upd
FROM activities
ORDER BY id;
