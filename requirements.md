# Context
We are building a multi-tenant "Review Requester" micro-service for trade businesses.
Tech Stack: Node.js, Fastify, TypeScript, Neon PostgreSQL, Drizzle ORM, Upstash QStash, Twilio.

# Core Requirements
1. Receive job completion webhooks from Job Management Systems (e.g., ServiceM8).
2. Schedule a delayed SMS to the customer asking for a Google Review.
3. Handle Idempotency (never process the same job ID twice).
4. Enforce a 90-day cooldown (never text the same customer twice within 90 days if they ignored the previous request).
5. Enforce a Do Not Disturb (DND) window (never send SMS between 8:00 PM and 8:00 AM local time).
6. Track Click-Through Rate (CTR) via a redirect endpoint.
7. Handle 1-click Opt-Outs.
8. Schedule a 3-day follow-up (Nudge) SMS for customers who do not click the initial link.
9. Enforce a lifetime lockout (never send a review request again if a customer has previously clicked the review link).

# Database Schema (Drizzle ORM)

Table: `tenants`
- `id`: uuid, primary key, defaultRandom
- `business_name`: text, not null
- `twilio_sender_id`: text, not null (Alphanumeric brand name)
- `google_review_url`: text, not null
- `message_template`: text, not null (Default: "Hi {first_name}, thanks for choosing {business_name}. If you were happy with our work, we'd love a quick review: {review_link} Opt-out: {opt_out_link}")
- `nudge_template`: text, not null (Default: "Hi {first_name}, just a quick follow-up! If you have a spare 60 seconds, we'd really appreciate a review on our recent work: {review_link} Opt-out: {opt_out_link}")
- `webhook_secret`: text, not null (For verifying incoming webhooks)
- `created_at`: timestamp

Table: `customers`
- `id`: uuid, primary key, defaultRandom
- `tenant_id`: uuid, references tenants(id)
- `phone_number`: text, not null (E.164 format)
- `first_name`: text
- `opted_out`: boolean, default false
- `clicked_review_link`: boolean, default false
- `created_at`: timestamp

Table: `review_logs`
- `id`: uuid, primary key, defaultRandom
- `tenant_id`: uuid, references tenants(id)
- `customer_id`: uuid, references customers(id)
- `job_reference_id`: text, not null, unique (Used for idempotency)
- `status`: text, enum ('queued', 'sent', 'clicked', 'nudge_sent')
- `sent_at`: timestamp
- `nudge_sent_at`: timestamp
- `clicked_at`: timestamp

# Route Definitions (Fastify)

1. `POST /api/webhooks/ingress/:tenantId`
- Description: Receives payload `{ job_reference_id, customer_phone, customer_first_name }`.
- Logic:
  - Verify tenant exists.
  - Check `review_logs` for `job_reference_id`. If exists -> Return 200 (Idempotency check).
  - Upsert `customers` table with `customer_phone`. 
  - Check if `opted_out == true`. If yes -> Return 200.
  - Check if `clicked_review_link == true`. If yes -> Return 200 (Lifetime Lockout: They already engaged in the past, abort).
  - Check `review_logs` for recent sends to this `customer_id`. If `sent_at` < 90 days -> Return 200 (Cooldown check).
  - Calculate Dispatch Time: Now + 2 hours. If Dispatch Time falls between 20:00 and 08:00, change Dispatch Time to 08:30 of the next valid morning [1].
  - Create `review_logs` record with status 'queued'.
  - Push message to Upstash QStash targeted at `/api/internal/dispatch` with `NotBefore` set to calculated Dispatch Time [1]. Payload must include `review_log_id`.

2. `POST /api/internal/dispatch`
- Description: Invoked by Upstash QStash to send the initial SMS.
- Logic:
  - Verify QStash signature.
  - Fetch `review_logs`, `customers`, and `tenants` records based on `review_log_id`.
  - Check if customer has opted out since queuing. If yes -> Abort.
  - Construct tracking link: `https://api.yourdomain.com/r/{review_log_id}`
  - Construct opt-out link: `https://api.yourdomain.com/opt-out/{customer_id}`
  - Parse `message_template` and inject variables.
  - Send via Twilio API using `twilio_sender_id`.
  - Update `review_logs` status to 'sent' and set `sent_at`.
  - Calculate Nudge Dispatch Time: Now + 3 days. (Apply same DND 20:00 to 08:00 logic to push to 08:30 next morning if needed).
  - Push message to Upstash QStash targeted at `/api/internal/dispatch-nudge` with `NotBefore` set to Nudge Dispatch Time [1]. Payload must include `review_log_id`.

3. `POST /api/internal/dispatch-nudge`
- Description: Invoked by Upstash QStash 3 days after initial SMS.
- Logic:
  - Verify QStash signature.
  - Fetch `review_logs` and joined `customers` and `tenants` records based on `review_log_id`.
  - Check if customer has `opted_out == true`. If yes -> Abort.
  - Check `review_logs.status`. If status is 'clicked' -> Abort (They already engaged).
  - Check `review_logs.status`. If status is 'nudge_sent' -> Abort (Idempotency).
  - Construct tracking link and opt-out link.
  - Parse `nudge_template` and inject variables.
  - Send via Twilio API using `twilio_sender_id`.
  - Update `review_logs`: set status to 'nudge_sent' and set `nudge_sent_at`.

4. `GET /r/:logId`
- Description: The CTR Tracking Redirect.
- Logic:
  - Fetch `review_logs` and joined `tenants` record.
  - Update `review_logs`: set status to 'clicked' and `clicked_at` to now.
  - Update `customers` table: set `clicked_review_link = true`.
  - HTTP 302 Redirect to the tenant's `google_review_url`.

5. `GET /opt-out/:customerId`
- Description: 1-click unsubscribe.
- Logic:
  - Update `customers` table, set `opted_out = true`.
  - Return simple HTML page: "You have been successfully unsubscribed."