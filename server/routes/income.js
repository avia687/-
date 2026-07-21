const { Router } = require('express');
const store = require('../services/salesStore');
const { sendDailySummary, buildDailySummaryMessage } = require('../services/whatsapp');

const router = Router();

// List all income entries (orders + manual), newest first.
router.get('/', async (req, res, next) => {
  try {
    const list = (await store.readAll()).slice().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    res.json(list);
  } catch (err) { next(err); }
});

// End-of-day summary: ?date=YYYY-MM-DD (defaults to today).
router.get('/summary', async (req, res, next) => {
  try {
    res.json(await store.dailySummary(req.query.date));
  } catch (err) { next(err); }
});

// Send the daily summary to the chefs on WhatsApp now (manual trigger).
router.post('/summary/send', async (req, res) => {
  let summary;
  try {
    summary = await store.dailySummary(req.query.date || req.body.date);
    const sent = await sendDailySummary(summary);
    res.json({ sent, summary, message: buildDailySummaryMessage(summary) });
  } catch (err) {
    res.status(500).json({ error: err.message, summary });
  }
});

// Add a manual income entry.
router.post('/', async (req, res, next) => {
  const { amount, date, desc, category } = req.body;
  if (!(Number(amount) > 0)) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  try {
    const entry = await store.record({ source: 'manual', amount, date, desc, category });
    res.json({ success: true, entry });
  } catch (err) { next(err); }
});

// Delete an income entry by id.
router.delete('/:id', async (req, res, next) => {
  try {
    const removed = await store.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'entry not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
