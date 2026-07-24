# Initial Admin Setup

1. Copy `.env.example` to `.env`.
2. Set `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Run database migration.
4. Run `npm run seed:admin` once.
5. Login from the frontend `/login` page using admin email/username and password.

The seed command is idempotent: running it again updates the same admin account password and keeps it active.
