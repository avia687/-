import type {
  AIProvider,
  ListingContext,
  NegotiationContext,
} from "@/lib/ai/provider";
import type {
  AnalyzeInput,
  Category,
  Condition,
  Identification,
  ListingContent,
  NegotiationResult,
  ProductAnalysis,
} from "@/lib/ai/types";
import { conditionLabels } from "@/lib/ai/types";
import { conditionFactor } from "@/lib/market/engine";
import { hashString, pick, seededRandom } from "@/lib/utils";

/**
 * Deterministic mock AI provider.
 * Produces realistic, varied Hebrew output seeded by the uploaded images and
 * the chosen category, so the same product yields stable results across
 * requests without any external API key. Used automatically when no
 * OPENAI_API_KEY is configured.
 */

type CatalogEntry = {
  name: string;
  brand?: string;
  model?: string;
  year?: string;
  base: number; // baseline value for a "good" condition item
  demand: number; // 0-100
  specs: Record<string, string>;
  accessories: string;
};

const CATALOG: Record<Category, CatalogEntry[]> = {
  electronics: [
    {
      name: "אייפון 13 128GB",
      brand: "Apple",
      model: "iPhone 13",
      year: "2021",
      base: 1850,
      demand: 86,
      specs: { נפח: "128GB", מסך: '6.1"', "מצב סוללה": "88%" },
      accessories: "מטען וקופסה מקוריים",
    },
    {
      name: "מקבוק אייר M1",
      brand: "Apple",
      model: 'MacBook Air 13" M1',
      year: "2020",
      base: 2900,
      demand: 79,
      specs: { מעבד: "Apple M1", זיכרון: "8GB", אחסון: "256GB SSD" },
      accessories: "מטען מקורי",
    },
    {
      name: "אוזניות Sony WH-1000XM4",
      brand: "Sony",
      model: "WH-1000XM4",
      year: "2020",
      base: 720,
      demand: 74,
      specs: { סוג: "Over-ear", "ביטול רעשים": "אקטיבי", "חיי סוללה": "30 שעות" },
      accessories: "כיסוי נשיאה וכבל",
    },
    {
      name: 'טלוויזיה LG OLED 55"',
      brand: "LG",
      model: "OLED55C1",
      year: "2021",
      base: 2400,
      demand: 68,
      specs: { גודל: '55"', רזולוציה: "4K OLED", "קצב רענון": "120Hz" },
      accessories: "שלט וסטנד מקורי",
    },
  ],
  vehicles: [
    {
      name: "קטנוע SYM Jet 14 125",
      brand: "SYM",
      model: "Jet 14",
      year: "2020",
      base: 8900,
      demand: 71,
      specs: { נפח: "125cc", 'ק"מ': "12,000", טסט: "בתוקף" },
      accessories: "2 קסדות וכיסוי",
    },
    {
      name: "אופניים חשמליים Xiaomi",
      brand: "Xiaomi",
      model: "Himo Z20",
      year: "2022",
      base: 2600,
      demand: 77,
      specs: { מנוע: "250W", טווח: "80 ק\"מ", סוללה: "48V" },
      accessories: "מטען מקורי",
    },
  ],
  fashion: [
    {
      name: "מעיל עור וינטג׳",
      brand: "Zara",
      year: "2019",
      base: 320,
      demand: 55,
      specs: { מידה: "L", חומר: "עור אמיתי", צבע: "חום" },
      accessories: "",
    },
    {
      name: "תיק Michael Kors",
      brand: "Michael Kors",
      model: "Jet Set",
      base: 480,
      demand: 63,
      specs: { צבע: "שחור", חומר: "עור", מצב: "ללא שריטות" },
      accessories: "שקית אבק מקורית",
    },
    {
      name: "נעלי Nike Air Max",
      brand: "Nike",
      model: "Air Max 270",
      base: 260,
      demand: 66,
      specs: { מידה: "43", צבע: "לבן/שחור" },
      accessories: "קופסה מקורית",
    },
  ],
  furniture: [
    {
      name: "ספה תלת-מושבית",
      base: 1200,
      demand: 58,
      specs: { סוג: "תלת-מושבית", צבע: "אפור", חומר: "בד" },
      accessories: "",
    },
    {
      name: "שולחן אוכל מעץ מלא",
      base: 950,
      demand: 52,
      specs: { חומר: "עץ אלון", מידות: "160x90", מושבים: "6" },
      accessories: "",
    },
    {
      name: "כורסת יחיד מעוצבת",
      base: 640,
      demand: 49,
      specs: { צבע: "חרדל", חומר: "קטיפה" },
      accessories: "",
    },
  ],
  collectibles: [
    {
      name: "אלבום בולים ותיק",
      base: 540,
      demand: 44,
      specs: { תקופה: "שנות ה-70", כמות: "מאות בולים" },
      accessories: "",
    },
    {
      name: "שעון יד אוטומטי וינטג׳",
      brand: "Seiko",
      base: 780,
      demand: 61,
      specs: { מנגנון: "אוטומטי", קוטר: "38mm" },
      accessories: "קופסה מקורית",
    },
  ],
  other: [
    {
      name: "אופני הרים Trek",
      brand: "Trek",
      model: "Marlin 5",
      base: 1400,
      demand: 70,
      specs: { מידה: "M", הילוכים: "21" },
      accessories: "",
    },
    {
      name: "גיטרה אקוסטית Yamaha",
      brand: "Yamaha",
      model: "F310",
      base: 520,
      demand: 57,
      specs: { סוג: "אקוסטית", עץ: "אשוח" },
      accessories: "נרתיק רך",
    },
    {
      name: "מכונת אספרסו Delonghi",
      brand: "DeLonghi",
      base: 460,
      demand: 60,
      specs: { סוג: "ידנית", לחץ: "15 בר" },
      accessories: "",
    },
  ],
};

