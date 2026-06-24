<div align="center">

# FitNow API

**Backend REST de FitNow** — la plataforma que conecta atletas con gimnasios, entrenadores personales y clubes deportivos.

![Node](https://img.shields.io/badge/Node-20+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Stripe](https://img.shields.io/badge/Pagos-Stripe%20%2B%20MercadoPago-635BFF?style=flat-square&logo=stripe&logoColor=white)
![Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)

</div>

---

## Tabla de contenidos

- [Descripción](#descripción)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Setup local](#setup-local)
- [Variables de entorno](#variables-de-entorno)
- [Scripts](#scripts)
- [Base de datos](#base-de-datos)
- [Integraciones externas](#integraciones-externas)
- [Referencia de la API](#referencia-de-la-api)
- [Autenticación y roles](#autenticación-y-roles)
- [Tests](#tests)
- [Docker](#docker)
- [Deploy](#deploy)

---

## Descripción

API REST que da soporte a la app iOS de FitNow. Cubre el ciclo completo del producto:
autenticación multi-rol, catálogo de actividades y proveedores, inscripciones y check-in,
pagos (Stripe + MercadoPago), generación de rutas para correr con telemetría en vivo,
un **AI Coach** y planes de gimnasio asistidos por IA, gamificación con XP/badges y un
panel de administración con aprobación de contenido.

Funciona en **modo stub** sin claves externas (las respuestas de IA traen `ai_mode: 'stub'`),
de modo que se puede levantar y probar end-to-end sin contratar OpenAI, Stripe ni OSRM.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ (ESM, `"type": "module"`) |
| Framework HTTP | Express 4 |
| Base de datos | PostgreSQL (Supabase) vía `pg` |
| Validación | Zod |
| Auth | JWT (access + refresh) · Apple Sign In · Google OAuth · 2FA |
| Pagos | Stripe · MercadoPago |
| IA | OpenAI (`gpt-4o` por defecto, configurable) |
| Rutas running | OSRM (servidor público o self-hosted) |
| Push | APNs |
| Email | Nodemailer (SMTP) |
| Seguridad | Helmet · CORS · express-rate-limit |
| Logging | Winston · Morgan |
| Tests | Vitest · Supertest |

---

## Arquitectura

Arquitectura por capas (request → response):

```
routes/        Definición de endpoints + middleware (auth, validación, rate-limit)
  └─ controllers/   Adaptan req/res, delegan en services
       └─ services/      Lógica de negocio
            └─ repositories/   Acceso a datos (SQL sobre el pool de pg)
schemas/       Esquemas Zod para validar bodies/queries
middleware/    auth, roles, validate, error handler, rate limit de IA
utils/         logger, mailer, geo, openai, paginación, XP, LRU cache, env
```

---

## Estructura del proyecto

```
fitnow-api/
├── src/
│   ├── server.js            # Entrypoint: arranca el HTTP server
│   ├── app.js               # Configura Express, middleware y monta las rutas
│   ├── db.js                # Pool de PostgreSQL (Supabase/pg)
│   ├── migrate.js           # Runner de migraciones
│   ├── preload.js           # Hook de preload para `npm start`
│   ├── controllers/         # 1 controller por dominio
│   ├── services/            # Lógica de negocio
│   ├── repositories/        # Acceso a datos
│   ├── routes/              # 19 grupos de rutas montados en /api
│   ├── schemas/             # Validación Zod
│   ├── middleware/          # auth, roles, validate, error, aiRateLimit
│   └── utils/               # logger, mailer, geo, openai, xp, lruCache…
├── sql/
│   ├── schema.sql           # Esquema base
│   ├── migrations.sql       # Migraciones incrementales
│   ├── ai-extras.sql        # Tablas para features de IA
│   └── seed.sql             # Datos de ejemplo
├── seeds/
│   └── create-admin.js      # Crea un usuario admin
├── tests/                   # Suite Vitest + Supertest
├── public/                  # Assets estáticos
├── demo.js                  # Script de demo end-to-end
├── Dockerfile
├── docker-compose.yml
├── railway.toml             # Deploy en Railway
├── render.yaml              # Deploy en Render
└── .env.example
```

---

## Setup local

**Requisitos:** Node 20+ y una base PostgreSQL (local o un proyecto Supabase).

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.example .env
#    → completar DATABASE_URL y JWT_SECRET como mínimo (ver sección de abajo)

# 3. Crear el esquema en la base
psql "$DATABASE_URL" -f sql/schema.sql
psql "$DATABASE_URL" -f sql/migrations.sql
psql "$DATABASE_URL" -f sql/ai-extras.sql
psql "$DATABASE_URL" -f sql/seed.sql      # opcional: datos de ejemplo

# 4. (opcional) Crear un usuario admin
node seeds/create-admin.js

# 5. Levantar en modo desarrollo (hot reload con nodemon)
npm run dev
```

La API queda escuchando en `http://localhost:3000`. Healthcheck: `GET /api/health`.

---

## Variables de entorno

Todas las variables están documentadas en [`.env.example`](.env.example). Las esenciales:

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string de PostgreSQL. En Railway/Render/Fly usar el **pooler de Supabase** (IPv4), no el host directo (IPv6-only). |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ✅ | Secretos para firmar los tokens (usar strings random de 64 chars). |
| `PORT` / `HOST` | — | Default `3000` / `0.0.0.0`. |
| `NODE_ENV` | — | `production` en cualquier ambiente desplegado. |
| `ALLOWED_ORIGINS` | — | Lista CSV de orígenes CORS permitidos (vacío = todos, solo dev). |
| `GOOGLE_CLIENT_ID/SECRET` | — | Login con Google. |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | — | Sign in with Apple. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | Pagos con Stripe. |
| `MERCADOPAGO_ACCESS_TOKEN` | — | Pagos con MercadoPago. |
| `OPENAI_API_KEY` | — | Sin esta clave, los endpoints de IA corren en **modo stub**. |
| `OPENAI_MODEL` | — | Modelo por defecto (`gpt-4o`). |
| `OSRM_BASE` | — | Servidor OSRM para generar rutas (default: demo público). |
| `SMTP_*` | — | Envío de emails (reset de contraseña). Sin SMTP, los links se loguean a consola. |
| `APNS_*` | — | Push notifications a iOS. |

> ℹ️ **Modo stub:** las integraciones externas (IA, pagos, OSRM, email, push) son opcionales.
> Sin sus claves la API arranca igual y devuelve respuestas de demo, ideal para desarrollo y CI.

---

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor con hot reload (nodemon). |
| `npm start` | Servidor en producción (con `preload.js`). |
| `npm test` | Corre la suite de tests (Vitest). |
| `npm run test:watch` | Tests en modo watch. |
| `npm run coverage` | Tests + reporte de cobertura. |

---

## Base de datos

PostgreSQL gestionado con scripts SQL en `sql/`:

- **`schema.sql`** — tablas base (usuarios, proveedores, actividades, inscripciones, rutas…).
- **`migrations.sql`** — cambios incrementales sobre el esquema.
- **`ai-extras.sql`** — tablas para el AI Coach, form-check y planes de gimnasio.
- **`seed.sql`** — datos de ejemplo para desarrollo.

El pool (`src/db.js`) activa SSL automáticamente para hosts de Supabase y fuerza
resolución DNS IPv4-first para compatibilidad con plataformas de deploy sin IPv6.

---

## Integraciones externas

| Servicio | Para qué | Fallback sin clave |
|---|---|---|
| **OpenAI** | AI Coach, form-check, planes de gym, reroute en sesión | Respuestas stub (`ai_mode: 'stub'`) |
| **OSRM** | Generación de rutas para correr | Servidor demo público (rate-limited) |
| **Stripe** | Pagos con tarjeta (Payment Intents) | Endpoint inactivo |
| **MercadoPago** | Pagos (preferencias + webhook) | Endpoint inactivo |
| **APNs** | Push notifications a iOS | Sin envío |
| **SMTP** | Emails de reset de contraseña | Link logueado a consola |

Los endpoints de IA tienen un **rate limit propio** (`AI_RATE_LIMIT_MAX`,
`AI_HEAVY_RATE_LIMIT_MAX`) para proteger la cuota de OpenAI ante abuso.

---

## Referencia de la API

Todas las rutas cuelgan de `/api`. Las marcadas con 🔒 requieren `Authorization: Bearer <token>`.

### Auth — `/api/auth`
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/register` | Registro de atleta |
| POST | `/register-provider` | Registro de proveedor |
| POST | `/login` | Login (devuelve access + refresh) |
| POST | `/refresh` | Renovar access token |
| POST | `/apple` | Sign in with Apple |
| POST | `/magic-link` | Login por magic link |
| POST | `/2fa/verify` | Verificar segundo factor |
| POST | `/forgot-password` · `/reset-password` | Flujo de reset |
| POST | `/verify-email` | Verificación de email |
| GET/PATCH 🔒 | `/me` | Perfil propio |

### Cuenta — `/api/account` 🔒
`GET /me`, `PUT /me`

### Actividades — `/api/activities`
`GET /`, `GET /:id`, `GET /:id/reviews`, `GET /:id/posts` · 🔒 `POST /`, `PATCH /:id`,
`PATCH /:id/settings`, `POST /:id/activate`, `POST /:id/sessions`, `POST/DELETE /:id/posts`

### Sesiones / reservas — `/api`
`GET /activities/:id/sessions` · 🔒 `POST/DELETE /sessions/:sid/book`

### Inscripciones — `/api/enrollments` 🔒
`POST /`, `GET /mine`, `GET /provider`, `DELETE /:id`, `POST /:enrollmentId/checkin`

### Proveedores — `/api/providers`
`GET /`, `GET /:id`, `GET /:id/sports` · 🔒 `POST /`, `PATCH /:id`, `POST /:id/activate`,
`POST /:id/suspend`, `PUT /:id/hours`, `POST/DELETE /:id/services`

### Run — `/api/run`
`GET /routes`, `GET /routes/:id`, `GET /routes/:id/feedback` · 🔒 `GET /routes/recommend`,
`POST /routes`, `POST /routes/:id/feedback`, `GET/POST /sessions`, `POST /sessions/:id/points`,
`POST /sessions/:id/finish`, `POST /sessions/:id/abandon`

### Gym — `/api/gym` 🔒
`GET /sessions/mine`, `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/sets`,
`POST /sessions/:id/finish`, `POST /sessions/:id/reroute`

### Planes de entrenamiento — `/api/training-plans` 🔒
`GET /`, `GET /active`, `POST /generate`, `GET /:id`, `PATCH /:id/cancel`

### IA — `/api/ai` 🔒
`POST /coach`, `GET /coach/history`, `POST /form-check`, `GET /form-check/mine`

### Hazards — `/api/hazards`
`GET /`, `GET /near` · 🔒 `POST /`, `POST /:id/vote`, `PATCH /:id/status`

### Ofertas — `/api/offers`
`GET /` · 🔒 `POST /`, `GET /mine`

### Pagos — `/api/payments` 🔒
`POST /stripe/intent`, `POST /mercadopago/preference`, `POST /mercadopago/webhook`,
`POST /coupons/validate`, `GET /methods`, `DELETE /methods/:id`,
`POST /methods/:id/default`, `POST /refunds`

### Mensajes / push — `/api/users` 🔒
`GET /me/messages`, `POST /me/messages/:id/read`, `POST /me/messages/read-all`,
`POST/DELETE /me/push-token`

### Gamificación — `/api/gamification` 🔒
`GET /me`, `GET /me/history`, `GET /badges`, `GET /ranking`

### Analytics — `/api/analytics` 🔒
`GET /running/summary`, `GET /running/weekly`, `GET /gym/summary`, `GET /gym/weekly`,
`GET /gym/muscle-distribution`, `GET /combined/streak`

### Novedades — `/api/news`
`GET /`

### Archivos — `/api/files` 🔒
`POST /photo`

### Admin — `/api/admin` 🔒 (rol admin)
`GET/POST /ai/weights`, `GET /stats`, `GET /users`, `PATCH /users/:id`, `PATCH /users/:id/role`,
`GET /providers`, `PATCH /providers/:id`, `GET /offers`, `POST /offers/:id/approve|reject`,
`GET /activities`, `POST /activities/:id/approve|reject`

---

## Autenticación y roles

- **JWT** con par access + refresh. El access expira rápido (`JWT_EXPIRES_IN`, default `15m`);
  se renueva con `POST /api/auth/refresh` usando el refresh token (`JWT_REFRESH_EXPIRES_IN`, default `30d`).
- Enviar el access token en `Authorization: Bearer <token>`.
- Roles: **atleta**, **proveedor** y **admin**. El middleware `roles.middleware.js` restringe
  las rutas de admin y proveedor.
- Login federado: **Apple** y **Google**, más **2FA** y **magic link**.

---

## Tests

```bash
npm test            # corre todo
npm run coverage    # con reporte de cobertura
```

Suite con **Vitest** + **Supertest** (tests de integración HTTP) en `tests/`.

---

## Docker

```bash
docker compose up --build
```

> ⚠️ El `docker-compose.yml` incluido levanta un contenedor MySQL heredado de una versión previa.
> El backend actual usa **PostgreSQL** vía `DATABASE_URL`; para correr 100 % en local apuntá
> `DATABASE_URL` a un Postgres propio o a Supabase. Ajustá el `docker-compose.yml` a Postgres
> si querés la base containerizada.

La imagen (`Dockerfile`) usa `node:20-alpine`, instala solo dependencias de producción,
copia `src/` y `sql/`, expone el puerto `3000` y arranca con `node src/server.js`.

---

## Deploy

Configs listas para dos plataformas:

- **Railway** (`railway.toml`) — build con Dockerfile, healthcheck en `/api/health`.
- **Render** (`render.yaml`) — runtime Node, `npm start`, `DATABASE_URL` como secret y
  `JWT_SECRET` autogenerado.

> 🌐 **Importante (IPv6):** Railway, Render y Fly no tienen salida IPv6. El host directo de
> Supabase es IPv6-only, así que en estas plataformas hay que usar el **Transaction Pooler**
> de Supabase (IPv4) en `DATABASE_URL`. Ver el detalle en `.env.example`.

---

<div align="center">

*FitNow API — backend del ecosistema FitNow*

</div>
