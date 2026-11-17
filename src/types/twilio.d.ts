declare module 'twilio' {
  interface MessageInstance {
    sid: string;
    status: string;
  }

  interface MessageListInstance {
    create(opts: { to: string; from: string; body: string }): Promise<MessageInstance>;
  }

  interface TwilioClient {
    messages: MessageListInstance;
  }

  function twilio(accountSid?: string, authToken?: string, opts?: any): TwilioClient;
  namespace twilio {
    export type Twilio = TwilioClient;
  }
  export default twilio;
}
