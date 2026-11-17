import { randomBytes } from 'node:crypto';

/**
 * Generates a URL-safe, unguessable, Stripe-style prefixed ID.
 * Examples:
 *  - genId('ten')  => 'ten_3k9f0a8c2e1b'
 *  - genId('cus')  => 'cus_7a2b9e1d4c8f'
 *  - genId('rev')  => 'rev_8f1c3b7a2d9e'
 */
export function genId(prefix: 'ten' | 'cus' | 'rev'): string {
  const bytes = randomBytes(12).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = bytes.slice(0, 16);
  return `${prefix}_${slug}`;
}
