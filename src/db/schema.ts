import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  twilioSenderId: text('twilio_sender_id').notNull(),
  googleReviewUrl: text('google_review_url').notNull(),
  messageTemplate: text('message_template').notNull().default(
    "Hi {first_name}, thanks for choosing {business_name}. If you were happy with our work, we'd love a quick review: {review_link} Opt-out: {opt_out_link}"
  ),
  nudgeTemplate: text('nudge_template').notNull().default(
    "Hi {first_name}, just a quick follow-up! If you have a spare 60 seconds, we'd really appreciate a review on our recent work: {review_link} Opt-out: {opt_out_link}"
  ),
  webhookSecret: text('webhook_secret').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id).notNull(),
  phoneNumber: text('phone_number').notNull(),
  firstName: text('first_name'),
  optedOut: boolean('opted_out').default(false).notNull(),
  clickedReviewLink: boolean('clicked_review_link').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviewStatusEnum = ['queued', 'sent', 'clicked', 'nudge_sent'] as const;

export const reviewLogs = pgTable('review_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id).notNull(),
  customerId: text('customer_id').references(() => customers.id).notNull(),
  jobReferenceId: text('job_reference_id').notNull().unique(),
  status: text('status', { enum: reviewStatusEnum }).notNull().default('queued'),
  scheduledDispatchAt: timestamp('scheduled_dispatch_at').notNull(),
  sentAt: timestamp('sent_at'),
  nudgeScheduledAt: timestamp('nudge_scheduled_at'),
  nudgeSentAt: timestamp('nudge_sent_at'),
  clickedAt: timestamp('clicked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DbTenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

export type DbCustomer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

export type DbReviewLog = typeof reviewLogs.$inferSelect;
export type InsertReviewLog = typeof reviewLogs.$inferInsert;
