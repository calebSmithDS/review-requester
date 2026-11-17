import type { DatabaseAdapter } from '../db/adapter.ts';

export interface TenantAnalytics {
  tenantId: string;
  totalCustomers: number;
  totalOptedOut: number;
  optOutRatePercentage: number;
  totalJobsReceived: number;
  totalInitialSent: number;
  totalNudgesSent: number;
  totalClicked: number;
  clickThroughRatePercentage: number;
}

export class AnalyticsService {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async getTenantMetrics(tenantId: string): Promise<TenantAnalytics> {
    const tenant = await this.db.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const adapter = this.db as any;

    // In-memory or database query resolution
    let customers: any[] = [];
    let logs: any[] = [];

    if (adapter.customers) {
      // Memory adapter
      customers = Array.from(adapter.customers.values()).filter((c: any) => c.tenantId === tenantId);
      logs = Array.from(adapter.reviewLogs.values()).filter((l: any) => l.tenantId === tenantId);
    } else if (adapter.db) {
      // Neon/Drizzle adapter
      const schema = await import('../db/schema.ts');
      const { eq } = await import('drizzle-orm');
      customers = await adapter.db.select().from(schema.customers).where(eq(schema.customers.tenantId, tenantId));
      logs = await adapter.db.select().from(schema.reviewLogs).where(eq(schema.reviewLogs.tenantId, tenantId));
    }

    const totalCustomers = customers.length;
    const totalOptedOut = customers.filter((c) => c.opted_out || c.optedOut).length;
    const totalJobsReceived = logs.length;
    const totalInitialSent = logs.filter((l) => l.sentAt || l.sent_at).length;
    const totalNudgesSent = logs.filter((l) => l.nudgeSentAt || l.nudge_sent_at).length;
    const totalClicked = logs.filter((l) => l.status === 'clicked' || l.clickedAt || l.clicked_at).length;

    const clickThroughRatePercentage = totalInitialSent > 0
      ? Number(((totalClicked / totalInitialSent) * 100).toFixed(2))
      : 0;

    const optOutRatePercentage = totalCustomers > 0
      ? Number(((totalOptedOut / totalCustomers) * 100).toFixed(2))
      : 0;

    return {
      tenantId,
      totalCustomers,
      totalOptedOut,
      optOutRatePercentage,
      totalJobsReceived,
      totalInitialSent,
      totalNudgesSent,
      totalClicked,
      clickThroughRatePercentage,
    };
  }
}
