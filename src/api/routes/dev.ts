import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReviewService } from '../../services/index.ts';

export interface CapturedSms {
  id: string;
  to: string;
  from: string;
  body: string;
  sentAt: Date;
  messageSid: string;
}

export class DevSmsProvider {
  private static messages: CapturedSms[] = [];

  async sendSms(params: { to: string; from: string; body: string }): Promise<{ messageSid: string }> {
    const messageSid = `dev_msg_${Math.random().toString(36).slice(2, 9)}`;
    const msg: CapturedSms = {
      id: messageSid,
      to: params.to,
      from: params.from,
      body: params.body,
      sentAt: new Date(),
      messageSid,
    };
    DevSmsProvider.messages.unshift(msg);
    return { messageSid };
  }

  static getMessages(): CapturedSms[] {
    return DevSmsProvider.messages;
  }

  static addManual(msg: CapturedSms) {
    DevSmsProvider.messages.unshift(msg);
  }

  static clear(): void {
    DevSmsProvider.messages = [];
  }
}

// Stores state for seeded demo data in memory for easy display
export interface DemoState {
  tenantId: string;
  tenantName: string;
  customers: Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    reviewLogId?: string;
    scenario: string;
  }>;
}

let activeDemo: DemoState | null = null;

export async function seedDemoData(service: ReviewService, baseUrl: string): Promise<DemoState> {
  // If a previous demo tenant was active, purge it from the database completely first
  if (activeDemo?.tenantId) {
    try {
      await service.deleteTenant(activeDemo.tenantId);
    } catch {
      // Ignore if already deleted
    }
  }

  DevSmsProvider.clear();

  // 1. Create Demo Tenant
  const tenant = await service.createTenant({
    businessName: 'Apex Plumbing & Gas (Demo)',
    twilioSenderId: 'ApexPlumb',
    googleReviewUrl: 'https://maps.google.com/review/apex-plumbing-demo',
    messageTemplate:
      'Hi {first_name}, thanks for choosing {business_name}! Please leave us a review: {review_link} Opt-out: {opt_out_link}',
    nudgeTemplate:
      'Hi {first_name}, gentle follow-up from {business_name}: {review_link} Opt-out: {opt_out_link}',
    webhookSecret: 'demo_secret_xyz',
  });

  // Scenario 1: Alice - Initial Request Sent, Waiting for 3-Day Nudge
  const aliceRes = await service.handleIngress({
    tenantId: tenant.id,
    jobReferenceId: `DEMO-JOB-${Date.now()}-1`,
    customerPhone: '+61411111111',
    customerFirstName: 'Alice',
  });
  const aliceCustomer = await service.getCustomer(tenant.id, '+61411111111');
  await service.dispatchInitial(aliceRes.reviewRequestId!);

  // Scenario 2: Bob - Sent & CLICKED (Should block follow-up nudges)
  const bobRes = await service.handleIngress({
    tenantId: tenant.id,
    jobReferenceId: `DEMO-JOB-${Date.now()}-2`,
    customerPhone: '+61422222222',
    customerFirstName: 'Bob',
  });
  const bobCustomer = await service.getCustomer(tenant.id, '+61422222222');
  await service.dispatchInitial(bobRes.reviewRequestId!);
  // Bob clicks review link
  await service.handleCustomerClick(bobRes.reviewRequestId!);

  // Scenario 3: Charlie - 3 Days have passed without click (Ready for nudge)
  const charlieRes = await service.handleIngress({
    tenantId: tenant.id,
    jobReferenceId: `DEMO-JOB-${Date.now()}-3`,
    customerPhone: '+61433333333',
    customerFirstName: 'Charlie',
  });
  const charlieCustomer = await service.getCustomer(tenant.id, '+61433333333');
  await service.dispatchInitial(charlieRes.reviewRequestId!);

  // Scenario 4: Dave - Opted Out
  const daveRes = await service.handleIngress({
    tenantId: tenant.id,
    jobReferenceId: `DEMO-JOB-${Date.now()}-4`,
    customerPhone: '+61444444444',
    customerFirstName: 'Dave',
  });
  const daveCustomer = await service.getCustomer(tenant.id, '+61444444444');
  await service.handleOptOut(daveCustomer!.id);

  activeDemo = {
    tenantId: tenant.id,
    tenantName: tenant.businessName,
    customers: [
      {
        id: aliceCustomer!.id,
        name: 'Alice',
        phone: '+61411111111',
        status: 'INITIAL SENT',
        reviewLogId: aliceRes.reviewRequestId,
        scenario: 'Pending review (Nudge will fire if triggered)',
      },
      {
        id: bobCustomer!.id,
        name: 'Bob',
        phone: '+61422222222',
        status: 'CLICKED LINK',
        reviewLogId: bobRes.reviewRequestId,
        scenario: 'Clicked! (Automatic follow-up MUST be suppressed/blocked)',
      },
      {
        id: charlieCustomer!.id,
        name: 'Charlie',
        phone: '+61433333333',
        status: 'OVERDUE (3+ DAYS)',
        reviewLogId: charlieRes.reviewRequestId,
        scenario: '3 days passed with no interaction -> Ready for nudge',
      },
      {
        id: daveCustomer!.id,
        name: 'Dave',
        phone: '+61444444444',
        status: 'OPTED OUT',
        reviewLogId: daveRes.reviewRequestId,
        scenario: 'Unsubscribed -> All future dispatches blocked',
      },
    ],
  };

  return activeDemo;
}

