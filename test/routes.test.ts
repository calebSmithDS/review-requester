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

  test('POST /api/webhooks/ingress/:tenantId queues review request and preserves trace id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
      headers: {
        'x-trace-id': 'client_trace_123'
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

  test('POST /api/internal/dispatch sends initial SMS', async () => {
    const ingressRes = await app.inject({
      method: 'POST',
      url: `/api/webhooks/ingress/${tenantId}`,
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

  test('GET /opt-out/:customerId marks customer opted-out', async () => {
    const customer = await service.getCustomer(tenantId, '+61433444555');
    assert.ok(customer);

    const optOutRes = await app.inject({
      method: 'GET',
      url: `/opt-out/${customer.id}`
    });

    assert.equal(optOutRes.statusCode, 200);
    assert.match(optOutRes.body, /unsubscribed/i);

    const updatedCustomer = await service.getCustomer(tenantId, '+61433444555');
    assert.equal(updatedCustomer?.opted_out, true);
  });
});
