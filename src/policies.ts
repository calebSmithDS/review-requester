import type { Customer, ReviewLog } from './types.ts';
import { CONFIG } from './config.ts';

export type PolicyCheckResult = 
  | { allowed: true }
  | { allowed: false; reason: 'opted_out' | 'lifetime_lockout' | 'cooldown' };

/**
 * Checks whether a customer is locked out or eligible for a review request.
 * Enforces:
 * 1. Opt-out check
 * 2. Lifetime lockout (clicked_review_link)
 * 3. 90-day cooldown since last sent review request
 */
export function evaluateCustomerEligibility(
  customer: Customer,
  customerHistory: ReviewLog[],
  now: number = Date.now()
): PolicyCheckResult {
  if (customer.opted_out) {
    return { allowed: false, reason: 'opted_out' };
  }

  if (customer.clicked_review_link) {
    return { allowed: false, reason: 'lifetime_lockout' };
  }

  for (const log of customerHistory) {
    if (log.sentAt && now - log.sentAt.getTime() < CONFIG.cooldown_period_ms) {
      return { allowed: false, reason: 'cooldown' };
    }
  }

  return { allowed: true };
}
