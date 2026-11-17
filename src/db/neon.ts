import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema.ts';
import type { DatabaseAdapter } from './adapter.ts';
import type { Tenant, Customer, ReviewLog } from '../types.ts';
import { eq, and, desc, isNull, isNotNull, sql } from 'drizzle-orm';
import { genId } from '../utils/id.ts';

export class NeonDatabaseAdapter implements DatabaseAdapter {
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(connectionString: string) {
    const pool = new Pool({ connectionString });
    this.db = drizzle(pool, { schema });
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(schema.tenants).where(eq(schema.tenants.id, id)).limit(1);
    if (!rows.length) return null;
    const t = rows[0];
    return {
      id: t.id,
      businessName: t.businessName,
      twilioSenderId: t.twilioSenderId,
      googleReviewUrl: t.googleReviewUrl,
      messageTemplate: t.messageTemplate,
      nudgeTemplate: t.nudgeTemplate,
      webhookSecret: t.webhookSecret,
      createdAt: t.createdAt,
    };
  }

  async createTenant(data: Omit<Tenant, 'id' | 'createdAt'>): Promise<Tenant> {
    const id = genId('ten');
    const rows = await this.db.insert(schema.tenants).values({ id, ...data }).returning();
    const t = rows[0];
    return {
      id: t.id,
      businessName: t.businessName,
      twilioSenderId: t.twilioSenderId,
      googleReviewUrl: t.googleReviewUrl,
      messageTemplate: t.messageTemplate,
      nudgeTemplate: t.nudgeTemplate,
      webhookSecret: t.webhookSecret,
      createdAt: t.createdAt,
    };
  }

