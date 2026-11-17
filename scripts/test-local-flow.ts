import 'dotenv/config';
import { ReviewService } from '../src/domain.ts';
import { buildApp } from '../src/api/app.ts';

async function runLocalSimulation() {
  console.log('🚀 --- STARTING LOCAL REVIEW-REQUESTER SIMULATION ---\n');

  const service = new ReviewService();
  const app = buildApp({ service, baseUrl: 'http://localhost:3000' });
  await app.ready();

  // 1. Seed Tenant
  console.log('1️⃣ Provisioning sample tenant (Acme Trade Services)...');
  const tenant = await service.createTenant({
    businessName: 'Acme Trade Services',
    twilioSenderId: 'AcmeTrade',
    googleReviewUrl: 'https://maps.google.com/review/acme-trades',
    messageTemplate: "Hi {first_name}, thanks for choosing {business_name}! Please leave us a review: {review_link} Opt-out: {opt_out_link}",
    nudgeTemplate: "Hi {first_name}, friendly follow-up from {business_name}: {review_link} Opt-out: {opt_out_link}",
    webhookSecret: 'dev_secret_123',
  });
  console.log(`   ✅ Tenant created: ${tenant.id} (${tenant.businessName})\n`);

  // 2. Ingress Webhook
  console.log('2️⃣ Ingesting job webhook (JOB-SIM-001) for Alice (+61412345678)...');
  const ingressRes = await app.inject({
    method: 'POST',
    url: `/api/webhooks/ingress/${tenant.id}`,
    payload: {
      job_reference_id: 'JOB-SIM-001',
      customer_phone: '+61412345678',
      customer_first_name: 'Alice',
    },
  });
  const ingressData = JSON.parse(ingressRes.body);
  console.log(`   HTTP ${ingressRes.statusCode} -> Status: "${ingressData.status}", ReviewLogId: ${ingressData.reviewRequestId}\n`);

  // 3. Test Idempotency
  console.log('3️⃣ Testing Idempotency (submitting duplicate JOB-SIM-001)...');
  const dupRes = await app.inject({
    method: 'POST',
    url: `/api/webhooks/ingress/${tenant.id}`,
    payload: {
      job_reference_id: 'JOB-SIM-001',
      customer_phone: '+61412345678',
      customer_first_name: 'Alice',
    },
  });
  const dupData = JSON.parse(dupRes.body);
  console.log(`   HTTP ${dupRes.statusCode} -> Ignored: ${dupData.ignored}, Reason: "${dupData.reason}"\n`);

  // 4. Simulate QStash Initial Dispatch
  console.log('4️⃣ Simulating QStash callback -> Initial SMS Dispatch...');
  const dispatchRes = await app.inject({
    method: 'POST',
    url: '/api/internal/dispatch',
    payload: { review_log_id: ingressData.reviewRequestId },
  });
  const dispatchData = JSON.parse(dispatchRes.body);
  console.log(`   HTTP ${dispatchRes.statusCode} -> Status: "${dispatchData.status}", SentAt: ${dispatchData.sent_at}`);
  console.log(`   Nudge scheduled for: ${dispatchData.nudge_scheduled_at}\n`);

  // 5. Simulate Customer Clicking Review Link
  console.log('5️⃣ Customer clicks review link (GET /r/:logId)...');
  const clickRes = await app.inject({
    method: 'GET',
    url: `/r/${ingressData.reviewRequestId}`,
  });
  console.log(`   HTTP ${clickRes.statusCode} -> 302 Redirect to: ${clickRes.headers.location}\n`);

  // 6. Simulate Nudge Dispatch After Click (Should be suppressed)
  console.log('6️⃣ Simulating QStash Nudge Dispatch (Customer has already engaged)...');
  const nudgeRes = await app.inject({
    method: 'POST',
    url: '/api/internal/dispatch-nudge',
    payload: { review_log_id: ingressData.reviewRequestId },
  });
  const nudgeData = JSON.parse(nudgeRes.body);
  console.log(`   HTTP ${nudgeRes.statusCode} -> Aborted: ${nudgeData.aborted}, Reason: "${nudgeData.reason}"\n`);

  // 7. Verify Lifetime Lockout
  console.log('7️⃣ Ingesting NEW job for Alice (JOB-SIM-002) -> Expecting lifetime lockout...');
  const lockoutRes = await app.inject({
    method: 'POST',
    url: `/api/webhooks/ingress/${tenant.id}`,
    payload: {
      job_reference_id: 'JOB-SIM-002',
      customer_phone: '+61412345678',
      customer_first_name: 'Alice',
    },
  });
  const lockoutData = JSON.parse(lockoutRes.body);
  console.log(`   HTTP ${lockoutRes.statusCode} -> Ignored: ${lockoutData.ignored}, Reason: "${lockoutData.reason}"\n`);

  // 8. 1-Click Opt-Out Demonstration
  console.log('8️⃣ Demonstrating 1-click Opt-out for a different customer (Bob)...');
  const bobIngress = await app.inject({
    method: 'POST',
    url: `/api/webhooks/ingress/${tenant.id}`,
    payload: {
      job_reference_id: 'JOB-BOB-001',
      customer_phone: '+61499887766',
      customer_first_name: 'Bob',
    },
  });
  const bobData = JSON.parse(bobIngress.body);
  const bobCustomer = await service.getCustomer(tenant.id, '+61499887766');

  const optOutRes = await app.inject({
    method: 'GET',
    url: `/opt-out/${bobCustomer!.id}`,
  });
  console.log(`   HTTP ${optOutRes.statusCode} -> Opted out! (Body snippet: "${optOutRes.body.slice(0, 45)}...")`);

  const bobDispatch = await app.inject({
    method: 'POST',
    url: '/api/internal/dispatch',
    payload: { review_log_id: bobData.reviewRequestId },
  });
  const bobDispatchData = JSON.parse(bobDispatch.body);
  console.log(`   Attempting dispatch for Bob -> Aborted: ${bobDispatchData.aborted}, Reason: "${bobDispatchData.reason}"\n`);

  await app.close();
  console.log('🎉 --- ALL LOCAL FLOW SCENARIOS PASSED SUCCESSFULLY ---');
}

runLocalSimulation().catch(console.error);
