import twilio from 'twilio';

export interface TwilioServiceConfig {
  accountSid: string;
  authToken: string;
}

export class TwilioSmsService {
  private client: twilio.Twilio;

  constructor(config: TwilioServiceConfig) {
    this.client = twilio(config.accountSid, config.authToken);
  }

  async sendSms(params: {
    to: string;
    from: string; // twilio_sender_id alphanumeric brand name or phone
    body: string;
  }): Promise<{ messageSid: string }> {
    const res = await this.client.messages.create({
      to: params.to,
      from: params.from,
      body: params.body,
    });

    return { messageSid: res.sid };
  }
}