  async getCustomer(tenantId: string, phoneNumber: string): Promise<Customer | null> {
    const rows = await this.db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.phoneNumber, phoneNumber)))
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

  async upsertCustomer(
    tenantId: string,
    phoneNumber: string,
    firstName?: string | null
  ): Promise<Customer> {
    const id = genId('cus');
    const rows = await this.db
      .insert(schema.customers)
      .values({
        id,
        tenantId,
        phoneNumber,
        firstName: firstName || null,
        optedOut: false,
        clickedReviewLink: false,
      })
      .onConflictDoUpdate({
        target: [schema.customers.tenantId, schema.customers.phoneNumber],
        set: {
          ...(firstName ? { firstName } : {}),
        },
      })
      .returning();

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

  async setCustomerOptOut(customerId: string, optedOut: boolean): Promise<void> {
    await this.db
      .update(schema.customers)
      .set({ optedOut })
      .where(eq(schema.customers.id, customerId));
  }

  async setCustomerClicked(customerId: string, clicked: boolean): Promise<void> {
    await this.db
      .update(schema.customers)
      .set({ clickedReviewLink: clicked })
      .where(eq(schema.customers.id, customerId));
  }

  async getReviewLog(id: string): Promise<ReviewLog | null> {
    const rows = await this.db
      .select()
      .from(schema.reviewLogs)
      .where(eq(schema.reviewLogs.id, id))
      .limit(1);

    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      jobReferenceId: r.jobReferenceId,
      status: r.status as ReviewLog['status'],
      scheduledDispatchAt: r.scheduledDispatchAt,
      sentAt: r.sentAt,
      nudgeScheduledAt: r.nudgeScheduledAt,
      nudgeSentAt: r.nudgeSentAt,
      clickedAt: r.clickedAt,
    };
  }

  async getReviewLogByJob(tenantId: string, jobReferenceId: string): Promise<ReviewLog | null> {
    const rows = await this.db
      .select()
      .from(schema.reviewLogs)
      .where(
        and(
          eq(schema.reviewLogs.tenantId, tenantId),
          eq(schema.reviewLogs.jobReferenceId, jobReferenceId)
        )
      )
      .limit(1);

    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      jobReferenceId: r.jobReferenceId,
      status: r.status as ReviewLog['status'],
      scheduledDispatchAt: r.scheduledDispatchAt,
      sentAt: r.sentAt,
      nudgeScheduledAt: r.nudgeScheduledAt,
      nudgeSentAt: r.nudgeSentAt,
      clickedAt: r.clickedAt,
    };
  }

  async getRecentCustomerLogs(customerId: string): Promise<ReviewLog[]> {
    const rows = await this.db
      .select()
      .from(schema.reviewLogs)
      .where(eq(schema.reviewLogs.customerId, customerId))
      .orderBy(desc(schema.reviewLogs.scheduledDispatchAt));

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      jobReferenceId: r.jobReferenceId,
      status: r.status as ReviewLog['status'],
      scheduledDispatchAt: r.scheduledDispatchAt,
      sentAt: r.sentAt,
      nudgeScheduledAt: r.nudgeScheduledAt,
      nudgeSentAt: r.nudgeSentAt,
      clickedAt: r.clickedAt,
    }));
  }

  async getLastSentCustomerLog(customerId: string): Promise<ReviewLog | null> {
    const rows = await this.db
      .select()
      .from(schema.reviewLogs)
      .where(
        and(
          eq(schema.reviewLogs.customerId, customerId),
          isNotNull(schema.reviewLogs.sentAt)
        )
      )
      .orderBy(desc(schema.reviewLogs.sentAt))
      .limit(1);

    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      jobReferenceId: r.jobReferenceId,
      status: r.status as ReviewLog['status'],
      scheduledDispatchAt: r.scheduledDispatchAt,
      sentAt: r.sentAt,
      nudgeScheduledAt: r.nudgeScheduledAt,
      nudgeSentAt: r.nudgeSentAt,
      clickedAt: r.clickedAt,
    };
  }

  async createReviewLog(data: Omit<ReviewLog, 'id'>): Promise<ReviewLog> {
    const id = genId('rev');
    const rows = await this.db
      .insert(schema.reviewLogs)
      .values({
        id,
        tenantId: data.tenantId,
        customerId: data.customerId,
        jobReferenceId: data.jobReferenceId,
        status: data.status,
        scheduledDispatchAt: data.scheduledDispatchAt,
      })
      .returning();

    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      jobReferenceId: r.jobReferenceId,
      status: r.status as ReviewLog['status'],
      scheduledDispatchAt: r.scheduledDispatchAt,
      sentAt: r.sentAt,
      nudgeScheduledAt: r.nudgeScheduledAt,
      nudgeSentAt: r.nudgeSentAt,
      clickedAt: r.clickedAt,
    };
  }

  async updateReviewLog(id: string, data: Partial<ReviewLog>): Promise<void> {
    const updateValues: Record<string, any> = {};
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.sentAt !== undefined) updateValues.sentAt = data.sentAt;
    if (data.nudgeScheduledAt !== undefined) updateValues.nudgeScheduledAt = data.nudgeScheduledAt;
    if (data.nudgeSentAt !== undefined) updateValues.nudgeSentAt = data.nudgeSentAt;
    if (data.clickedAt !== undefined) updateValues.clickedAt = data.clickedAt;

    await this.db
      .update(schema.reviewLogs)
      .set(updateValues)
      .where(eq(schema.reviewLogs.id, id));
  }

  /**
   * Atomically claims a nudge dispatch slot.
   * Ensures status is 'sent' and clicked_at is NULL at the exact millisecond of update.
   * Returns true if successfully claimed, false if already clicked or already sent.
   */
  async claimNudgeDispatch(id: string): Promise<boolean> {
    const rows = await this.db
      .update(schema.reviewLogs)
      .set({
        status: 'nudge_sent',
        nudgeSentAt: new Date(),
      })
      .where(
        and(
          eq(schema.reviewLogs.id, id),
          eq(schema.reviewLogs.status, 'sent'),
          isNull(schema.reviewLogs.clickedAt)
        )
      )
      .returning({ id: schema.reviewLogs.id });

    return rows.length > 0;
  }

  async deleteTenant(id: string): Promise<void> {
    // Delete in cascade order: reviewLogs -> customers -> tenant
    await this.db.delete(schema.reviewLogs).where(eq(schema.reviewLogs.tenantId, id));
    await this.db.delete(schema.customers).where(eq(schema.customers.tenantId, id));
    await this.db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  }
}
