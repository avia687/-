// Business Configuration types. A BusinessConfig is what makes one generic
// core serve many trades: it carries the *terminology*, *sample services*,
// *statuses*, and *AI guidance* for a business type. The template registry
// (templates.ts) provides defaults per type; a tenant's BusinessProfile
// overrides layer on top (resolve.ts). No feature code branches on business
// type — it reads the resolved config instead.

export type TermKey =
  | "customer"
  | "customers"
  | "lead"
  | "leads"
  | "job"
  | "jobs"
  | "service"
  | "services"
  | "employee"
  | "employees"
  | "quote";

export type Terminology = Record<TermKey, string>;

export type StatusOption = {
  key: string;
  label: string;
  color: string; // tailwind color token e.g. "blue", "green"
};

export type SampleService = {
  name: string;
  category: string;
  price: number;
  durationMin: number;
  cost?: number;
};

export type CustomField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  entity: "customer" | "job" | "lead";
};

export type MessageTemplateKey =
  | "job_confirmation"
  | "reminder_24h"
  | "thank_you"
  | "review_request"
  | "quote_followup"
  | "payment_reminder";

export type BusinessConfig = {
  type: string;
  label: string; // human-readable business type name
  icon: string; // lucide icon name
  terminology: Terminology;
  leadStatuses: StatusOption[];
  jobStatuses: StatusOption[];
  sampleServices: SampleService[];
  customFields: CustomField[];
  messageTemplates: Record<MessageTemplateKey, string>;
  aiInstructions: string;
};

export type PartialBusinessConfig = Partial<
  Omit<BusinessConfig, "terminology" | "messageTemplates">
> & {
  terminology?: Partial<Terminology>;
  messageTemplates?: Partial<Record<MessageTemplateKey, string>>;
};
