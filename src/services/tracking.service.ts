import type { DatabaseAdapter } from '../db/adapter.ts';

export class TrackingService {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async handleCustomerClick(reviewLogId: string): Promise<{ status: string; redirectUrl: string }> {
    const log = await this.db.getReviewLog(reviewLogId);
    if (!log) throw new Error('Review log not found');

    const tenant = await this.db.getTenant(log.tenantId);
    if (!tenant) throw new Error('Tenant not found');

    await this.db.setCustomerClicked(log.customerId, true);
    await this.db.updateReviewLog(reviewLogId, {
      status: 'clicked',
      clickedAt: new Date(),
    });

    return {
      status: 'clicked',
      redirectUrl: tenant.googleReviewUrl,
    };
  }
}
