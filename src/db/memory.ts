import type { Tenant, Customer, ReviewLog } from '../types.ts';
import type { DatabaseAdapter } from './adapter.ts';
import { genId } from '../utils/id.ts';

export class MemoryDatabaseAdapter implements DatabaseAdapter {
  private tenants = new Map<string, Tenant>();
  private customers = new Map<string, Customer>(); // key: `${tenantId}:${phoneNumber}`
  private customersById = new Map<string, Customer>();
  private reviewLogs = new Map<string, ReviewLog>();
  private jobIndex = new Map<string, string>(); // `${tenantId}:${jobReferenceId}` -> logId

  async getTenant(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) || null;
  }

  async createTenant(data: Omit<Tenant, 'id' | 'createdAt'>): Promise<Tenant> {
    const id = genId('ten');
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

  async upsertCustomer(
    tenantId: string,
    phoneNumber: string,
    firstName?: string | null
  ): Promise<Customer> {
    const key = `${tenantId}:${phoneNumber}`;
    let customer = this.customers.get(key);
    if (!customer) {
      customer = {
        id: genId('cus'),
        tenantId,
        phoneNumber,
        firstName: firstName || null,
        opted_out: false,
        clicked_review_link: false,
        createdAt: new Date(),
      };
      this.customers.set(key, customer);
      this.customersById.set(customer.id, customer);
    }
    return customer;
  }

  async setCustomerOptOut(customerId: string, optedOut: boolean): Promise<void> {
    const customer = this.customersById.get(customerId);
    if (customer) {
      customer.opted_out = optedOut;
    }
  }

  async setCustomerClicked(customerId: string, clicked: boolean): Promise<void> {
    const customer = this.customersById.get(customerId);
    if (customer) {
      customer.clicked_review_link = clicked;
    }
  }

  async getReviewLog(id: string): Promise<ReviewLog | null> {
    return this.reviewLogs.get(id) || null;
  }

  async getReviewLogByJob(tenantId: string, jobReferenceId: string): Promise<ReviewLog | null> {
    const logId = this.jobIndex.get(`${tenantId}:${jobReferenceId}`);
    if (!logId) return null;
    return this.reviewLogs.get(logId) || null;
  }

  async getRecentCustomerLogs(customerId: string): Promise<ReviewLog[]> {
    return Array.from(this.reviewLogs.values()).filter((l) => l.customerId === customerId);
  }

  async createReviewLog(data: Omit<ReviewLog, 'id'>): Promise<ReviewLog> {
    const id = genId('rev');
    const log: ReviewLog = { id, ...data };
    this.reviewLogs.set(id, log);
    this.jobIndex.set(`${data.tenantId}:${data.jobReferenceId}`, id);
    return log;
  }

  async updateReviewLog(id: string, data: Partial<ReviewLog>): Promise<void> {
    const log = this.reviewLogs.get(id);
    if (log) {
      Object.assign(log, data);
    }
  }

  async deleteTenant(id: string): Promise<void> {
    this.tenants.delete(id);
    // Delete logs and customers belonging to this tenant
    for (const [logId, log] of this.reviewLogs.entries()) {
      if (log.tenantId === id) {
        this.reviewLogs.delete(logId);
        this.jobIndex.delete(`${log.tenantId}:${log.jobReferenceId}`);
      }
    }
    for (const [key, cust] of this.customers.entries()) {
      if (cust.tenantId === id) {
        this.customers.delete(key);
        this.customersById.delete(cust.id);
      }
    }
  }
}
