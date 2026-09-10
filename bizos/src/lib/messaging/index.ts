import type { MessagingProvider, OutgoingMessage, SendResult } from "@/lib/messaging/provider";

/**
 * Mock messaging provider. Reports itself as NOT connected and "queues"
 * messages locally. Swap for a real WhatsApp/SMS/email adapter by implementing
 * MessagingProvider and returning it from getMessaging().
 */
class MockMessagingProvider implements MessagingProvider {
  readonly name = "mock";
  readonly connected = false;

  async send(_message: OutgoingMessage): Promise<SendResult> {
    // Intentionally does not contact any external service. The caller persists
    // the Message row with status "queued" so the UI reflects reality.
    return { status: "queued", providerId: `mock_${Date.now()}` };
  }
}

let instance: MessagingProvider | null = null;

export function getMessaging(): MessagingProvider {
  // A real provider would be selected here when its env credentials exist,
  // e.g. `if (process.env.WHATSAPP_API_TOKEN) return new WhatsAppProvider();`
  return (instance ??= new MockMessagingProvider());
}

export function isMessagingConnected(): boolean {
  return getMessaging().connected;
}

export type { MessagingProvider, OutgoingMessage, SendResult };
