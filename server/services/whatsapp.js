const twilio = require('twilio');

const CHEFS = [
  { name: 'רמי',  phone: '0545414123' },
  { name: 'אביה', phone: '0505854868' }
];

function toWhatsAppNumber(israeliPhone) {
  const digits = israeliPhone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  return '+' + digits;
}

function getClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function buildOrderMessage(order) {
  const lines = order.items.map(item => {
    const extras = item.extras && item.extras.length > 0
      ? ` (${item.extras.join(', ')})`
      : '';
    return `• ${item.name}${extras} — ${item.price}₪`;
  });

  return [
    `🛵 הזמנה חדשה! #${order.id}`,
    `👤 ${order.customerName}`,
    `📞 ${order.customerPhone}`,
    ``,
    `📋 הזמנה:`,
    ...lines,
    ``,
    `💰 סה"כ: ${order.total}₪`
  ].join('\n');
}

async function sendOrderToChefs(order) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  const client = getClient();
  const message = buildOrderMessage(order);
  const from = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

  for (const chef of CHEFS) {
    try {
      await client.messages.create({
        from,
        to: `whatsapp:${toWhatsAppNumber(chef.phone)}`,
        body: message
      });
      console.log(`WhatsApp sent to ${chef.name}`);
    } catch (err) {
      console.error(`Failed to send to ${chef.name}:`, err.message);
    }
  }
}

function buildDailySummaryMessage(summary) {
  const dateLabel = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(summary.date + 'T00:00:00'));

  const top = summary.topItems.slice(0, 5).map((it, i) =>
    `${i + 1}. ${it.name} — ${it.count === 1 ? 'הזמנה אחת' : it.count + ' הזמנות'}`
  );

  const lines = [
    `🧾 סיכום יומי — הקרון`,
    `📅 ${dateLabel}`,
    ``,
    `💰 סה"כ הכנסה: ${summary.total}₪`,
    `🛒 הזמנות: ${summary.orderCount}`,
  ];
  if (summary.orderCount > 0) {
    lines.push(`📊 ממוצע להזמנה: ${summary.avgOrder}₪`);
  }
  if (top.length) {
    lines.push(``, `🏆 הכי מוזמן היום:`, ...top);
  }
  return lines.join('\n');
}

// Send the end-of-day summary to the chefs. Returns true if messages were sent.
async function sendDailySummary(summary) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log('Daily summary skipped: Twilio not configured');
    return false;
  }
  const client = getClient();
  const message = buildDailySummaryMessage(summary);
  const from = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

  for (const chef of CHEFS) {
    try {
      await client.messages.create({
        from,
        to: `whatsapp:${toWhatsAppNumber(chef.phone)}`,
        body: message,
      });
      console.log(`Daily summary sent to ${chef.name}`);
    } catch (err) {
      console.error(`Failed to send summary to ${chef.name}:`, err.message);
    }
  }
  return true;
}

async function sendReadyToCustomer(order) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  const client = getClient();
  const message = [
    `✅ ההזמנה שלך מוכנה!`,
    `הקרון — הזמנה #${order.id}`,
    `בוא לאסוף 🎉`
  ].join('\n');

  try {
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${toWhatsAppNumber(order.customerPhone)}`,
      body: message
    });
    console.log(`Ready notification sent to ${order.customerName}`);
  } catch (err) {
    console.error('Failed to send ready notification:', err.message);
  }
}

module.exports = {
  sendOrderToChefs,
  sendReadyToCustomer,
  sendDailySummary,
  buildDailySummaryMessage,
};
