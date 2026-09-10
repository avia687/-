import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getTemplate } from "../src/lib/business/templates";

const prisma = new PrismaClient();

// Seeds a fully-populated demo tenant, "Avia Sofa Cleaning", so the UI looks
// real on first open. Idempotent: re-running resets the demo org's data.

const DEMO_EMAIL = "avia@demo.bizos";
const DEMO_PASSWORD = "demo1234";

function daysFromNow(d: number, hour = 10) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(hour, 0, 0, 0);
  return x;
}

async function main() {
  const template = getTemplate("sofa_cleaning");

  // Owner user (also a platform admin so the /admin panel is viewable).
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, isPlatformAdmin: true },
    create: { email: DEMO_EMAIL, name: "אביה", passwordHash, isPlatformAdmin: true },
  });

  // Reset any previous demo org for a clean, repeatable seed.
  const prev = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
  if (prev) await prisma.organization.delete({ where: { id: prev.organizationId } }).catch(() => {});

  const org = await prisma.organization.create({
    data: {
      slug: `avia-sofa-cleaning-${Math.random().toString(36).slice(2, 6)}`,
      members: { create: { userId: user.id, role: "OWNER" } },
      subscription: { create: { plan: "pro" } },
      profile: {
        create: {
          businessType: "sofa_cleaning",
          name: "Avia Sofa Cleaning",
          ownerName: "אביה",
          phone: "052-1234567",
          whatsapp: "052-1234567",
          email: "avia@demo.bizos",
          address: "רחוב הרצל 10, תל אביב",
          serviceAreas: "תל אביב, מרכז, השרון",
          currency: "ILS",
          brandColor: "#4f46e5",
          onboardedAt: new Date(),
        },
      },
    },
  });
  const organizationId = org.id;

  // Services from the template price list.
  await prisma.service.createMany({
    data: template.sampleServices.map((s) => ({
      organizationId,
      name: s.name,
      category: s.category,
      price: s.price,
      cost: s.cost ?? 0,
      durationMin: s.durationMin,
    })),
  });
  const services = await prisma.service.findMany({ where: { organizationId } });

  // Employees.
  const [emp1] = await Promise.all([
    prisma.employee.create({ data: { organizationId, name: "יוסי לוי", phone: "053-9998877", role: "EMPLOYEE", title: "טכנאי ניקוי", hourlyRate: 60 } }),
    prisma.employee.create({ data: { organizationId, name: "דנה כהן", phone: "054-1112233", role: "MANAGER", title: "אחראית תפעול", hourlyRate: 75 } }),
  ]);

  // Customers.
  const customerData = [
    { name: "דוד ישראלי", phone: "050-1111111", address: "דיזנגוף 50, תל אביב", email: "david@example.com" },
    { name: "מיכל אברהם", phone: "050-2222222", address: "ויצמן 12, רמת גן" },
    { name: "רונן שפירא", phone: "050-3333333", address: "סוקולוב 8, הרצליה" },
    { name: "נועה בר", phone: "050-4444444", address: "ביאליק 3, גבעתיים" },
    { name: "אבי פרץ", phone: "050-5555555", address: "הנביאים 22, תל אביב" },
    { name: "שירה מזרחי", phone: "050-6666666", address: "אחד העם 5, פתח תקווה" },
  ];
  const customers = [];
  for (const c of customerData) {
    customers.push(await prisma.customer.create({ data: { ...c, organizationId } }));
  }

  // Leads across the pipeline.
  const leadStages = ["new", "contacted", "quoted", "awaiting", "won", "lost"];
  const sources = ["פייסבוק", "המלצה", "גוגל", "אינסטגרם", "לקוח חוזר"];
  for (let i = 0; i < 8; i++) {
    await prisma.lead.create({
      data: {
        organizationId,
        title: `ניקוי ${["פינת ישיבה", "ספה 3 מושבים", "שטיח גדול", "מזרן זוגי"][i % 4]}`,
        contactName: ["איתי", "גלית", "עומר", "רותם", "ליאור"][i % 5],
        contactPhone: `052-99900${i}${i}`,
        source: sources[i % sources.length],
        status: leadStages[i % leadStages.length],
        value: 250 + (i % 5) * 120,
        probability: [20, 40, 60, 75, 90, 10][i % 6],
      },
    });
  }

  // Jobs (past + upcoming), payments, quotes.
  const jobDays = [-10, -7, -5, -3, -1, 0, 0, 1, 2, 4, 6];
  for (let i = 0; i < jobDays.length; i++) {
    const svc = services[i % services.length];
    const cust = customers[i % customers.length];
    const day = jobDays[i];
    const status = day < 0 ? "done" : day === 0 ? "in_progress" : "scheduled";
    const job = await prisma.job.create({
      data: {
        organizationId,
        customerId: cust.id,
        employeeId: emp1.id,
        title: svc.name,
        serviceName: svc.name,
        address: cust.address,
        price: svc.price,
        status,
        startAt: daysFromNow(day, 9 + (i % 6)),
      },
    });
    // Payment for completed jobs; some outstanding.
    if (status === "done") {
      await prisma.payment.create({
        data: {
          organizationId,
          customerId: cust.id,
          jobId: job.id,
          amount: svc.price,
          method: ["cash", "bit", "transfer", "card"][i % 4],
          status: i % 4 === 0 ? "pending" : "paid",
          paidAt: i % 4 === 0 ? null : daysFromNow(day, 12),
        },
      });
    }
  }

  // Quotes with items + totals.
  for (let i = 0; i < 4; i++) {
    const cust = customers[i];
    const s1 = services[i % services.length];
    const s2 = services[(i + 2) % services.length];
    const subtotal = s1.price + s2.price;
    const taxAmount = Math.round(subtotal * 0.17 * 100) / 100;
    await prisma.quote.create({
      data: {
        organizationId,
        customerId: cust.id,
        number: i + 1,
        status: ["approved", "sent", "sent", "draft"][i],
        subtotal,
        taxRate: 0.17,
        taxAmount,
        total: subtotal + taxAmount,
        approvedAt: i === 0 ? new Date() : null,
        items: {
          create: [
            { serviceId: s1.id, name: s1.name, quantity: 1, unitPrice: s1.price },
            { serviceId: s2.id, name: s2.name, quantity: 1, unitPrice: s2.price },
          ],
        },
      },
    });
  }

  // Expenses.
  const expenses = [
    { category: "materials", description: "חומרי ניקוי", amount: 420 },
    { category: "fuel", description: "דלק לרכב", amount: 300 },
    { category: "ads", description: "קמפיין פייסבוק", amount: 250 },
    { category: "equipment", description: "מכונת ניקוי בקיטור", amount: 1800 },
  ];
  for (let i = 0; i < expenses.length; i++) {
    await prisma.expense.create({ data: { organizationId, ...expenses[i], spentAt: daysFromNow(-i * 3) } });
  }

  // Reviews (some submitted, one pending).
  await prisma.review.create({ data: { organizationId, customerId: customers[0].id, rating: 5, comment: "שירות מעולה, הספה כמו חדשה!", submittedAt: new Date() } });
  await prisma.review.create({ data: { organizationId, customerId: customers[1].id, rating: 4, comment: "מקצועי ומהיר", submittedAt: new Date() } });
  await prisma.review.create({ data: { organizationId, customerId: customers[2].id } });

  // Default automations (disabled by default).
  for (const key of ["job_confirmation", "reminder_24h", "thank_you", "review_request", "quote_followup"]) {
    await prisma.automation.create({ data: { organizationId, key, enabled: key === "reminder_24h" } });
  }

  // A couple of notifications.
  await prisma.notification.createMany({
    data: [
      { organizationId, type: "quote_approved", title: "הצעת מחיר אושרה", body: "הצעה #1 בסך ₪819" },
      { organizationId, type: "review_new", title: "ביקורת חדשה", body: "דירוג 5/5" },
    ],
  });

  console.log("\n✅ Seed complete — demo business ready.");
  console.log("   התחברות לדמו:");
  console.log(`   אימייל:  ${DEMO_EMAIL}`);
  console.log(`   סיסמה:   ${DEMO_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
