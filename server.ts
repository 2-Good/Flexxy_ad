import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { gateway } from './server/gateway.js';
import { chatController } from './server/chatController.js';
import { ProviderId, ProviderMessage } from './server/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// API Status & Diagnostics endpoint
app.get('/api/status', async (_req, res) => {
  const catalog = await gateway.getCatalog();
  res.json({
    status: 'online',
    gateway: 'Aetheria AI Gateway v2.5',
    activeProvider: 'gemini',
    availableProviders: catalog,
    modelLatencyProfiles: gateway.getModelLatencyProfiles(),
    telemetryCount: gateway.getTelemetry().length,
    tier: 'Multi-Provider Resilient Mesh',
    streamingSupported: true,
    capabilities: [
      'multi-provider-orchestration',
      'self-healing-circuit-breakers',
      'real-time-sse-streaming',
      'zero-latency-local-synthesis',
      'custom-key-and-endpoint-vault',
      'dynamic-gemini-speed-routing',
    ],
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Gemini model latency and dynamic tiering profiles endpoint
app.get('/api/providers/gemini/models', (_req, res) => {
  res.json({
    success: true,
    models: gateway.getModelLatencyProfiles(),
  });
});

// List all registered AI providers & catalog
app.get('/api/providers', async (req, res) => {
  try {
    const customKeysHeader = req.headers['x-custom-keys'];
    let customKeys: Partial<Record<ProviderId, string>> = {};
    if (typeof customKeysHeader === 'string') {
      try {
        customKeys = JSON.parse(customKeysHeader);
      } catch {
        // Ignore parsing errors
      }
    }
    const catalog = await gateway.getCatalog(customKeys);
    res.json({ success: true, providers: catalog });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Test connection & measure latency for a specific provider
app.post('/api/providers/test', async (req, res) => {
  try {
    const { providerId, customKey, customEndpoint, model } = req.body;
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }
    const result = await gateway.testProvider(providerId as ProviderId, customKey, customEndpoint, model);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Gateway Telemetry endpoint
app.get('/api/providers/telemetry', (_req, res) => {
  res.json({
    success: true,
    events: gateway.getTelemetry(),
  });
});

// Phase 8: Smart Gateway Cache Statistics
app.get('/api/gateway/cache', (_req, res) => {
  res.json({
    success: true,
    cache: gateway.getCacheStats(),
  });
});

// Phase 8: Purge Gateway Cache
app.post('/api/gateway/cache/clear', (_req, res) => {
  gateway.clearCache();
  res.json({
    success: true,
    message: 'Gateway cache purged successfully.',
    cache: gateway.getCacheStats(),
  });
});

// Phase 9: Real-Time Multi-Provider Speed Benchmark Suite
app.post('/api/gateway/benchmark', async (req, res) => {
  try {
    const { customKeys } = req.body || {};
    const report = await gateway.runBenchmarkSuite(customKeys);
    res.json({
      success: true,
      report,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Real-Time Server-Sent Events (SSE) Streaming Endpoint with ChatController Pipeline
app.post('/api/chat/stream', (req, res) => {
  chatController.handleStream(req, res);
});

// Non-streaming chat completion endpoint with ChatController Pipeline
app.post('/api/chat', (req, res) => {
  chatController.handleChat(req, res);
});

// Smart Title Synthesis Endpoint: Generates concise 3-5 word dialogue titles
app.post('/api/chat/title', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.json({ title: 'New Dialogue' });
  }

  // Fast synthesis
  const clean = prompt.trim().replace(/[#*`_]/g, '');
  const words = clean.split(/\s+/).slice(0, 5);
  let title = words.join(' ');
  if (title.length > 28) {
    title = title.slice(0, 28) + '...';
  }
  if (!title) title = 'New Dialogue';

  res.json({ title });
});

// Configure Vite middleware in development
async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Aetheria server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failure:', err);
});
