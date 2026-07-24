# RKNexora Backend

## Setup
1. Copy `.env.example` to `.env` and configure MySQL/JWT.
2. Run `mysql -u root -p < database/migration.sql`.
3. Run `npm install` and `npm run dev`.

## Main endpoints
- `POST /api/auth/login`, `/register`, `/forgot-password`
- Admin CRUD: `/api/admin/colleges|mentors|students`
- Bulk: `POST /api/admin/bulk/process`, `GET /api/admin/bulk/status/:jobUuid`
- College import: `POST /api/college/upload` multipart field `file`
- Student registration/learning/logbook/project/report routes
- Simulated payment: `POST /api/payments/webhook`

## Bulk request examples
```json
{"type":"attendance","payload":{"college_id":1,"session":"2025-28","semester":"2","start_date":"2026-07-01","end_date":"2026-07-31","status":"present"}}
```
```json
{"type":"complete_learning","payload":{"college_id":1,"session":"2025-28","semester":"2"}}
```
```json
{"type":"certificates","payload":{"student_ids":[1,2,3]}}
```
```json
{"type":"zip_documents","payload":{"college_id":1}}
```

The included runner is asynchronous inside the Node process and persists progress in `bulk_jobs`. For multi-instance production deployment, replace it with Redis/BullMQ while keeping the same service interface.
