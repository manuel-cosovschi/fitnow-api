-- FitNow schema (minimal MVP)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  modality ENUM('gimnasio','outdoor','clase','torneo') DEFAULT 'clase',
  difficulty ENUM('baja','media','alta') DEFAULT 'media',
  location VARCHAR(200),
  price DECIMAL(10,2) DEFAULT 0,
  date_start DATETIME,
  date_end DATETIME,
  capacity INT DEFAULT 20,
  seats_left INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  activity_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_activity (user_id, activity_id),
  CONSTRAINT fk_en_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_en_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);
