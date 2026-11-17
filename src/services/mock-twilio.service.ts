import type { TwilioServiceConfig } from './twilio.service.ts';

export interface SmsProvider {
  sendSms(params: { to: string; from: string; body: string }): Promise<{ messageSid: string }>;
}

export class MockTwilioSmsService implements SmsProvider {
  async sendSms(params: { to: string; from: string; body: string }): Promise<{ messageSid: string }> {
    const mockSid = `mock_msg_${Math.random().toString(36).slice(2, 10)}`;
    console.log(`\n📱 [MOCK TWILIO SMS] (SID: ${mockSid})`);
    console.log(`   From: ${params.from}`);
    console.log(`   To:   ${params.to}`);
    console.log(`   Body: ${params.body}\n`);
    return { messageSid: mockSid };
  }
}
