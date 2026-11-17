/**
 * Configuration defaults matching Allium spec
 */
export const CONFIG = {
  dispatch_delay_ms: 2 * 60 * 60 * 1000, // 2 hours
  nudge_delay_ms: 3 * 24 * 60 * 60 * 1000, // 3 days
  cooldown_period_ms: 90 * 24 * 60 * 60 * 1000, // 90 days
  dnd_start_hour: 20,
  dnd_end_hour: 8,
  morning_dispatch_hour: 8,
  morning_dispatch_minute: 30,
};

/**
 * Calculates dispatch time enforcing Do Not Disturb (DND) window:
 * Delay = 2 hours. If target time falls between 20:00 and 08:00 local time,
 * shift target time to 08:30 of the next morning.
 */
export function calculateDispatchTime(from: Date = new Date()): Date {
  const target = new Date(from.getTime() + CONFIG.dispatch_delay_ms);
  const hour = target.getHours();

  // If between 20:00 (inclusive) and 08:00 (exclusive)
  if (hour >= CONFIG.dnd_start_hour || hour < CONFIG.dnd_end_hour) {
    const nextMorning = new Date(target.getTime());
    if (hour >= CONFIG.dnd_start_hour) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }
    nextMorning.setHours(CONFIG.morning_dispatch_hour, CONFIG.morning_dispatch_minute, 0, 0);
    return nextMorning;
  }

  return target;
}

/**
 * Calculates nudge dispatch time enforcing DND window:
 * Delay = 3 days. If target time falls between 20:00 and 08:00,
 * shift to 08:30 of the next morning.
 */
export function calculateNudgeTime(from: Date = new Date()): Date {
  const target = new Date(from.getTime() + CONFIG.nudge_delay_ms);
  const hour = target.getHours();

  if (hour >= CONFIG.dnd_start_hour || hour < CONFIG.dnd_end_hour) {
    const nextMorning = new Date(target.getTime());
    if (hour >= CONFIG.dnd_start_hour) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }
    nextMorning.setHours(CONFIG.morning_dispatch_hour, CONFIG.morning_dispatch_minute, 0, 0);
    return nextMorning;
  }

  return target;
}

export interface Tenant {
  id: string;
  businessName: string;
  twilioSenderId: string;
  googleReviewUrl: string;
  messageTemplate: string;
  nudgeTemplate: string;
  webhookSecret: string;
  createdAt: Date;
}

export interface Customer {
  id: string;
  tenantId: string;
  phoneNumber: string;
  firstName?: string | null;
  opted_out: boolean;
  clicked_review_link: boolean;
  createdAt: Date;
}

export type ReviewStatus = 'queued' | 'sent' | 'clicked' | 'nudge_sent';

export interface ReviewLog {
  id: string;
  tenantId: string;
  customerId: string;
  jobReferenceId: string;
  status: ReviewStatus;
  scheduledDispatchAt: Date;
  sentAt?: Date | null;
  nudgeScheduledAt?: Date | null;
  nudgeSentAt?: Date | null;
  clickedAt?: Date | null;
}

export class ReviewService {
  private tenants = new Map<string, Tenant>();
  private customers = new Map<string, Customer>(); // key: `${tenantId}:${phoneNumber}`
  private reviewLogs = new Map<string, ReviewLog>(); // key: id
  private jobIndex = new Map<string, string>(); // key: `${tenantId}:${jobReferenceId}` -> reviewLogId

