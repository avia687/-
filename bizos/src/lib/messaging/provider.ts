// Messaging abstraction. The MVP ships a mock provider that records outgoing
// messages without contacting any external service. A real WhatsApp Business
// API / SMS / email adapter is a drop-in implementation of this interface —
// no faked "connected" state anywhere in the UI.

export type MessageChannel = "whatsapp" | "sms" | "email";

export type OutgoingMessage = {
  channel: MessageChannel;
  toName?: string;
  toAddress?: string; // phone or email
  template?: string;
  body: string;
};

export type SendResult = {
  status: "sent" | "queued" | "failed";
  providerId?: string;
  error?: string;
};

export interface MessagingProvider {
  readonly name: string;
  readonly connected: boolean;
  send(message: OutgoingMessage): Promise<SendResult>;
}
