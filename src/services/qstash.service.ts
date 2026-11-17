import { Client as QStashClient } from '@upstash/qstash';

export interface QStashServiceConfig {
  token: string;
  baseUrl: string;
}

export class QStashSchedulerService {
  private client: QStashClient;
  private baseUrl: string;

  constructor(config: QStashServiceConfig) {
    this.client = new QStashClient({ token: config.token });
    this.baseUrl = config.baseUrl;
  }

  async scheduleInitialDispatch(
    reviewLogId: string,
    dispatchTime: Date,
    traceId?: string
  ): Promise<string> {
    const notBefore = Math.floor(dispatchTime.getTime() / 1000);
    const destination = `${this.baseUrl}/api/internal/dispatch`;

    const headers: Record<string, string> = {};
    if (traceId) {
      // Forward the trace ID so QStash sends it back in the callback webhook
      headers['Upstash-Forward-x-trace-id'] = traceId;
    }

    const res = await this.client.publishJSON({
      url: destination,
      body: { review_log_id: reviewLogId },
      headers,
      notBefore,
    });

    return res.messageId;
  }

  async scheduleNudgeDispatch(
    reviewLogId: string,
    nudgeTime: Date,
    traceId?: string
  ): Promise<string> {
    const notBefore = Math.floor(nudgeTime.getTime() / 1000);
    const destination = `${this.baseUrl}/api/internal/dispatch-nudge`;

    const headers: Record<string, string> = {};
    if (traceId) {
      headers['Upstash-Forward-x-trace-id'] = traceId;
    }

    const res = await this.client.publishJSON({
      url: destination,
      body: { review_log_id: reviewLogId },
      headers,
      notBefore,
    });

    return res.messageId;
  }
}
