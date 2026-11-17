import type { DatabaseAdapter } from '../db/adapter.ts';
import { calculateNudgeTime } from '../scheduler.ts';
import { renderTemplate } from '../utils/template.ts';
import type { SmsProvider } from './mock-twilio.service.ts';
import { MockTwilioSmsService } from './mock-twilio.service.ts';
import type { QStashSchedulerService } from './qstash.service.ts';

export class DispatchService {
  private db: DatabaseAdapter;
  private smsProvider: SmsProvider;
  private qstash?: QStashSchedulerService;
  private baseUrl: string;

  constructor(
    db: DatabaseAdapter,
    smsProvider?: SmsProvider,
    qstash?: QStashSchedulerService,
    baseUrl: string = 'http://localhost:3000'
  ) {
    this.db = db;
    this.smsProvider = smsProvider || new MockTwilioSmsService();
    this.qstash = qstash;
    this.baseUrl = baseUrl;
  }

  async dispatchInitial(reviewLogId: string): Promise<{
    status?: string;
    sent_at?: Date;
    nudge_scheduled_at?: Date;
    aborted?: boolean;
    reason?: string;
    messageSid?: string;
  }> {
    const log = await this.db.getReviewLog(reviewLogId);
    if (!log) throw new Error('Review log not found');

    const tenant = await this.db.getTenant(log.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const customer = await this.findCustomerById(log.customerId);
    if (!customer) throw new Error('Customer not found');

    if (customer.opted_out) {
      return { aborted: true, reason: 'opted_out' };
    }

    if (customer.clicked_review_link) {
      return { aborted: true, reason: 'already_clicked' };
    }

    // 1. Construct links
    const reviewLink = `${this.baseUrl}/r/${reviewLogId}`;
    const optOutLink = `${this.baseUrl}/opt-out/${customer.id}`;

    // 2. Format SMS body
    const body = renderTemplate(tenant.messageTemplate, {
      first_name: customer.firstName,
      business_name: tenant.businessName,
      review_link: reviewLink,
      opt_out_link: optOutLink,
    });

    // 3. Send SMS via Twilio provider
    const { messageSid } = await this.smsProvider.sendSms({
      to: customer.phoneNumber,
      from: tenant.twilioSenderId,
      body,
    });

    const sentAt = new Date();
    const nudgeScheduledAt = calculateNudgeTime(sentAt);

    // 4. Update status to sent
    await this.db.updateReviewLog(reviewLogId, {
      status: 'sent',
      sentAt,
      nudgeScheduledAt,
    });

    // 5. Schedule nudge with QStash if enabled
    if (this.qstash) {
      await this.qstash.scheduleNudgeDispatch(reviewLogId, nudgeScheduledAt);
    }

    return {
      status: 'sent',
      sent_at: sentAt,
      nudge_scheduled_at: nudgeScheduledAt,
      messageSid,
    };
  }

  async dispatchNudge(reviewLogId: string): Promise<{
    status?: string;
    nudge_sent_at?: Date;
    aborted?: boolean;
    reason?: string;
    messageSid?: string;
  }> {
    const log = await this.db.getReviewLog(reviewLogId);
    if (!log) throw new Error('Review log not found');

    const tenant = await this.db.getTenant(log.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const customer = await this.findCustomerById(log.customerId);
    if (!customer) throw new Error('Customer not found');

    if (customer.opted_out) {
      return { aborted: true, reason: 'opted_out' };
    }

    if (log.status === 'clicked' || customer.clicked_review_link) {
      return { aborted: true, reason: 'already_engaged' };
    }

    if (log.status === 'nudge_sent') {
      return { aborted: true, reason: 'idempotent_duplicate' };
    }

    // Atomic claim: if the customer clicked or another worker fired in the last few ms, claim fails
    const claimed = await this.db.claimNudgeDispatch(reviewLogId);
    if (!claimed) {
      return { aborted: true, reason: 'already_engaged' };
    }

    // 1. Construct links
    const reviewLink = `${this.baseUrl}/r/${reviewLogId}`;
    const optOutLink = `${this.baseUrl}/opt-out/${customer.id}`;

    // 2. Format Nudge SMS body
    const body = renderTemplate(tenant.nudgeTemplate, {
      first_name: customer.firstName,
      business_name: tenant.businessName,
      review_link: reviewLink,
      opt_out_link: optOutLink,
    });

    // 3. Send via Twilio
    const { messageSid } = await this.smsProvider.sendSms({
      to: customer.phoneNumber,
      from: tenant.twilioSenderId,
      body,
    });

    return {
      status: 'nudge_sent',
      nudge_sent_at: new Date(),
      messageSid,
    };
  }

  private async findCustomerById(customerId: string) {
    const adapter = this.db as any;
    if (adapter.customersById) {
      return adapter.customersById.get(customerId) || null;
    }
    if (adapter.db) {
      const schema = await import('../db/schema.ts');
      const { eq } = await import('drizzle-orm');
      const rows = await adapter.db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);
      if (!rows.length) return null;
      const c = rows[0];
      return {
        id: c.id,
        tenantId: c.tenantId,
        phoneNumber: c.phoneNumber,
        firstName: c.firstName,
        opted_out: c.optedOut,
        clicked_review_link: c.clickedReviewLink,
        createdAt: c.createdAt,
      };
    }
    return null;
  }
}
