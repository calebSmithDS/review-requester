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
