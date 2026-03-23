require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Cache ───
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheKey(p) { return path.join(CACHE_DIR, Buffer.from(p.toLowerCase().trim()).toString('base64url') + '.json'); }
function getCache(p) { try { const d = JSON.parse(fs.readFileSync(cacheKey(p), 'utf8')); if (Date.now() - d.ts < 86400000) return d.results; } catch {} return null; }
function setCache(p, r) { try { fs.writeFileSync(cacheKey(p), JSON.stringify({ ts: Date.now(), results: r })); } catch {} }

// ─── Populate API (external system pushes results here) ───
app.post('/api/populate', async (req, res) => {
  const { product, results } = req.body;
  if (!product || !Array.isArray(results)) return res.status(400).json({ error: 'Need product and results[]' });
  const existing = getCache(product) || [];
  const merged = dedup([...results, ...existing]);
  setCache(product, merged);
  res.json({ ok: true, cached: merged.length });
});

// ─── List cached products ───
app.get('/api/cached', (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    const products = files.map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
        const name = Buffer.from(f.replace('.json', ''), 'base64url').toString();
        return { product: name, count: d.results?.length || 0, age: Math.round((Date.now() - d.ts) / 60000) + 'm ago' };
      } catch { return null; }
    }).filter(Boolean);
    res.json(products);
  } catch { res.json([]); }
});

function dedup(results) {
  const seen = new Set();
  return results.filter(r => {
    const k = (r.url || '').replace(/\/$/, '').toLowerCase();
    if (!k || seen.has(k)) return false; seen.add(k); return true;
  }).sort((a, b) => {
    if (a.price != null && b.price != null) return a.price - b.price;
    if (a.price != null) return -1; if (b.price != null) return 1; return 0;
  });
}

// ─── SSE search endpoint ───
app.get('/api/search', async (req, res) => {
  const product = (req.query.q || '').trim();
  if (!product) return res.status(400).json({ error: 'Missing query' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (ev, d) => { try { res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`); } catch {} };

  // Check cache
  const cached = getCache(product);
  if (cached && cached.length) {
    const priced = cached.filter(r => r.price != null);
    send('progress', { completed: 1, total: 1, phase: `💰 Found ${priced.length} deals (${cached.length} total)` });
    send('partial', { results: cached });
    send('done', { results: cached });
  } else {
    send('progress', { completed: 1, total: 1, phase: '⏳ No results yet — researching now, check back in ~30 seconds…' });
    send('done', { results: [], pending: true });
  }
  res.end();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => console.log(`DealHunter AI running on http://0.0.0.0:${PORT}`));
