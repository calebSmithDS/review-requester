import type { Tenant } from '../types.ts';
import type { DatabaseAdapter } from '../db/adapter.ts';

export class TenantService {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async createTenant(data: Omit<Tenant, 'id' | 'createdAt'>): Promise<Tenant> {
    return this.db.createTenant(data);
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.db.getTenant(tenantId);
  }

  async deleteTenant(id: string): Promise<void> {
    return this.db.deleteTenant(id);
  }
}