const CONDITION_ORDER: Condition[] = [
  "new",
  "like_new",
  "good",
  "fair",
  "worn",
];

function seedFrom(input: AnalyzeInput): number {
  return hashString(input.imageRefs.join("|") + (input.category ?? ""));
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;

  async analyzeProduct(input: AnalyzeInput): Promise<ProductAnalysis> {
    const seed = seedFrom(input);
    const rand = seededRandom(seed);

    const category: Category = input.category ?? pick(
      ["electronics", "furniture", "fashion", "other"] as Category[],
      rand(),
    );
    const entries = CATALOG[category];
    const entry = pick(entries, rand());

    const condition: Condition =
      input.condition ?? pick(["like_new", "good", "good", "fair"], rand());

    const identification: Identification = {
      name: entry.name,
      category,
      brand: entry.brand,
      model: entry.model,
      year: entry.year,
      condition,
    };

    // Value = base adjusted for condition, with small seeded variance.
    const variance = 0.9 + rand() * 0.2; // 0.9 - 1.1
    const estimatedValue = Math.round(
      entry.base * conditionFactor[condition] * variance,
    );
    const confidence = Math.round(
      72 + rand() * 22 - CONDITION_ORDER.indexOf(condition) * 1.5,
    );
    const demandScore = Math.round(
      Math.min(97, Math.max(20, entry.demand + (rand() * 14 - 7))),
    );

    const recommendedPrice = Math.round(estimatedValue * 1.03);
    const quickSalePrice = Math.round(estimatedValue * 0.9);
    const maxPrice = Math.round(estimatedValue * 1.14);

    const listing = this.buildListing({
      identification,
      recommendedPrice,
      quickSalePrice,
      maxPrice,
      note: input.note,
      entry,
    });

    return {
      identification,
      estimate: {
        estimatedValue,
        confidence,
        demandScore,
        reasoning:
          "ההערכה מבוססת על מודעות דומות שפורסמו לאחרונה, מצב המוצר שזוהה מהתמונות והביקוש הנוכחי בשוק היד-שנייה.",
      },
      listing,
    };
  }

  async generateListing(ctx: ListingContext): Promise<ListingContent> {
    const entry = findEntry(ctx.identification.name, ctx.identification.category);
    return this.buildListing({ ...ctx, entry });
  }

  private buildListing(args: {
    identification: Identification;
    recommendedPrice: number;
    quickSalePrice: number;
    maxPrice: number;
    note?: string;
    entry?: CatalogEntry;
    variant?: number;
  }): ListingContent {
    const { identification: id, entry } = args;
    const rand = seededRandom(
      hashString(id.name + (args.variant ?? 0) + (args.note ?? "")),
    );
    const condLabel = conditionLabels[id.condition];

    const titleTemplates = [
      `${id.name} — ${condLabel}${entry?.accessories ? `, כולל אביזרים` : ""}`,
      `${id.name} במצב ${condLabel} למכירה`,
      `${id.name} ${id.year ?? ""} — ${condLabel}`.trim(),
    ];
    const title = pick(titleTemplates, rand());

    const details: Record<string, string> = {
      מצב: condLabel,
      ...(id.brand ? { מותג: id.brand } : {}),
      ...(id.model ? { דגם: id.model } : {}),
      ...(id.year ? { שנה: id.year } : {}),
      ...(entry?.specs ?? {}),
      ...(entry?.accessories ? { אביזרים: entry.accessories } : {}),
    };

    const specSentence = Object.entries(entry?.specs ?? {})
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const openings = [
      `${id.name} למכירה במצב ${condLabel}.`,
      `מציע למכירה ${id.name}, ${condLabel}.`,
      `${id.name} שמור ומטופל, ${condLabel}.`,
    ];
    const closings = [
      "ניתן לתאם צפייה ומסירה באזור המרכז. מוזמנים לפנות לכל שאלה.",
      "מסירה מהירה, אפשרות לתיאום מיידי. פרטים נוספים בפרטי.",
      "המוצר זמין לצפייה. מחיר סופי לרציניים, אפשר לסגור היום.",
    ];

    const description = [
      pick(openings, rand()),
      specSentence ? `${specSentence}.` : "",
      entry?.accessories ? `כולל ${entry.accessories}.` : "",
      args.note ? args.note : "",
      pick(closings, rand()),
    ]
      .filter(Boolean)
      .join(" ");

    const strategy = `המוצר בביקוש סביר עד גבוה. פרסמו ב-${args.recommendedPrice.toLocaleString(
      "he-IL",
    )} ₪ והשאירו מרחב קטן למיקוח. למכירה מהירה אפשר לרדת עד ${args.quickSalePrice.toLocaleString(
      "he-IL",
    )} ₪, אך לא מתחת לכך.`;

    return {
      title,
      description,
      details,
      strategy,
      startPrice: args.recommendedPrice,
      expectedPrice: Math.round((args.recommendedPrice + args.quickSalePrice) / 2),
      minPrice: args.quickSalePrice,
    };
  }

  async negotiate(ctx: NegotiationContext): Promise<NegotiationResult> {
    const rand = seededRandom(hashString(ctx.buyerMessage + ctx.productName));
    const mid = Math.round((ctx.listedPrice + ctx.minPrice) / 2 / 10) * 10;
    const small = Math.round((ctx.listedPrice - 50) / 10) * 10;

    const friendly = pick(
      [
        `היי! תודה על הפנייה 🙂 אני יכול לבוא לקראתך קצת — ${small.toLocaleString(
          "he-IL",
        )} ₪ ואפשר לסגור. המוצר באמת שמור.`,
        `שלום! שמח שהתעניינת. אפשר לרדת ל-${small.toLocaleString(
          "he-IL",
        )} ₪, נראה לי מחיר הוגן לשנינו.`,
      ],
      rand(),
    );

    const firm = pick(
      [
        `המחיר כבר אטרקטיבי ביחס למצב ולמה שמבקשים בשוק. אוכל להוריד מעט ל-${small.toLocaleString(
          "he-IL",
        )} ₪, זה המקסימום שאפשר.`,
        `בדקתי מחירים דומים והמחיר משקף היטב את המצב. ${small.toLocaleString(
          "he-IL",
        )} ₪ וזה סגור.`,
      ],
      rand(),
    );

    const quick = pick(
      [
        `אם אתה מגיע היום, אפשר לדבר על ${mid.toLocaleString(
          "he-IL",
        )} ₪ ולסגור עכשיו.`,
        `רוצה לסגור מהר? ${mid.toLocaleString(
          "he-IL",
        )} ₪ במזומן היום והמוצר שלך.`,
      ],
      rand(),
    );

    return { friendly, firm, quick };
  }
}

function findEntry(name: string, category: Category): CatalogEntry | undefined {
  return CATALOG[category]?.find((e) => e.name === name);
}
