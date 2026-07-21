// Sends the end-of-day summary to the chefs once a day, at SUMMARY_HOUR
// (Asia/Jerusalem time). Lightweight, dependency-free minute ticker.
const store = require('./salesStore');
const { sendDailySummary } = require('./whatsapp');

const TZ = 'Asia/Jerusalem';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', hour12: false,
});

function jerusalemDay() {
  return dayFmt.format(new Date());
}
function jerusalemHour() {
  return parseInt(hourFmt.format(new Date()), 10);
}

function startDailySummaryScheduler() {
  const hour = Number(process.env.SUMMARY_HOUR);
  const targetHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 22;
  let lastSentDay = null;

  const tick = async () => {
    if (jerusalemHour() !== targetHour) return;
    const day = jerusalemDay();
    if (day === lastSentDay) return;
    lastSentDay = day;

    const summary = await store.dailySummary(day);
    if (summary.entryCount === 0) {
      console.log(`Daily summary ${day}: nothing to report`);
      return;
    }
    try {
      await sendDailySummary(summary);
    } catch (err) {
      console.error('Daily summary send failed:', err.message);
    }
  };

  setInterval(tick, 60 * 1000);
  console.log(`Daily summary scheduled for ${targetHour}:00 (${TZ})`);
}

module.exports = { startDailySummaryScheduler };
