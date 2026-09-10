import type {
  AIAction,
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
  /**
   * Interpret a natural-language instruction into a DRAFT action grounded in
   * the snapshot. Never executes — the caller shows a preview and only writes
   * after explicit user confirmation. Returns {type:"none"} with `missing`
   * when the referenced entity isn't found (no invention).
   */
  proposeAction(instruction: string, snapshot: BusinessSnapshot): Promise<AIAction>;
}