  async createTenant(data: {
    businessName: string;
    twilioSenderId: string;
    googleReviewUrl: string;
    messageTemplate: string;
    nudgeTemplate: string;
    webhookSecret: string;
  }): Promise<Tenant> {
    const id = `tenant_${Math.random().toString(36).slice(2, 9)}`;
    const tenant: Tenant = {
      id,
      ...data,
      createdAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  async getCustomer(tenantId: string, phoneNumber: string): Promise<Customer | null> {
    return this.customers.get(`${tenantId}:${phoneNumber}`) || null;
  }

  async handleIngress(params: {
    tenantId: string;
    jobReferenceId: string;
    customerPhone: string;
    customerFirstName?: string;
  }): Promise<{ status?: string; reviewRequestId?: string; ignored?: boolean; reason?: string }> {
    const tenant = this.tenants.get(params.tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${params.tenantId} not found`);
    }

    // 1. Idempotency check: jobReferenceId
    const jobKey = `${params.tenantId}:${params.jobReferenceId}`;
    if (this.jobIndex.has(jobKey)) {
      return { ignored: true, reason: 'idempotent_duplicate' };
    }

    // 2. Upsert / find Customer
    const customerKey = `${params.tenantId}:${params.customerPhone}`;
    let customer = this.customers.get(customerKey);
    if (!customer) {
      customer = {
        id: `cust_${Math.random().toString(36).slice(2, 9)}`,
        tenantId: params.tenantId,
        phoneNumber: params.customerPhone,
        firstName: params.customerFirstName || null,
        opted_out: false,
        clicked_review_link: false,
        createdAt: new Date(),
      };
      this.customers.set(customerKey, customer);
    }

    // 3. Opt-out check
    if (customer.opted_out) {
      return { ignored: true, reason: 'opted_out' };
    }

    // 4. Lifetime lockout check
    if (customer.clicked_review_link) {
      return { ignored: true, reason: 'lifetime_lockout' };
    }

    // 5. 90-day Cooldown check
    const now = Date.now();
    for (const log of this.reviewLogs.values()) {
      if (log.customerId === customer.id && log.sentAt) {
        if (now - log.sentAt.getTime() < CONFIG.cooldown_period_ms) {
          return { ignored: true, reason: 'cooldown' };
        }
      }
    }

    // 6. Calculate Dispatch Time with DND
    const scheduledDispatchAt = calculateDispatchTime(new Date());

    // 7. Create review_logs record with status 'queued'
    const reviewLogId = `log_${Math.random().toString(36).slice(2, 9)}`;
    const reviewLog: ReviewLog = {
      id: reviewLogId,
      tenantId: params.tenantId,
      customerId: customer.id,
      jobReferenceId: params.jobReferenceId,
      status: 'queued',
      scheduledDispatchAt,
    };

    this.reviewLogs.set(reviewLogId, reviewLog);
    this.jobIndex.set(jobKey, reviewLogId);

    return {
      status: 'queued',
      reviewRequestId: reviewLogId,
    };
  }

  async markSent(reviewLogId: string, sentAt: Date = new Date()): Promise<void> {
    const log = this.reviewLogs.get(reviewLogId);
    if (log) {
      log.status = 'sent';
      log.sentAt = sentAt;
    }
  }

  async dispatchInitial(reviewLogId: string): Promise<{ status?: string; sent_at?: Date; nudge_scheduled_at?: Date; aborted?: boolean; reason?: string }> {
    const log = this.reviewLogs.get(reviewLogId);
    if (!log) throw new Error('Review log not found');

    const customer = Array.from(this.customers.values()).find((c) => c.id === log.customerId);
    if (!customer) throw new Error('Customer not found');

    if (customer.opted_out) {
      return { aborted: true, reason: 'opted_out' };
    }

    if (customer.clicked_review_link) {
      return { aborted: true, reason: 'already_clicked' };
    }

    const sentAt = new Date();
    const nudgeScheduledAt = calculateNudgeTime(sentAt);

    log.status = 'sent';
    log.sentAt = sentAt;
    log.nudgeScheduledAt = nudgeScheduledAt;

    return {
      status: 'sent',
      sent_at: sentAt,
      nudge_scheduled_at: nudgeScheduledAt,
    };
  }

  async dispatchNudge(reviewLogId: string): Promise<{ status?: string; nudge_sent_at?: Date; aborted?: boolean; reason?: string }> {
    const log = this.reviewLogs.get(reviewLogId);
    if (!log) throw new Error('Review log not found');

    const customer = Array.from(this.customers.values()).find((c) => c.id === log.customerId);
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

    const nudgeSentAt = new Date();
    log.status = 'nudge_sent';
    log.nudgeSentAt = nudgeSentAt;

    return {
      status: 'nudge_sent',
      nudge_sent_at: nudgeSentAt,
    };
  }

  async handleCustomerClick(reviewLogId: string): Promise<{ status: string; redirectUrl: string }> {
    const log = this.reviewLogs.get(reviewLogId);
    if (!log) throw new Error('Review log not found');

    const tenant = this.tenants.get(log.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const customer = Array.from(this.customers.values()).find((c) => c.id === log.customerId);
    if (customer) {
      customer.clicked_review_link = true;
    }

    log.status = 'clicked';
    log.clickedAt = new Date();

    return {
      status: 'clicked',
      redirectUrl: tenant.googleReviewUrl,
    };
  }

  async handleOptOut(customerId: string): Promise<{ success: boolean }> {
    const customer = Array.from(this.customers.values()).find((c) => c.id === customerId);
    if (customer) {
      customer.opted_out = true;
      return { success: true };
    }
    return { success: false };
  }
}
