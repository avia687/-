require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const ordersRouter = require('./routes/orders');
const incomeRouter = require('./routes/income');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/orders', ordersRouter);
app.use('/api/income', incomeRouter);

// Income tracker dashboard (syncs with orders above).
app.get('/income', (req, res) => {
  res.sendFile(path.join(__dirname, '../income-tracker/index.html'));
});

// Serve React build
const buildPath = path.join(__dirname, '../client/dist');
const fs = require('fs');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`הקרון server running on port ${PORT}`);
});
