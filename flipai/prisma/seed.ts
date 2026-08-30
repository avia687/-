import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function period(monthsAgo = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const adminHash = await bcrypt.hash("admin1234", 10);

  // --- Demo seller ---
  const demo = await prisma.user.upsert({
    where: { email: "demo@flipai.co" },
    update: {},
    create: {
      email: "demo@flipai.co",
      name: "דניאל כהן",
      passwordHash,
      role: "user",
      sellCategory: "electronics",
      sellFrequency: "monthly",
      onboardedAt: new Date(),
      subscription: {
        create: { plan: "pro", status: "active", provider: "mock" },
      },
    },
  });

  await prisma.usage.upsert({
    where: { userId_period: { userId: demo.id, period: period(0) } },
    update: { analysesUsed: 3 },
    create: { userId: demo.id, period: period(0), analysesUsed: 3 },
  });

  // --- Admin ---
  await prisma.user.upsert({
    where: { email: "admin@flipai.co" },
    update: { role: "admin" },
    create: {
      email: "admin@flipai.co",
      name: "מנהל FlipAI",
      passwordHash: adminHash,
      role: "admin",
      sellCategory: "other",
      sellFrequency: "frequently",
      onboardedAt: new Date(),
      subscription: {
        create: { plan: "seller", status: "active", provider: "mock" },
      },
    },
  });

  // Clean previous demo products for idempotency
  await prisma.product.deleteMany({ where: { userId: demo.id } });

  type Sample = {
    name: string;
    category: string;
    condition: string;
    status: string;
    img: string;
    est: number;
    low: number;
    high: number;
    rec: number;
    quick: number;
    max: number;
    conf: number;
    demand: number;
    deal: number;
    title: string;
    desc: string;
    details: Record<string, string>;
    strategy: string;
  };

  const samples: Sample[] = [
    {
      name: "אייפון 13 128GB",
      category: "electronics",
      condition: "like_new",
      status: "active",
      img: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=640&q=80",
      est: 1850,
      low: 1650,
      high: 2050,
      rec: 1900,
      quick: 1690,
      max: 2100,
      conf: 92,
      demand: 84,
      deal: 8.7,
      title: "אייפון 13 128GB במצב מצוין — סוללה 89%",
      desc: "אייפון 13 בנפח 128GB, שמור מאוד, ללא שריטות. הסוללה על 89%. כולל מטען מקורי וקופסה. מתאים למסירה מהירה באזור המרכז.",
      details: {
        דגם: "iPhone 13",
        נפח: "128GB",
        "מצב סוללה": "89%",
        אביזרים: "מטען מקורי, קופסה",
        אחריות: "נגמרה",
      },
      strategy:
        "המכשיר מבוקש מאוד. פרסמו ב-1,900 ₪, השאירו מרווח למיקוח קטן ואל תרדו מתחת ל-1,690 ₪.",
    },
    {
      name: "ספה תלת-מושבית אפורה",
      category: "furniture",
      condition: "good",
      status: "active",
      img: "https://images.unsplash.com/photo-1550226891-ef816aed4a98?w=640&q=80",
      est: 1200,
      low: 950,
      high: 1450,
      rec: 1250,
      quick: 990,
      max: 1500,
      conf: 78,
      demand: 61,
      deal: 7.4,
      title: "ספה תלת-מושבית אפורה — נוחה ומרווחת",
      desc: "ספה תלת-מושבית בצבע אפור בהיר, בד נעים למגע, יושבת מצוין. סימני שימוש קלים. פינוי עצמי מקומה ראשונה עם מעלית.",
      details: {
        סוג: "תלת-מושבית",
        צבע: "אפור בהיר",
        חומר: "בד",
        מידות: "210 ס״מ",
      },
      strategy:
        "רהיטים גדולים נמכרים לאט יותר. תמחרו ב-1,250 ₪ אך היו גמישים למכירה מהירה סביב 990 ₪, במיוחד למי שאוסף מיד.",
    },
    {
      name: "אופני הרים Trek Marlin 5",
      category: "other",
      condition: "good",
      status: "sold",
      img: "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=640&q=80",
      est: 1400,
      low: 1150,
      high: 1650,
      rec: 1450,
      quick: 1200,
      max: 1700,
      conf: 81,
      demand: 72,
      deal: 8.1,
      title: "אופני הרים Trek Marlin 5 מידה M",
      desc: "אופני הרים Trek Marlin 5, מידה M, מצב טוב מאוד, טופלו לאחרונה. בלמים ותפעול חלקים. מתאים לרוכב 170-182 ס״מ.",
      details: {
        מותג: "Trek",
        דגם: "Marlin 5",
        מידה: "M",
        הילוכים: "21",
      },
      strategy:
        "עונת האביב מגבירה ביקוש. 1,450 ₪ מחיר טוב; אפשר לסגור מהר סביב 1,200 ₪.",
    },
    {
      name: "מעיל עור חום וינטג׳",
      category: "fashion",
      condition: "good",
      status: "draft",
      img: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=640&q=80",
      est: 320,
      low: 220,
      high: 420,
      rec: 340,
      quick: 240,
      max: 450,
      conf: 69,
      demand: 55,
      deal: 6.8,
      title: "מעיל עור חום וינטג׳ — מידה L",
      desc: "מעיל עור אמיתי בגוון חום, סטייל וינטג׳, מידה L. עור רך ואיכותי עם פטינה יפה. סימני שימוש שמוסיפים אופי.",
      details: {
        חומר: "עור אמיתי",
        מידה: "L",
        צבע: "חום",
        סגנון: "וינטג׳",
      },
      strategy:
        "פריט נישה. פרסמו ב-340 ₪ עם תמונות טובות; לקונה רציני אפשר לרדת ל-240 ₪.",
    },
  ];

  let created = 0;
  for (const s of samples) {
    await prisma.product.create({
      data: {
        userId: demo.id,
        name: s.name,
        category: s.category,
        condition: s.condition,
        status: s.status,
        images: {
          create: { url: s.img, thumbUrl: s.img, position: 0 },
        },
        analysis: {
          create: {
            estimatedValue: s.est,
            lowRange: s.low,
            highRange: s.high,
            recommendedPrice: s.rec,
            quickSalePrice: s.quick,
            maxPrice: s.max,
            confidence: s.conf,
            demandScore: s.demand,
            dealScore: s.deal,
            scorePrice: Math.round((s.deal + 0.3) * 10) / 10 > 10 ? 9.5 : s.deal,
            scoreCondition: 8.0,
            scoreDemand: Math.round((s.demand / 10) * 10) / 10,
            scoreResale: Math.round((s.deal - 0.4) * 10) / 10,
            source: "ai_estimated",
            reasoning:
              "מבוסס על מודעות דומות, מצב המוצר וביקוש נוכחי בשוק היד-שנייה.",
          },
        },
        listing: {
          create: {
            title: s.title,
            description: s.desc,
            detailsJson: JSON.stringify(s.details),
            strategy: s.strategy,
            startPrice: s.rec,
            expectedPrice: Math.round((s.rec + s.quick) / 2),
            minPrice: s.quick,
          },
        },
      },
    });
    created++;
  }

  console.log(
    `Seed complete: demo user (demo@flipai.co / demo1234), admin (admin@flipai.co / admin1234), ${created} products.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