export function devRoutes(app: FastifyInstance, opts: { service: ReviewService; baseUrl: string }) {
  const { service, baseUrl } = opts;

  // GET /dev - Visual Demo Sandbox & Outbox
  app.get('/dev', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!activeDemo) {
      await seedDemoData(service, baseUrl);
    }

    const messages = DevSmsProvider.getMessages();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Review Requester - Dev Sandbox</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    h1, h2, h3 { margin-top: 0; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-green { background: #166534; color: #86efac; }
    .badge-amber { background: #854d0e; color: #fef08a; }
    .badge-red { background: #991b1b; color: #fecaca; }
    .badge-blue { background: #1e40af; color: #bfdbfe; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid #334155; vertical-align: middle; }
    th { color: #94a3b8; font-weight: 500; font-size: 13px; }
    .btn { display: inline-block; background: #3b82f6; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; text-decoration: none; font-size: 13px; font-weight: 500; }
    .btn:hover { background: #2563eb; }
    .btn-secondary { background: #334155; border: 1px solid #475569; }
    .btn-secondary:hover { background: #475569; }
    .btn-danger { background: #dc2626; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-action { padding: 6px 10px; font-size: 12px; }
    .message-bubble { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .message-bubble.aborted { border-color: #ef4444; background: #261111; }
    .message-meta { font-size: 12px; color: #94a3b8; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .message-text { font-size: 14px; line-height: 1.5; word-break: break-all; }
    a { color: #60a5fa; text-decoration: underline; font-weight: 500; }
    a:hover { color: #93c5fd; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; }
    .notice { font-size: 13px; color: #94a3b8; margin-bottom: 14px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="top-bar">
    <div>
      <h1>🛠️ Review Requester - Test Harness</h1>
      <p style="color: #94a3b8; margin: 0;">Tenant: <strong>${activeDemo?.tenantName}</strong> (ID: <code>${activeDemo?.tenantId}</code>)</p>
    </div>
    <div>
      <a href="/dev/action/reset" class="btn btn-danger">🔄 Reset Clean Demo Data</a>
    </div>
  </div>

  <div class="grid">
    <!-- Customers & Scenarios -->
    <div class="card">
      <h2>👥 Simulated Customers</h2>
      <p class="notice">
        Click <strong>"Fast-Forward 3-Day Nudge"</strong> to simulate QStash waking up after 3 days. Notice how Bob's nudge is blocked because he clicked, while Charlie's triggers a new SMS!
      </p>
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Scenario / State</th>
            <th>Simulate Follow-Up</th>
          </tr>
        </thead>
        <tbody>
          ${activeDemo?.customers
            .map(
              (c) => `
            <tr>
              <td>
                <strong style="font-size: 15px;">${c.name}</strong><br>
                <span style="font-size: 12px; color: #94a3b8;">${c.phone}</span>
              </td>
              <td>
                <span class="badge ${
                  c.status.includes('CLICKED')
                    ? 'badge-green'
                    : c.status.includes('OPTED')
                    ? 'badge-red'
                    : c.status.includes('OVERDUE')
                    ? 'badge-amber'
                    : 'badge-blue'
                }">${c.status}</span><br>
                <span style="font-size: 12px; color: #cbd5e1;">${c.scenario}</span>
              </td>
              <td>
                ${
                  c.reviewLogId
                    ? `
                  <a href="/dev/action/trigger-nudge?logId=${c.reviewLogId}" class="btn btn-secondary btn-action" title="Simulate 3-day follow-up trigger">
                    ⏰ Fire 3-Day Nudge
                  </a>
                `
                    : '-'
                }
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Outbox / Captured SMS Messages -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h2>📱 Outgoing SMS Outbox (${messages.length})</h2>
        <span class="badge badge-blue">Local Mock Provider</span>
      </div>
      <p class="notice">
        All messages generated by the app appear here in real time. <strong>Click the blue links</strong> to simulate customer clicks or 1-click opt-outs!
      </p>

      ${
        messages.length === 0
          ? '<p style="color: #64748b;">No messages in outbox yet.</p>'
          : messages
              .map((m) => {
                const isNotice = m.messageSid === 'aborted';
                const bodyWithLinks = m.body.replace(
                  /(https?:\/\/[^\s]+)/g,
                  '<a href="$1" target="_blank">$1</a>'
                );
                return `
            <div class="message-bubble ${isNotice ? 'aborted' : ''}">
              <div class="message-meta">
                <span>To: <strong>${m.to}</strong> ${m.from ? `| From: <code>${m.from}</code>` : ''}</span>
                <span>${new Date(m.sentAt).toLocaleTimeString()}</span>
              </div>
              <div class="message-text">${bodyWithLinks}</div>
            </div>
          `;
              })
              .join('')
      }
    </div>
  </div>
</body>
</html>
    `;

    reply.type('text/html');
    return reply.status(200).send(html);
  });

  // GET /dev/action/reset - Reset and re-seed demo data
  app.get('/dev/action/reset', async (req: FastifyRequest, reply: FastifyReply) => {
    await seedDemoData(service, baseUrl);
    return reply.redirect('/dev', 302);
  });

  // GET /dev/action/trigger-nudge?logId=...
  app.get(
    '/dev/action/trigger-nudge',
    async (
      req: FastifyRequest<{ Querystring: { logId: string } }>,
      reply: FastifyReply
    ) => {
      const { logId } = req.query;
      if (logId) {
        const result = await service.dispatchNudge(logId);
        if (result.aborted) {
          DevSmsProvider.addManual({
            id: `aborted_${Date.now()}`,
            to: 'SCHEDULER STATUS',
            from: 'Guardrail',
            body: `🚫 Follow-up nudge for Review Log [${logId.slice(0, 8)}...] was BLOCKED/SUPPRESSED. Reason: "${result.reason}". (Safe UX: customer already clicked or completed).`,
            sentAt: new Date(),
            messageSid: 'aborted',
          });
        }
      }
      return reply.redirect('/dev', 302);
    }
  );
}
