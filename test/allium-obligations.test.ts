import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import domain logic/types to test against spec obligations
// These imports will fail or test assertions will fail until implementation is added
// @ts-ignore - pending implementation
import { 
  ReviewService, 
  CONFIG, 
  calculateDispatchTime, 
  calculateNudgeTime 
} from '../src/domain.ts';

describe('Allium Spec Obligations: Review Requester', () => {

  describe('Config Defaults', () => {
    test('config-default: dispatch_delay, nudge_delay, cooldown_period, DND', () => {
      assert.equal(CONFIG.dispatch_delay_ms, 2 * 60 * 60 * 1000, '2 hours');
      assert.equal(CONFIG.nudge_delay_ms, 3 * 24 * 60 * 60 * 1000, '3 days');
      assert.equal(CONFIG.cooldown_period_ms, 90 * 24 * 60 * 60 * 1000, '90 days');
      assert.equal(CONFIG.dnd_start_hour, 20);
      assert.equal(CONFIG.dnd_end_hour, 8);
      assert.equal(CONFIG.morning_dispatch_hour, 8);
      assert.equal(CONFIG.morning_dispatch_minute, 30);
    });
  });

  describe('DND Window Scheduling (Do Not Disturb 20:00 - 08:00)', () => {
    test('if dispatch falls during daytime (e.g. 14:00), schedule 2 hours later (16:00)', () => {
      const now = new Date('2026-11-17T14:00:00');
      const dispatchAt = calculateDispatchTime(now);
      assert.equal(dispatchAt.getHours(), 16);
      assert.equal(dispatchAt.getMinutes(), 0);
      assert.equal(dispatchAt.getDate(), 17);
    });

    test('if dispatch falls between 20:00 and 08:00 (e.g. now = 19:00 -> dispatch = 21:00), shift to 08:30 next morning', () => {
      // Local time evening
      const now = new Date('2026-11-17T19:00:00');
      const dispatchAt = calculateDispatchTime(now);
      assert.equal(dispatchAt.getHours(), 8);
      assert.equal(dispatchAt.getMinutes(), 30);
      assert.equal(dispatchAt.getDate(), 18);
    });

    test('if now is early morning (e.g. 05:00 -> dispatch = 07:00), shift to 08:30 same morning', () => {
      const now = new Date('2026-11-17T05:00:00');
      const dispatchAt = calculateDispatchTime(now);
      assert.equal(dispatchAt.getHours(), 8);
      assert.equal(dispatchAt.getMinutes(), 30);
      assert.equal(dispatchAt.getDate(), 17);
    });
  });

  describe('Rules & State Transitions', () => {
    test('HandleJobIngress: new customer creates customer and queued review request', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Hi {first_name}, review: {review_link} Opt-out: {opt_out_link}',
        nudgeTemplate: 'Hi {first_name}, nudge review: {review_link} Opt-out: {opt_out_link}',
        webhookSecret: 'secret123'
      });

      const res = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-101',
        customerPhone: '+61412345678',
        customerFirstName: 'Alice'
      });

      assert.equal(res.status, 'queued');
      assert.ok(res.reviewRequestId);

      const customer = await service.getCustomer(tenant.id, '+61412345678');
      assert.ok(customer);
      assert.equal(customer.opted_out, false);
      assert.equal(customer.clicked_review_link, false);
    });

    test('HandleJobIngress: Idempotency by job_reference_id', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Review: {review_link}',
        nudgeTemplate: 'Nudge: {review_link}',
        webhookSecret: 'secret'
      });

      const first = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-SAME',
        customerPhone: '+61400000001',
        customerFirstName: 'Bob'
      });
      assert.equal(first.status, 'queued');

      // Duplicate job ID should be ignored/idempotent
      const second = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-SAME',
        customerPhone: '+61400000001',
        customerFirstName: 'Bob'
      });
      assert.equal(second.ignored, true);
    });

    test('Customer Lockout: 90-day cooldown enforces ignore if request sent within 90 days', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Review: {review_link}',
        nudgeTemplate: 'Nudge: {review_link}',
        webhookSecret: 'secret'
      });

      const first = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-OLD',
        customerPhone: '+61400000002',
        customerFirstName: 'Charlie'
      });
      assert.ok(first.reviewRequestId);
      await service.markSent(first.reviewRequestId!, new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));

      // Attempt new job ingress for same customer
      const second = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-NEW',
        customerPhone: '+61400000002',
        customerFirstName: 'Charlie'
      });
      assert.equal(second.ignored, true);
      assert.equal(second.reason, 'cooldown');
    });

    test('Customer Lockout: Lifetime lockout if clicked_review_link == true', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Review: {review_link}',
        nudgeTemplate: 'Nudge: {review_link}',
        webhookSecret: 'secret'
      });

      const first = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-CLICKED',
        customerPhone: '+61400000003',
        customerFirstName: 'David'
      });
      assert.ok(first.reviewRequestId);
      await service.markSent(first.reviewRequestId!, new Date());
      await service.handleCustomerClick(first.reviewRequestId!);

      // Attempt new job ingress
      const nextJob = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-NEXT',
        customerPhone: '+61400000003',
        customerFirstName: 'David'
      });
      assert.equal(nextJob.ignored, true);
      assert.equal(nextJob.reason, 'lifetime_lockout');
    });

    test('Customer Lockout: Opted out customer receives no messages', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Review: {review_link}',
        nudgeTemplate: 'Nudge: {review_link}',
        webhookSecret: 'secret'
      });

      const first = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-OPT',
        customerPhone: '+61400000004',
        customerFirstName: 'Eve'
      });

      const customer = await service.getCustomer(tenant.id, '+61400000004');
      assert.ok(customer);
      await service.handleOptOut(customer!.id);

      // Try sending dispatch
      assert.ok(first.reviewRequestId);
      const dispatchRes = await service.dispatchInitial(first.reviewRequestId!);
      assert.equal(dispatchRes.aborted, true);
      assert.equal(dispatchRes.reason, 'opted_out');
    });

    test('State transition: queued -> sent -> nudge_sent', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Review: {review_link}',
        nudgeTemplate: 'Nudge: {review_link}',
        webhookSecret: 'secret'
      });

      const ingress = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-TRANS',
        customerPhone: '+61400000005',
        customerFirstName: 'Frank'
      });

      assert.ok(ingress.reviewRequestId);
      const dispatch = await service.dispatchInitial(ingress.reviewRequestId!);
      assert.equal(dispatch.status, 'sent');
      assert.ok(dispatch.sent_at);
      assert.ok(dispatch.nudge_scheduled_at);

      const nudge = await service.dispatchNudge(ingress.reviewRequestId!);
      assert.equal(nudge.status, 'nudge_sent');
      assert.ok(nudge.nudge_sent_at);
    });

    test('CTR Redirect: clicking sets clicked_at, status=clicked, and redirects to tenant review url', async () => {
      const service = new ReviewService();
      const tenant = await service.createTenant({
        businessName: 'Ace Plumbing',
        twilioSenderId: 'AcePlumb',
        googleReviewUrl: 'https://g.page/ace/review',
        messageTemplate: 'Review: {review_link}',
        nudgeTemplate: 'Nudge: {review_link}',
        webhookSecret: 'secret'
      });

      const ingress = await service.handleIngress({
        tenantId: tenant.id,
        jobReferenceId: 'JOB-CTR',
        customerPhone: '+61400000006',
        customerFirstName: 'Grace'
      });
      assert.ok(ingress.reviewRequestId);
      await service.dispatchInitial(ingress.reviewRequestId!);

      const clickResult = await service.handleCustomerClick(ingress.reviewRequestId!);
      assert.equal(clickResult.status, 'clicked');
      assert.equal(clickResult.redirectUrl, 'https://g.page/ace/review');

      const customer = await service.getCustomer(tenant.id, '+61400000006');
      assert.ok(customer);
      assert.equal(customer!.clicked_review_link, true);

      // Subsequent nudge must abort because status is 'clicked'
      const nudgeRes = await service.dispatchNudge(ingress.reviewRequestId!);
      assert.equal(nudgeRes.aborted, true);
      assert.equal(nudgeRes.reason, 'already_engaged');
    });
  });
});
