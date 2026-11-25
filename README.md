# SwapJob

SwapJob is a community skill-sharing web application where members can share what they know and find people to learn from.

A member can be both a learner and a mentor using the same account. Learning is voluntary, with no tuition payments or requirement to exchange skills directly with the same person.

## Demo and API Documentation

Public links will be added after deployment.

| Resource | Status |
| --- | --- |
| Website | Already deployed |
| API base URL | Already deployed |
| API documentation | Already deployed |

## Features

- **Accounts and profiles:** Register, log in, edit personal information, and upload an avatar.
- **Teaching skills:** Add skills and manage self-reported experience levels.
- **Mentor discovery:** Search by skill and view mentor profiles, availability, and reviews.
- **Availability:** Create time slots and view them in a weekly calendar using Vietnam time.
- **Booking requests:** Send, accept, reject, and cancel pending requests.
- **Sessions:** View upcoming, ongoing, and past learning sessions.
- **Reviews:** Submit a rating and optional comment after an eligible session's scheduled end time.
- **Notifications:** Receive booking updates and manage read states.
- **Languages:** Switch between Vietnamese and English.
- **Rewards demo:** Try a sample points balance and simulated reward redemption.

When a booking is accepted, the system creates a session and rejects other pending requests for the same slot. Database transactions and constraints protect booking consistency.

Expired availability slots are hidden from the calendar while their records remain in the database.

## Technology Stack

| Component | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, CSS |
| Backend | Python, FastAPI, Pydantic, Uvicorn |
| Database | PostgreSQL |
| Database access | SQLAlchemy, Psycopg |
| Authentication | JWT, pwdlib, Argon2 |
| Image processing | Pillow |

## Project Structure

```text
SwapJob/
├── backend/
│   ├── app/                 # API routes, authentication, and business logic
│   ├── database/            # Database initialization scripts
│   ├── .env.example         # Example backend configuration
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/                 # React pages, components, styles, and translations
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Getting Started

### Prerequisites

- Python compatible with `backend/requirements.txt`
- Node.js and npm compatible with `frontend/package.json`
- PostgreSQL
- Git
- pgAdmin or another PostgreSQL client

The commands below use Windows PowerShell.

### 1. Clone the repository

```powershell
git clone https://github.com/minhannne/SwapJob.git
cd SwapJob
```

### 2. Set up the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` with your database credentials:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=SwapJob
DB_USER=postgres
DB_PASSWORD="your_postgresql_password"
JWT_SECRET_KEY=replace_with_your_generated_secret
```

Generate a JWT secret with:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

Copy the generated value into `JWT_SECRET_KEY`. The secret must contain at least 32 bytes.

Keep the real `.env` file private. Only `.env.example` should be committed.

### 3. Initialize the database

Create a PostgreSQL database named `SwapJob` using pgAdmin or another PostgreSQL client.

Connect to that database and execute these scripts in order:

1. `backend/database/users_skills_schema.sql`
2. `backend/database/booking_sessions_schema.sql`

The scripts create the tables and constraints for accounts, skills, availability, bookings, sessions, reviews, and notifications.

Run them against a new database. They are initialization scripts, not repeatable migrations.

### 4. Start the backend

From the `backend` directory:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Keep this terminal running.

| Resource | Local URL |
| --- | --- |
| API base URL | http://127.0.0.1:8000/api |
| Swagger UI | http://127.0.0.1:8000/docs |
| API health check | http://127.0.0.1:8000/api/health |
| Database health check | http://127.0.0.1:8000/api/health/db |

Swagger UI documents the API endpoints, request bodies, and response models, and supports interactive requests.

### 5. Start the frontend

Open another terminal in the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open the address printed by Vite, normally:

```text
http://localhost:5173
```

During local development, Vite forwards `/api` requests to the backend. Both servers must remain running.

## Main User Workflow

1. Register an account and add a teaching skill.
2. Create a future availability slot.
3. Use another account to search for the skill and open the mentor's profile.
4. Select a slot and send a booking request.
5. Accept the request from the mentor account.
6. View the session and related notifications.
7. After the scheduled end time, submit a review from the learner account.

Each session allows one review. The reviewer must be its learner, the booking must remain accepted, and the session must not be cancelled.

## Development Checks

Run from the `frontend` directory:

```powershell
npm run lint
npm run build
```

Lint checks the configured code rules. Build checks TypeScript and generates production assets in `frontend/dist`.

These commands do not replace functional testing of the API, database, and user workflows.

## Deployment Notes

Production deployment needs a public frontend, a running FastAPI backend, and an online PostgreSQL database.

Before deployment:

- Configure database credentials and the JWT secret through hosting environment variables.
- Initialize the online database using the SQL scripts.
- Configure production API routing. The Vite development proxy does not apply to the production build.
- Include avatar requests when configuring `/api` routing.
- Configure CORS if the browser calls a backend on a different origin.
- Use persistent storage for uploaded avatars.
- Run the backend without development auto-reload.

## Current Limitations

- Rewards use frontend demo data and do not persist points or redemptions.
- Skills and experience levels are self-reported.
- Review eligibility does not verify actual attendance.
- Video calls and email notifications are not included.
- Password reset is not implemented.
- Reloading the application requires logging in again.
- Uploaded avatars currently use local backend storage.
- Database schema changes are not managed through versioned migrations.

