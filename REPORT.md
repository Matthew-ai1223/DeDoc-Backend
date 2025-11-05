## DeDoc Backend Report

### Overview
DeDoc backend is a Node.js/Express API backed by MongoDB, providing authentication, email notifications, and Paystack-powered subscriptions. It exposes REST endpoints for user auth, payment initialization/verification, subscription status, and access control.

### Tech Stack
- Node.js + Express
- MongoDB + Mongoose
- JWT for auth
- Nodemailer for email
- Paystack SDK/HTTP for payments
- CORS, dotenv

### Project Structure
```
backends/
  package.json
  README.md
  REPORT.md  ← this file
  nixpacks.toml
  sec/
    index.js                  # Express app entry
    routes/
      auth.routes.js          # /api/auth/*
      subscription.routes.js  # /api/subscription/* (preferred)
      payment.routes.js       # /api/payments/* (alternate)
      subscription.verification.routes.js # deprecated
    controllers/
      auth.controller.js
      subscription.controller.js
      payment.controller.js
      subscriptions.verification.js       # deprecated flow
    middleware/
      auth.middleware.js      # protect()
      auth.js                 # legacy token check
    models/
      User.js
      Payment.js
      Subscription.js         # normalized alt model
    config/, utils/           # (reserved/empty)
  dataset/
    *.json                    # domain datasets (not served by API)
```

### Environment Variables (.env)
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/dedoc_db
JWT_SECRET=your_jwt_secret_key
FRONTEND_URL=http://localhost:3000

# Paystack
PAYSTACK_SECRET_KEY=your_paystack_secret_key

# Email (SMTP)
SMTP_HOST=smtp.yourhost.com
SMTP_PORT=587
SMTP_USERNAME=your_smtp_username
SMTP_PASSWORD=your_smtp_password
EMAIL_USER=from_address@example.com
EMAIL_FROM_NAME=DeDoc
# Optional DKIM
DOMAIN_NAME=example.com
DKIM_SELECTOR=default
DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

### How to Run
1) Install dependencies: `npm install`
2) Create `.env` with the values above
3) Development server: `npm run dev`
4) Production server: `npm start`

### API Endpoints
Auth (`/api/auth`)
- POST `/register` → Create account, send welcome email, return JWT
- POST `/login` → Authenticate, return JWT

Subscriptions (preferred, `/api/subscription`, requires Bearer token)
- POST `/initialize` → Start Paystack transaction for a plan
- GET `/status` → Current subscription status and time remaining
- GET `/check-access?page=<file.html>` → Whether plan allows requested page
- GET `/admin-data` → Aggregated user/payments stats (secure this in production)

Payments (alternate, `/api/payments`, legacy middleware)
- POST `/initialize` → Initialize payment, create pending Payment record
- GET `/verify?reference=...` → Verify with Paystack, activate subscription
- GET `/status` → Alias to subscription status
- GET `/details?reference=...` → Fetch stored Payment details

Deprecated
- `/api/subscription/verification/*` → Old flow using `Subscription` model

### Request Lifecycle
1. Register → `/api/auth/register` → user saved (pwd hashed) → welcome email → JWT
2. Login → `/api/auth/login` → JWT
3. Initialize payment → `/api/subscription/initialize` with `{ plan }` → receive Paystack authorization URL + `reference`
4. Complete payment on Paystack → Frontend verifies using `reference`
5. Verify payment → preferred: controller `verifyPayment` (see notes) or alternate: `/api/payments/verify` → mark success → set `user.subscription` dates
6. Check status/access → `/api/subscription/status`, `/api/subscription/check-access`

### Plans and Access (subscription.controller)
- basic: ₦50, 1 hour; pages: `std.html`, `p_c.html`
- standard: ₦450, 1 week; adds `therapist_alice.html`
- premium: ₦850, 2 weeks; adds `doc_John.html`, `ai_doc_dashboard.html`, `health_reports.html`
- pro: ₦1,600, 1 month; adds `emergency_support.html`

### Data Models
User
- Identity fields, `password` (bcrypt hashed), `subscription` { plan, startDate, endDate }

Payment
- `userId`, `reference` (unique), `amount`, `plan`, `status` (pending/success/failed)
- Auto-computes `subscriptionStart`/`subscriptionEnd` based on plan

Subscription (deprecated flow)
- Normalized record linking `userId` and `paymentId`, with plan and dates

### Security
- JWT auth via `Authorization: Bearer <token>`
- Password hashing with bcrypt
- CORS enabled
- Secrets via `.env`

### Operational Notes
- Two overlapping flows exist: `/api/subscription/*` (preferred) and `/api/payments/*` (alternate). Choose one and align middleware to `protect`.
- `subscription.verification.routes.js` is marked deprecated.
- Protect `/admin-data` with proper admin authorization in production.
- Ensure `FRONTEND_URL` matches your deployed frontend for Paystack callbacks.

### Troubleshooting
- Mongo connection issues: verify `MONGODB_URI`
- 401 errors: ensure valid JWT in `Authorization` header
- Email failures: verify SMTP settings; port 587 uses STARTTLS (secure=false in transporter config)
- Paystack issues: confirm `PAYSTACK_SECRET_KEY` and callback URL; inspect logs

### Deployment
- Nixpacks: `nixpacks.toml` installs Node and runs `npm install`
- Provide environment variables securely in your host/platform settings


