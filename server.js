require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Known sites ───
const SITES = [
  { name: 'G2A', domain: 'g2a.com', type: 'grey-market', trust: 'Medium risk · check seller ratings & G2A Plus protection', search: q => `https://www.g2a.com/search?query=${encodeURIComponent(q)}` },
  { name: 'Plati.Market', domain: 'plati.market', type: 'grey-market', trust: 'High revoke risk · grey-market keys/accounts', search: q => `https://plati.market/search/${encodeURIComponent(q)}` },
  { name: 'GGSEL', domain: 'ggsel.net', type: 'grey-market', trust: 'High risk · Chinese grey-market', search: q => `https://www.ggsel.net/search?keyword=${encodeURIComponent(q)}` },
  { name: 'Eneba', domain: 'eneba.com', type: 'reseller', trust: 'Medium risk · buyer protection', search: q => `https://www.eneba.com/store?text=${encodeURIComponent(q)}` },
  { name: 'Kinguin', domain: 'kinguin.net', type: 'reseller', trust: 'Medium risk · buyer protection', search: q => `https://www.kinguin.net/catalogsearch/result?q=${encodeURIComponent(q)}` },
  { name: 'CDKeys', domain: 'cdkeys.com', type: 'reseller', trust: 'Low-medium · established reseller', search: q => `https://www.cdkeys.com/catalogsearch/result?q=${encodeURIComponent(q)}` },
  { name: 'GamsGo', domain: 'gamsgo.com', type: 'shared', trust: 'Medium risk · subscription sharing', search: () => `https://www.gamsgo.com/` },
  { name: 'GoSplit', domain: 'gosplit.io', type: 'shared', trust: 'Medium risk · subscription splitting', search: () => `https://gosplit.io/` },
  { name: 'Together Price', domain: 'togetherprice.com', type: 'shared', trust: 'Low-medium · established sharing', search: () => `https://togetherprice.com/` },
  { name: 'AppSumo', domain: 'appsumo.com', type: 'lifetime key', trust: 'Low risk · established LTD', search: q => `https://appsumo.com/search/?q=${encodeURIComponent(q)}` },
  { name: 'StackSocial', domain: 'stacksocial.com', type: 'lifetime key', trust: 'Low risk · deal platform', search: q => `https://stacksocial.com/search?q=${encodeURIComponent(q)}` },
  { name: 'eBay', domain: 'ebay.com', type: 'reseller', trust: 'Medium · eBay buyer protection', search: q => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q + ' subscription')}` },
  { name: 'AliExpress', domain: 'aliexpress.com', type: 'grey-market', trust: 'Medium-high risk · buyer protection', search: q => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}` },
  { name: 'Sellix', domain: 'sellix.io', type: 'grey-market', trust: 'High risk · individual sellers', search: q => `https://sellix.io/search?q=${encodeURIComponent(q)}` },
  { name: 'Reddit', domain: 'reddit.com', type: 'reseller', trust: 'Info only · community tips', search: q => `https://www.reddit.com/search/?q=${encodeURIComponent(q + ' cheap deal')}` },
];

// ─── Price/classification helpers ───
function extractPrice(text) {
  if (!text) return null;
  const patterns = [
    { re: /\$\s?(\d{1,5}(?:[.,]\d{1,2})?)/, fx: 1 },
    { re: /(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:USD|usd)/, fx: 1 },
    { re: /€\s?(\d{1,5}(?:[.,]\d{1,2})?)/, fx: 1.08 },
    { re: /(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:EUR|eur)/, fx: 1.08 },
    { re: /£\s?(\d{1,5}(?:[.,]\d{1,2})?)/, fx: 1.26 },
  ];
  for (const { re, fx } of patterns) {
    const m = text.match(re);
    if (m) { const v = parseFloat(m[1].replace(',', '.')) * fx; if (v > 0 && v < 50000) return Math.round(v * 100) / 100; }
  }
  return null;
}

function guessDuration(t) {
  t = (t || '').toLowerCase();
  if (/lifetime/i.test(t)) return 'Lifetime';
  const m = t.match(/(\d+)\s*(month|year|day|week)/i);
  if (m) return `${m[1]} ${m[2]}${+m[1] > 1 ? 's' : ''}`;
  if (/annual|yearly/i.test(t)) return '1 year';
  if (/monthly/i.test(t)) return '1 month';
  return '—';
}

function classifyUrl(url, text) {
  const u = (url + ' ' + text).toLowerCase();
  for (const s of SITES) { if (u.includes(s.domain)) return { type: s.type, trust: s.trust }; }
  if (/lifetime/i.test(u)) return { type: 'lifetime key', trust: '🔑 Lifetime deal' };
  if (/shared|split|family/i.test(u)) return { type: 'shared', trust: '👥 Shared account' };
  if (/trial|free/i.test(u)) return { type: 'trial', trust: 'ℹ️ Trial/promo' };
  if (/official|\/pricing/i.test(u)) return { type: 'official', trust: '✅ Official' };
  return { type: 'reseller', trust: '⚡ Third-party' };
}

function sourceName(url) {
  try { const h = new URL(url).hostname.replace('www.', ''); const s = SITES.find(x => h.includes(x.domain)); return s ? s.name : h; } catch { return url; }
}

// ─── Cache ───
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

