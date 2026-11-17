import type { Tenant, Customer } from '../types.ts';
import type { DatabaseAdapter } from '../db/adapter.ts';
import { MemoryDatabaseAdapter } from '../db/memory.ts';
import { TenantService } from './tenant.service.ts';
import { CustomerService } from './customer.service.ts';
import { IngressService } from './ingress.service.ts';
import { DispatchService } from './dispatch.service.ts';
import { TrackingService } from './tracking.service.ts';
import { AnalyticsService } from './analytics.service.ts';
import type { SmsProvider } from './mock-twilio.service.ts';
import type { QStashSchedulerService } from './qstash.service.ts';

export * from './tenant.service.ts';
export * from './customer.service.ts';
export * from './ingress.service.ts';
export * from './dispatch.service.ts';
export * from './tracking.service.ts';
export * from './analytics.service.ts';
export * from './mock-twilio.service.ts';
export * from './twilio.service.ts';
export * from './qstash.service.ts';

export interface ReviewServiceOptions {
  db?: DatabaseAdapter;
  smsProvider?: SmsProvider;
  qstash?: QStashSchedulerService;
  baseUrl?: string;
}

/**
 * Root ReviewService aggregator delegating to domain-specific services
 */
export class ReviewService {
  private db: DatabaseAdapter;
  public readonly tenantService: TenantService;
  public readonly customerService: CustomerService;
  public readonly ingressService: IngressService;
  public readonly dispatchService: DispatchService;
  public readonly trackingService: TrackingService;
  public readonly analyticsService: AnalyticsService;

  constructor(opts: ReviewServiceOptions = {}) {
    this.db = opts.db || new MemoryDatabaseAdapter();
    this.tenantService = new TenantService(this.db);
    this.customerService = new CustomerService(this.db);
    this.ingressService = new IngressService(this.db, this.customerService, opts.qstash);
    this.dispatchService = new DispatchService(this.db, opts.smsProvider, opts.qstash, opts.baseUrl);
    this.trackingService = new TrackingService(this.db);
    this.analyticsService = new AnalyticsService(this.db);
  }

  async createTenant(data: Omit<Tenant, 'id' | 'createdAt'>): Promise<Tenant> {
    return this.tenantService.createTenant(data);
  }

  async getCustomer(tenantId: string, phoneNumber: string): Promise<Customer | null> {
    return this.customerService.getCustomer(tenantId, phoneNumber);
  }

  async handleIngress(params: {
    tenantId: string;
    jobReferenceId: string;
    customerPhone: string;
    customerFirstName?: string;
    traceId?: string;
  }) {
    return this.ingressService.handleIngress(params);
  }

  async markSent(reviewLogId: string, sentAt: Date = new Date()): Promise<void> {
    await this.db.updateReviewLog(reviewLogId, {
      status: 'sent',
      sentAt,
    });
  }

  async dispatchInitial(reviewLogId: string) {
    return this.dispatchService.dispatchInitial(reviewLogId);
  }

  async dispatchNudge(reviewLogId: string) {
    return this.dispatchService.dispatchNudge(reviewLogId);
  }

  async handleCustomerClick(reviewLogId: string) {
    return this.trackingService.handleCustomerClick(reviewLogId);
  }

  async handleOptOut(customerId: string) {
    return this.customerService.handleOptOut(customerId);
  }

  async getTenantMetrics(tenantId: string) {
    return this.analyticsService.getTenantMetrics(tenantId);
  }
}
