import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend assets
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'JALRAKSHAK Unified Service',
    timestamp: new Date().toISOString(),
  });
});

// Mock/Proxy alert delivery endpoint for server-side environments
app.post('/api/alerts/deliver', (req, res) => {
  const alert = req.body;
  console.log(`[JALRAKSHAK Alert Dispatched via ${alert.channel || 'webhook'}]:`, alert.headline);
  res.json({ success: true, deliveredAt: new Date().toISOString() });
});

app.get('/api/alerts/delivery-status', (req, res) => {
  res.json({
    configured: true,
    channels: {
      webhook: true,
      email: true,
      sms: true,
    },
  });
});

// Single Page Application fallback routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JALRAKSHAK single deployment running at http://localhost:${PORT}`);
});
