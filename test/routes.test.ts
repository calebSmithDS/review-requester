import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewService } from '../src/domain.ts';
import { buildApp } from '../src/api/app.ts';

describe('Fastify HTTP Endpoints (Surface Contract)', () => {
  let service: ReviewService;
  let app: any;
  let tenantId: string;

  before(async () => {
    service = new ReviewService();
    const tenant = await service.createTenant({
      businessName: 'Apex Roofing',
      twilioSenderId: 'ApexRoof',
      googleReviewUrl: 'https://maps.google.com/review/apex',
      messageTemplate: 'Review: {review_link}',
      nudgeTemplate: 'Nudge: {review_link}',
      webhookSecret: 'shhh'
    });
    tenantId = tenant.id;
    app = buildApp({ service });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  test('POST /api/webhooks/ingress/:tenantId queues review request with valid secret in header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      headers: {
        'x-trace-id': 'client_trace_123',
        'x-webhook-secret': 'shhh',
      },
      payload: {
        job_reference_id: 'JOB-HTTP-1',
        customer_phone: '+61411222333',
        customer_first_name: 'Harry'
      }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'queued');
    assert.ok(body.reviewRequestId);
  });

  test('POST /api/webhooks/ingress/:tenantId accepts secret via query parameter (ServiceM8 style)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}?secret=shhh`,
      payload: {
        job_reference_id: 'JOB-HTTP-SERVICEM8',
        customer_phone: '+61477889900',
        customer_first_name: 'Neville'
      }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'queued');
  });

  test('SECURITY: POST /api/webhooks/ingress/:tenantId rejects missing or invalid secret', async () => {
    // Missing secret
    const missingRes = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      payload: {
        job_reference_id: 'JOB-FAKE-1',
        customer_phone: '+61411111111',
      }
    });
    assert.equal(missingRes.statusCode, 401);
    assert.match(JSON.parse(missingRes.body).error, /unauthorized/i);

    // Wrong secret
    const wrongRes = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      headers: { 'x-webhook-secret': 'wrong_password' },
      payload: {
        job_reference_id: 'JOB-FAKE-2',
        customer_phone: '+61411111111',
      }
    });
    assert.equal(wrongRes.statusCode, 401);
  });

  test('POST /api/internal/dispatch sends initial SMS', async () => {
    const ingressRes = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      headers: { 'x-webhook-secret': 'shhh' },
      payload: {
        job_reference_id: 'JOB-HTTP-2',
        customer_phone: '+61422333444',
        customer_first_name: 'Hermione'
      }
    });
    const { reviewRequestId } = JSON.parse(ingressRes.body);

    const dispatchRes = await app.inject({
      method: 'POST',
      url: '/api/internal/dispatch',
      payload: { review_log_id: reviewRequestId }
    });

    assert.equal(dispatchRes.statusCode, 200);
    const body = JSON.parse(dispatchRes.body);
    assert.equal(body.status, 'sent');
  });

  test('GET /r/:logId redirects 302 to Google Review URL and marks clicked', async () => {
    const ingressRes = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      headers: { 'x-webhook-secret': 'shhh' },
      payload: {
        job_reference_id: 'JOB-HTTP-3',
        customer_phone: '+61433444555',
        customer_first_name: 'Ron'
      }
    });
    const { reviewRequestId } = JSON.parse(ingressRes.body);

    const clickRes = await app.inject({
      method: 'GET',
      url: `/r/${reviewRequestId}`
    });

    assert.equal(clickRes.statusCode, 302);
    assert.equal(clickRes.headers.location, 'https://maps.google.com/review/apex');
  });

  test('GET /opt-out/:customerId shows confirmation page and POST executes opt-out', async () => {
    const customer = await service.getCustomer(tenantId, '+61433444555');
    assert.ok(customer);

    // 1. GET request (e.g. link preview bot or user opening page) shows prompt without unsubscribing
    const landingRes = await app.inject({
      method: 'GET',
      url: `/opt-out/${customer.id}`
    });
    assert.equal(landingRes.statusCode, 200);
    assert.match(landingRes.body, /Confirm Opt-Out/i);

    const checkBefore = await service.getCustomer(tenantId, '+61433444555');
    assert.equal(checkBefore?.opted_out, false); // Still NOT unsubscribed!

    // 2. User clicks the button (POST)
    const optOutRes = await app.inject({
      method: 'POST',
      url: `/opt-out/${customer.id}`
    });

    assert.equal(optOutRes.statusCode, 200);
    assert.match(optOutRes.body, /unsubscribed/i);

    const updatedCustomer = await service.getCustomer(tenantId, '+61433444555');
    assert.equal(updatedCustomer?.opted_out, true);
  });

  test('SECURITY: Bot crawler User-Agent does not trigger click registration on GET /r/:logId', async () => {
    const ingressRes = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      headers: { 'x-webhook-secret': 'shhh' },
      payload: {
        job_reference_id: 'JOB-HTTP-BOT-TEST',
        customer_phone: '+61499001122',
        customer_first_name: 'Draco'
      }
    });
    const { reviewRequestId } = JSON.parse(ingressRes.body);

    // Simulate Apple iMessage or Twitter preview crawler hitting the link
    const botRes = await app.inject({
      method: 'GET',
      url: `/r/${reviewRequestId}`,
      headers: {
        'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      }
    });

    assert.equal(botRes.statusCode, 302); // Redirects bot safely
    const log = await service.trackingService['db'].getReviewLog(reviewRequestId);
    assert.equal(log?.status, 'queued'); // Status NOT mutated to 'clicked'!
    assert.ok(!log?.clickedAt); // clickedAt is undefined/null
  });

  test('SECURITY: POST /api/internal/dispatch rejects unauthorized requests when verifier is active', async () => {
    // Spin up an app with active QStash verification keys
    const secureApp = buildApp({
      service,
      verifier: new (await import('../src/api/middleware/qstash.ts')).QStashSignatureVerifier({
        currentSigningKey: 'sig_current_mock_key',
        nextSigningKey: 'sig_next_mock_key',
      }),
    });
    await secureApp.ready();

    // 1. Attempt unauthenticated call without signature header
    const unauthRes = await secureApp.inject({
      method: 'POST',
      url: '/api/internal/dispatch',
      payload: { review_log_id: 'rev_fake123' },
    });
    assert.equal(unauthRes.statusCode, 401);
    assert.match(JSON.parse(unauthRes.body).error, /Missing Upstash-Signature header/i);

    // 2. Attempt call with forged/invalid signature header
    const forgedRes = await secureApp.inject({
      method: 'POST',
      url: '/api/internal/dispatch',
      headers: {
        'upstash-signature': 'forged_fake_signature_abc',
      },
      payload: { review_log_id: 'rev_fake123' },
    });
    assert.equal(forgedRes.statusCode, 401);
    assert.match(JSON.parse(forgedRes.body).error, /Signature verification failed/i);

    await secureApp.close();
  });
});
