const { Router } = require('express');
const { sendOrderToChefs, sendReadyToCustomer } = require('../services/whatsapp');

const router = Router();

// In-memory store — replace with DB if needed
const orders = [];
let counter = 1;

router.post('/', async (req, res) => {
  const { customerName, customerPhone, items, total } = req.body;

  if (!customerName || !customerPhone || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const order = {
    id: String(counter++).padStart(3, '0'),
    customerName,
    customerPhone,
    items,
    total,
    status: 'pending',
    createdAt: new Date()
  };

  orders.push(order);

  sendOrderToChefs(order).catch(console.error);

  res.json({ success: true, orderId: order.id });
});

router.get('/', (req, res) => {
  const pending = orders
    .filter(o => o.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(pending);
});

router.put('/:id/ready', async (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.status = 'ready';
  order.readyAt = new Date();

  sendReadyToCustomer(order).catch(console.error);

  res.json({ success: true });
});

module.exports = router;