function cacheKey(p) { return path.join(CACHE_DIR, Buffer.from(p.toLowerCase()).toString('base64url') + '.json'); }
function getCache(p) { try { const d = JSON.parse(fs.readFileSync(cacheKey(p), 'utf8')); if (Date.now() - d.ts < 7200000) return d.results; } catch {} return null; }
function setCache(p, r) { try { fs.writeFileSync(cacheKey(p), JSON.stringify({ ts: Date.now(), results: r })); } catch {} }

// ─── Populate endpoint (POST search results from external source) ───
app.post('/api/populate', async (req, res) => {
  const { product, results } = req.body;
  if (!product || !Array.isArray(results)) return res.status(400).json({ error: 'Need product and results array' });
  const parsed = results.filter(r => r.url && r.title).map(r => {
    const combined = r.title + ' ' + (r.snippet || '');
    const price = extractPrice(combined);
    const { type, trust } = classifyUrl(r.url, combined);
    return {
      source: sourceName(r.url), url: r.url, product: (r.title || product).slice(0, 120),
      price, priceDisplay: price != null ? `$${price.toFixed(2)}` : '—',
      duration: guessDuration(combined), type, trust,
    };
  });
  // Merge with existing cache
  const existing = getCache(product) || [];
  const merged = dedup([...parsed, ...existing]);
  setCache(product, merged);
  res.json({ ok: true, cached: merged.length });
});

function dedup(results) {
  const seen = new Set();
  return results.filter(r => {
    const k = r.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(k)) return false; seen.add(k); return true;
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

  send('progress', { completed: 0, total: 4, phase: '🔍 Starting deal hunt…' });

  let allResults = [];

  // 1. Cache
  const cached = getCache(product);
  if (cached && cached.length) {
    allResults.push(...cached);
    send('progress', { completed: 1, total: 4, phase: `💰 Found ${cached.length} cached deals` });
    send('partial', { results: allResults });
  } else {
    send('progress', { completed: 1, total: 4, phase: 'No cached results yet' });
  }

  // 2. Try live scraping (sites that work from this server)
  send('progress', { completed: 2, total: 4, phase: '🌐 Checking live marketplaces…' });
  
  const liveScrapers = [
    // AppSumo - works well
    (async () => {
      try {
        const { data } = await axios.get('https://appsumo.com/search/', {
          params: { q: product }, headers: { 'User-Agent': UA }, timeout: 8000,
        });
        const $ = cheerio.load(data);
        const results = [];
        // Find price patterns like $49/lifetime$288
        const text = $.html();
        const matches = text.matchAll(/href="(\/products\/[^"]+)"[^>]*>[\s\S]*?(\$\d+)\/lifetime\$(\d+)/g);
        for (const m of matches) {
          if (results.length >= 10) break;
          const url = 'https://appsumo.com' + m[1];
          const price = parseFloat(m[2].replace('$', ''));
          const original = parseFloat(m[3]);
          results.push({
            source: 'AppSumo', url, product: m[1].replace('/products/', '').replace(/[-/]/g, ' ').trim(),
            price, priceDisplay: `$${price.toFixed(2)}`, duration: 'Lifetime',
            type: 'lifetime key', trust: 'Low risk · established LTD platform',
          });
        }
        return results;
      } catch { return []; }
    })(),
    // Eneba API attempt 
    (async () => {
      try {
        const { data } = await axios.get('https://www.eneba.com/store/all', {
          params: { text: product }, headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 8000,
        });
        const $ = cheerio.load(data);
        const results = [];
        $('a[href*="/other/"]').each((i, el) => {
          if (results.length >= 8) return false;
          const href = 'https://www.eneba.com' + ($(el).attr('href') || '');
          const name = $(el).text().trim();
          const price = extractPrice($(el).closest('[class]').text());
          if (name && name.length > 3) results.push({
            source: 'Eneba', url: href, product: name, price,
            priceDisplay: price ? `$${price.toFixed(2)}` : '—',
            duration: guessDuration(name), type: 'reseller', trust: 'Medium risk · buyer protection',
          });
        });
        return results;
      } catch { return []; }
    })(),
  ];

  const liveResults = await Promise.allSettled(liveScrapers);
  for (const r of liveResults) {
    if (r.status === 'fulfilled' && r.value.length) allResults.push(...r.value);
  }
  
  if (allResults.length) {
    send('progress', { completed: 3, total: 4, phase: `Found ${allResults.length} results so far` });
    send('partial', { results: dedup(allResults) });
  } else {
    send('progress', { completed: 3, total: 4, phase: 'Building marketplace links…' });
  }

  // 3. Always add direct marketplace links
  const directLinks = SITES.map(s => ({
    source: s.name, url: s.search(product),
    product: `Search "${product}" on ${s.name}`,
    price: null, priceDisplay: '→ Visit', duration: '—', type: s.type, trust: s.trust,
  }));
  allResults.push(...directLinks);

  const final = dedup(allResults);
  send('progress', { completed: 4, total: 4, phase: '✅ Done!' });
  send('partial', { results: final });
  send('done', { results: final });
  res.end();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', sites: SITES.length }));

app.listen(PORT, '0.0.0.0', () => console.log(`DealHunter AI running on http://0.0.0.0:${PORT}`));
