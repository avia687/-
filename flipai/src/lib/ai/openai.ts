import type {
  AIProvider,
  ListingContext,
  NegotiationContext,
} from "@/lib/ai/provider";
import {
  listingSchema,
  negotiationSchema,
  productAnalysisSchema,
  type AnalyzeInput,
  type ListingContent,
  type NegotiationResult,
  type ProductAnalysis,
  categoryLabels,
  conditionLabels,
} from "@/lib/ai/types";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function toDataUrl(ref: string): string | null {
  // Images are stored as data URIs; pass them straight to the vision API.
  if (ref.startsWith("data:image/")) return ref;
  return null;
}

async function callOpenAI(messages: unknown[]): Promise<unknown> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.6,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI: empty response");
  return JSON.parse(content);
}

const SYSTEM = `אתה מומחה להערכת מוצרים יד-שנייה בישראל וכתיבת מודעות מכירה. ענה תמיד בעברית תקנית ובפורמט JSON בלבד, ללא טקסט נוסף. המחירים בשקלים חדשים (מספרים בלבד).`;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  async analyzeProduct(input: AnalyzeInput): Promise<ProductAnalysis> {
    const dataUrls = input.imageRefs
      .map(toDataUrl)
      .filter((u): u is string => Boolean(u));

    const hints: string[] = [];
    if (input.category)
      hints.push(`קטגוריה משוערת: ${categoryLabels[input.category]}`);
    if (input.condition)
      hints.push(`מצב משוער: ${conditionLabels[input.condition]}`);
    if (input.note) hints.push(`הערת המוכר: ${input.note}`);

    const schemaHint = `החזר JSON עם המבנה:
{
  "identification": { "name": string, "category": one of ["electronics","vehicles","fashion","furniture","collectibles","other"], "brand"?: string, "model"?: string, "year"?: string, "condition": one of ["new","like_new","good","fair","worn"] },
  "estimate": { "estimatedValue": number (₪), "confidence": number 0-100, "demandScore": number 0-100, "reasoning": string בעברית },
  "listing": { "title": string, "description": string, "details": object של מחרוזות, "strategy": string, "startPrice": number, "expectedPrice": number, "minPrice": number }
}`;

    const content: unknown[] = [
      { type: "text", text: `${schemaHint}\n\n${hints.join("\n")}` },
      ...dataUrls.map((url) => ({
        type: "image_url",
        image_url: { url, detail: "low" },
      })),
    ];

    const raw = await callOpenAI([
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ]);

    return productAnalysisSchema.parse(coerceNumbers(raw));
  }

  async generateListing(ctx: ListingContext): Promise<ListingContent> {
    const prompt = `כתוב מודעת מכירה מקצועית וטבעית בעברית עבור: ${ctx.identification.name} (${
      conditionLabels[ctx.identification.condition]
    }). מחיר מומלץ ${ctx.recommendedPrice} ₪, מינימום ${ctx.quickSalePrice} ₪, מקסימום ${ctx.maxPrice} ₪.${
      ctx.note ? ` הערה: ${ctx.note}` : ""
    } גרסה ${ctx.variant ?? 0}.
החזר JSON: { "title": string, "description": string, "details": object, "strategy": string, "startPrice": number, "expectedPrice": number, "minPrice": number }`;

    const raw = await callOpenAI([
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ]);
    return listingSchema.parse(coerceNumbers(raw));
  }

  async negotiate(ctx: NegotiationContext): Promise<NegotiationResult> {
    const prompt = `קונה שלח הודעה על "${ctx.productName}" שמפורסם ב-${ctx.listedPrice} ₪ (מינימום סביר ${ctx.minPrice} ₪). ההודעה: "${ctx.buyerMessage}".
כתוב שלוש תשובות קצרות בעברית בגוף ראשון של המוכר. החזר JSON: { "friendly": string, "firm": string, "quick": string }`;

    const raw = await callOpenAI([
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ]);
    return negotiationSchema.parse(raw);
  }
}

// The model occasionally returns numbers as strings; coerce known numeric keys.
function coerceNumbers(value: unknown): unknown {
  const numericKeys = new Set([
    "estimatedValue",
    "confidence",
    "demandScore",
    "startPrice",
    "expectedPrice",
    "minPrice",
  ]);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (numericKeys.has(k) && typeof val === "string") {
          const n = Number(val.replace(/[^\d.]/g, ""));
          out[k] = Number.isFinite(n) ? n : val;
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    }
    return v;
  };
  return walk(value);
}
