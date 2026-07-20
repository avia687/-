const { Router } = require('express');
const store = require('../services/salesStore');
const { sendDailySummary, buildDailySummaryMessage } = require('../services/whatsapp');

const router = Router();

// List all income entries (orders + manual), newest first.
router.get('/', (req, res) => {
  const list = store.readAll().slice().sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') ||
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  res.json(list);
});

// End-of-day summary: ?date=YYYY-MM-DD (defaults to today).
router.get('/summary', (req, res) => {
  res.json(store.dailySummary(req.query.date));
});

// Send the daily summary to the chefs on WhatsApp now (manual trigger).
router.post('/summary/send', async (req, res) => {
  const summary = store.dailySummary(req.query.date || req.body.date);
  try {
    const sent = await sendDailySummary(summary);
    res.json({ sent, summary, message: buildDailySummaryMessage(summary) });
  } catch (err) {
    res.status(500).json({ error: err.message, summary });
  }
});

// Add a manual income entry.
router.post('/', (req, res) => {
  const { amount, date, desc, category } = req.body;
  if (!(Number(amount) > 0)) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const entry = store.record({ source: 'manual', amount, date, desc, category });
  res.json({ success: true, entry });
});

// Delete an income entry by id.
router.delete('/:id', (req, res) => {
  const removed = store.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'entry not found' });
  res.json({ success: true });
});

module.exports = router;
