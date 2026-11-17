import type { Tenant, Customer, ReviewLog } from '../types.ts';

export interface DatabaseAdapter {
  // Tenant
  getTenant(id: string): Promise<Tenant | null>;
  createTenant(data: Omit<Tenant, 'id' | 'createdAt'>): Promise<Tenant>;

  // Customer
  getCustomer(tenantId: string, phoneNumber: string): Promise<Customer | null>;
  upsertCustomer(tenantId: string, phoneNumber: string, firstName?: string | null): Promise<Customer>;
  setCustomerOptOut(customerId: string, optedOut: boolean): Promise<void>;
  setCustomerClicked(customerId: string, clicked: boolean): Promise<void>;

  // Review Logs
  getReviewLog(id: string): Promise<ReviewLog | null>;
  getReviewLogByJob(tenantId: string, jobReferenceId: string): Promise<ReviewLog | null>;
  getRecentCustomerLogs(customerId: string): Promise<ReviewLog[]>;
  createReviewLog(data: Omit<ReviewLog, 'id'>): Promise<ReviewLog>;
  updateReviewLog(id: string, data: Partial<ReviewLog>): Promise<void>;

  // Demo Sandbox Cleanup
  deleteTenant(id: string): Promise<void>;
}
