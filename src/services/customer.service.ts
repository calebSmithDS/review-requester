import type { Customer } from '../types.ts';
import type { DatabaseAdapter } from '../db/adapter.ts';

export class CustomerService {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async getCustomer(tenantId: string, phoneNumber: string): Promise<Customer | null> {
    return this.db.getCustomer(tenantId, phoneNumber);
  }

  async upsertCustomer(
    tenantId: string,
    phoneNumber: string,
    firstName?: string | null
  ): Promise<Customer> {
    return this.db.upsertCustomer(tenantId, phoneNumber, firstName);
  }

  async handleOptOut(customerId: string): Promise<{ success: boolean }> {
    await this.db.setCustomerOptOut(customerId, true);
    return { success: true };
  }

  async markClicked(customerId: string): Promise<void> {
    await this.db.setCustomerClicked(customerId, true);
  }
}
