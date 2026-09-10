// Shared AI types. The AI never invents business facts — it is always given a
// BusinessSnapshot built from real tenant data (see snapshot.ts) and instructed
// to answer only from it.

export type BusinessSnapshot = {
  businessName: string;
  businessType: string;
  currency: string;
  aiInstructions: string;
  terminology: Record<string, string>;
  services: { id: string; name: string; price: number; category?: string }[];
  customers: { id: string; name: string }[];
  todayJobs: { title: string; time: string; customer?: string; status: string }[];
  upcomingJobs: { title: string; date: string; customer?: string }[];
  openQuotes: { customer?: string; total: number; status: string }[];
  outstandingPayments: { customer?: string; amount: number; status: string }[];
  hotLeads: { title: string; value: number; probability: number }[];
  stats: {
    revenueMonth: number;
    jobsMonth: number;
    newLeads: number;
    topService?: { name: string; revenue: number };
    missingReviews: number;
  };
};

export type AssistantReply = {
  text: string;
  suggestions?: string[];
};

export type CustomerReplyInput = {
  customerMessage: string;
  snapshot: BusinessSnapshot;
};

export type MarketingInput = {
  channel: "whatsapp" | "sms" | "email" | "instagram" | "facebook" | "flyer";
  topic: string;
  snapshot: BusinessSnapshot;
};

export type ConfigProposal = {
  label: string;
  terminology: Record<string, string>;
  services: { name: string; category: string; price: number; durationMin: number }[];
};

// AI write-actions are always proposed as a DRAFT that the user must confirm.
export type AIAction =
  | {
      type: "create_quote";
      summary: string;
      draft: {
        customerId?: string;
        customerName?: string;
        items: { serviceId?: string; name: string; quantity: number; unitPrice: number }[];
      };
    }
  | {
      type: "send_message";
      summary: string;
      draft: { customerId?: string; customerName?: string; body: string };
    }
  | { type: "none"; summary: string; missing?: string };
