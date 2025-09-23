# FitNow — MVP

Monorepo con:
- `backend/` — API REST (Node.js + Express + MySQL)
- `FitNow/` — App iOS (SwiftUI + Combine), capa de presentación

## Backend
**Requisitos:** Node 20+, MySQL 8/9

1. Copiar `.env.example` a `.env` y completar:
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=********
DB_NAME=fitnow
JWT_SECRET=supersecreto
PORT=3000

2. Crear DB y tablas (si hace falta):
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS fitnow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p fitnow < backend/sql/schema.sql
mysql -u root -p fitnow < backend/sql/seed.sql
