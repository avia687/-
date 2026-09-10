import type {
  AssistantReply,
  BusinessSnapshot,
  ConfigProposal,
  CustomerReplyInput,
  MarketingInput,
} from "@/lib/ai/types";

/**
 * The AI provider contract. Implementations must ground every answer in the
 * supplied BusinessSnapshot — never fabricate prices, customers, or facts.
 */
export interface AIProvider {
  /** Answer a business question from the owner ("what's today?", "who owes me?"). */
  ask(question: string, snapshot: BusinessSnapshot): Promise<AssistantReply>;
  /** Draft a reply to a customer message, using the price list for any prices. */
  customerReply(input: CustomerReplyInput): Promise<string>;
  /** Generate marketing copy for a channel, tailored to the business type. */
  marketing(input: MarketingInput): Promise<string>;
  /** Propose a business configuration for an unknown/custom business type. */
  proposeConfig(description: string): Promise<ConfigProposal>;
}
