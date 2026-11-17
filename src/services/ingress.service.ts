import type { DatabaseAdapter } from '../db/adapter.ts';
import { CustomerService } from './customer.service.ts';
import { calculateDispatchTime } from '../scheduler.ts';
import { evaluateCustomerEligibility } from '../policies.ts';
import type { QStashSchedulerService } from './qstash.service.ts';

export class IngressService {
  private db: DatabaseAdapter;
  private customerService: CustomerService;
  private qstash?: QStashSchedulerService;

  constructor(
    db: DatabaseAdapter,
    customerService: CustomerService,
    qstash?: QStashSchedulerService
  ) {
    this.db = db;
    this.customerService = customerService;
    this.qstash = qstash;
  }

  async handleIngress(params: {
    tenantId: string;
    jobReferenceId: string;
    customerPhone: string;
    customerFirstName?: string;
    traceId?: string;
  }): Promise<{ status?: string; reviewRequestId?: string; ignored?: boolean; reason?: string }> {
    // 1. Parallelize initial Tenant and Job check (saves 1 round-trip)
    const [tenant, existingLog] = await Promise.all([
      this.db.getTenant(params.tenantId),
      this.db.getReviewLogByJob(params.tenantId, params.jobReferenceId),
    ]);

    if (!tenant) {
      throw new Error(`Tenant ${params.tenantId} not found`);
    }

    if (existingLog) {
      return { ignored: true, reason: 'idempotent_duplicate' };
    }

    // 2. Upsert customer
    const customer = await this.customerService.upsertCustomer(
      params.tenantId,
      params.customerPhone,
      params.customerFirstName
    );

    // 3. Fast O(1) eligibility check (only fetches latest sent log, not full history)
    const lastSentLog = await this.db.getLastSentCustomerLog(customer.id);
    const eligibility = evaluateCustomerEligibility(customer, lastSentLog);
    if (!eligibility.allowed) {
      return { ignored: true, reason: eligibility.reason };
    }

    // 4. Calculate Dispatch Time with DND
    const scheduledDispatchAt = calculateDispatchTime(new Date());

    // 5. Create review_logs record with status 'queued' (atomic catch for concurrent bursts)
    let reviewLog;
    try {
      reviewLog = await this.db.createReviewLog({
        tenantId: params.tenantId,
        customerId: customer.id,
        jobReferenceId: params.jobReferenceId,
        status: 'queued',
        scheduledDispatchAt,
      });
    } catch (err: any) {
      // Postgres unique_violation code is '23505' or matching duplicate key message
      if (err.code === '23505' || err.message?.includes('duplicate') || err.message?.includes('unique')) {
        return { ignored: true, reason: 'idempotent_duplicate' };
      }
      throw err;
    }

    // 6. Push to Upstash QStash if enabled
    if (this.qstash) {
      await this.qstash.scheduleInitialDispatch(reviewLog.id, scheduledDispatchAt, params.traceId);
    }

    return {
      status: 'queued',
      reviewRequestId: reviewLog.id,
    };
  }
}
