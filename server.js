require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Direct marketplace scrapers ───

async function scrapeG2A(product) {
  try {
    const { data } = await axios.get('https://www.g2a.com/search/api/v3/suggestions', {
      params: { phrase: product, currency: 'USD' },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      timeout: 10000,
    });
    const results = [];
    for (const item of (data?.data?.products || [])) {
      results.push({
        source: 'G2A',
        url: item.slug ? `https://www.g2a.com${item.slug}` : 'https://www.g2a.com/search?query=' + encodeURIComponent(product),
        product: item.name || product,
        price: item.minPrice ? parseFloat(item.minPrice) : null,
        duration: '—',
        type: 'grey-market',
        trust: 'Medium risk · check seller ratings & G2A Plus protection',
      });
    }
    // Fallback: scrape HTML search
    if (!results.length) {
      const { data: html } = await axios.get('https://www.g2a.com/search', {
        params: { query: product },
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 10000,
      });
      const $ = cheerio.load(html);
      $('[data-locator="zth-product"]').each((i, el) => {
        if (results.length >= 10) return false;
        const name = $(el).find('[data-locator="zth-product-title"]').text().trim();
        const a = $(el).find('a[href]').first();
        let href = a.attr('href') || '';
        if (href && !href.startsWith('http')) href = 'https://www.g2a.com' + href;
        const priceText = $(el).find('[data-locator="zth-price"]').text().trim();
        const price = extractUSD(priceText);
        if (name || href) results.push({
          source: 'G2A', url: href || 'https://www.g2a.com', product: name || product,
          price, duration: guessDuration(name), type: 'grey-market',
          trust: 'Medium risk · check seller ratings & G2A Plus protection',
        });
      });
    }
    return results;
  } catch (e) { console.error('G2A:', e.message); return []; }
}

async function scrapeEneba(product) {
  try {
    // Eneba GraphQL API
    const { data } = await axios.post('https://www.eneba.com/graphql', {
      query: `query { search(text: "${product.replace(/"/g, '')}", currency: "USD", first: 10) { edges { node { name slug price { amount } } } } }`,
    }, {
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    const results = [];
    for (const edge of (data?.data?.search?.edges || [])) {
      const n = edge.node;
      results.push({
        source: 'Eneba', url: n.slug ? `https://www.eneba.com/${n.slug}` : 'https://www.eneba.com',
        product: n.name, price: n.price?.amount ? parseFloat(n.price.amount) / 100 : null,
        duration: guessDuration(n.name), type: 'reseller',
        trust: 'Medium risk · reseller with buyer protection',
      });
    }
    // Fallback HTML
    if (!results.length) {
      const { data: html } = await axios.get('https://www.eneba.com/store', {
        params: { text: product }, headers: { 'User-Agent': UA }, timeout: 10000,
      });
      const $ = cheerio.load(html);
      $('[class*="product"], [class*="Product"]').each((i, el) => {
        if (results.length >= 10) return false;
        const a = $(el).find('a').first();
        const name = $(el).find('[class*="title"], [class*="Title"]').text().trim() || a.text().trim();
        let href = a.attr('href') || '';
        if (href && !href.startsWith('http')) href = 'https://www.eneba.com' + href;
        const priceText = $(el).text();
        const price = extractUSD(priceText);
        if (name) results.push({
          source: 'Eneba', url: href, product: name, price,
          duration: guessDuration(name), type: 'reseller',
          trust: 'Medium risk · reseller with buyer protection',
        });
      });
    }
    return results;
  } catch (e) { console.error('Eneba:', e.message); return []; }
}

async function scrapePlati(product) {
  try {
    const { data } = await axios.get('https://plati.market/search/' + encodeURIComponent(product), {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('a[href*="/itm/"]').each((i, el) => {
      if (results.length >= 12) return false;
      const name = $(el).text().trim();
      let href = $(el).attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://plati.market' + href;
      const row = $(el).closest('tr, div, li');
      const priceText = row.text();
      const price = extractUSD(priceText) || extractRUB(priceText);
      if (name && name.length > 5) results.push({
        source: 'Plati.Market', url: href, product: name, price,
        duration: guessDuration(name), type: 'grey-market',
        trust: 'High revoke risk · grey-market keys/accounts',
      });
    });
    return results;
  } catch (e) { console.error('Plati:', e.message); return []; }
}

async function scrapeKinguin(product) {
  try {
    const { data } = await axios.get('https://www.kinguin.net/catalogsearch/result', {
      params: { q: product },
      headers: { 'User-Agent': UA }, timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('[class*="product-item"], [class*="ProductCard"]').each((i, el) => {
      if (results.length >= 10) return false;
      const a = $(el).find('a').first();
      const name = $(el).find('[class*="title"], [class*="name"], h2, h3').text().trim() || a.text().trim();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://www.kinguin.net' + href;
      const price = extractUSD($(el).text());
      if (name) results.push({
        source: 'Kinguin', url: href, product: name, price,
        duration: guessDuration(name), type: 'reseller',
        trust: 'Medium risk · buyer protection available',
      });
    });
    return results;
  } catch (e) { console.error('Kinguin:', e.message); return []; }
}

async function scrapeCDKeys(product) {
  try {
    const { data } = await axios.get('https://www.cdkeys.com/catalogsearch/result', {
      params: { q: product },
      headers: { 'User-Agent': UA }, timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('.product-item, [class*="product"]').each((i, el) => {
      if (results.length >= 10) return false;
      const a = $(el).find('a.product-item-link, a[href*="/"]').first();
      const name = a.text().trim();
      let href = a.attr('href') || '';
      const price = extractUSD($(el).text());
      if (name && name.length > 3) results.push({
        source: 'CDKeys', url: href, product: name, price,
        duration: guessDuration(name), type: 'reseller',
        trust: 'Low-medium risk · established key reseller',
      });
    });
    return results;
  } catch (e) { console.error('CDKeys:', e.message); return []; }
}

async function scrapeGamsGo(product) {
  try {
    const { data } = await axios.get('https://www.gamsgo.com/', {
      headers: { 'User-Agent': UA }, timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    const prodLower = product.toLowerCase();
    $('[class*="product"], [class*="card"], [class*="item"]').each((i, el) => {
      const text = $(el).text().toLowerCase();
      if (!text.includes(prodLower.split(' ')[0])) return;
      if (results.length >= 5) return false;
      const a = $(el).find('a').first();
      const name = $(el).find('h2, h3, [class*="title"]').text().trim() || a.text().trim();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://www.gamsgo.com' + href;
      const price = extractUSD($(el).text());
      if (name) results.push({
        source: 'GamsGo', url: href || 'https://www.gamsgo.com', product: name, price,
        duration: guessDuration(name), type: 'shared',
        trust: 'Medium risk · subscription sharing platform',
      });
    });
    return results;
  } catch (e) { console.error('GamsGo:', e.message); return []; }
}

async function scrapeAppSumo(product) {
  try {
    const { data } = await axios.get('https://appsumo.com/search/', {
      params: { q: product },
      headers: { 'User-Agent': UA }, timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('[class*="product"], [class*="card"]').each((i, el) => {
      if (results.length >= 8) return false;
      const a = $(el).find('a').first();
      const name = $(el).find('h2, h3, [class*="title"]').text().trim();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://appsumo.com' + href;
      const price = extractUSD($(el).text());
      if (name) results.push({
        source: 'AppSumo', url: href, product: name, price,
        duration: 'Lifetime', type: 'lifetime key',
        trust: 'Low risk · established LTD platform',
      });
    });
    return results;
  } catch (e) { console.error('AppSumo:', e.message); return []; }
}

// ─── Helpers ───
function extractUSD(text) {
  if (!text) return null;
  const m = text.match(/\$\s?(\d{1,5}(?:[.,]\d{1,2})?)/);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); if (v > 0 && v < 50000) return v; }
  const m2 = text.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:USD|usd)/);
  if (m2) { const v = parseFloat(m2[1].replace(',', '.')); if (v > 0 && v < 50000) return v; }
  // EUR
  const m3 = text.match(/€\s?(\d{1,5}(?:[.,]\d{1,2})?)/);
  if (m3) { const v = parseFloat(m3[1].replace(',', '.')); if (v > 0 && v < 50000) return v * 1.08; }
  return null;
}

function extractRUB(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:₽|RUB|руб)/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); if (v > 0) return Math.round(v * 0.011 * 100) / 100; }
  return null;
}

function guessDuration(text) {
  const t = (text || '').toLowerCase();
  if (/lifetime/i.test(t)) return 'Lifetime';
  const m = t.match(/(\d+)\s*(month|year|day|week)/i);
  if (m) return `${m[1]} ${m[2]}${parseInt(m[1]) > 1 ? 's' : ''}`;
  if (/annual|yearly/i.test(t)) return '1 year';
  if (/monthly/i.test(t)) return '1 month';
  return '—';
}

function dedup(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = (r.url || '').replace(/\/$/, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    if (a.price == null && b.price == null) return 0;
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return a.price - b.price;
  });
}

// ─── All scrapers ───
const SCRAPERS = [
  { name: 'G2A', fn: scrapeG2A },
  { name: 'Eneba', fn: scrapeEneba },
  { name: 'Plati.Market', fn: scrapePlati },
  { name: 'Kinguin', fn: scrapeKinguin },
  { name: 'CDKeys', fn: scrapeCDKeys },
  { name: 'GamsGo', fn: scrapeGamsGo },
  { name: 'AppSumo', fn: scrapeAppSumo },
];

// Direct links for manual checking
function getDirectLinks(product) {
  return [
    { source: 'GGSEL', url: `https://www.ggsel.net/search?keyword=${encodeURIComponent(product)}`, product: `Search "${product}" on GGSEL`, price: null, priceDisplay: '→ Check', duration: '—', type: 'grey-market', trust: 'High risk · Chinese grey-market' },
    { source: 'Sellix', url: `https://sellix.io/search?q=${encodeURIComponent(product)}`, product: `Search "${product}" on Sellix`, price: null, priceDisplay: '→ Check', duration: '—', type: 'grey-market', trust: 'High risk · individual sellers' },
    { source: 'GoSplit', url: `https://gosplit.io`, product: `Check "${product}" on GoSplit`, price: null, priceDisplay: '→ Check', duration: '—', type: 'shared', trust: 'Medium risk · subscription splitting' },
    { source: 'Together Price', url: `https://togetherprice.com`, product: `Check "${product}" on Together Price`, price: null, priceDisplay: '→ Check', duration: '—', type: 'shared', trust: 'Low-medium risk · established sharing' },
    { source: 'StackSocial', url: `https://stacksocial.com/search?q=${encodeURIComponent(product)}`, product: `Search "${product}" on StackSocial`, price: null, priceDisplay: '→ Check', duration: '—', type: 'lifetime key', trust: 'Low risk · established deals' },
    { source: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product + ' subscription')}`, product: `Search "${product}" on eBay`, price: null, priceDisplay: '→ Check', duration: '—', type: 'reseller', trust: 'Medium risk · eBay buyer protection' },
    { source: 'AliExpress', url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product)}`, product: `Search "${product}" on AliExpress`, price: null, priceDisplay: '→ Check', duration: '—', type: 'grey-market', trust: 'Medium-high risk · buyer protection but slow' },
    { source: 'Reddit', url: `https://www.reddit.com/search/?q=${encodeURIComponent(product + ' cheap deal')}`, product: `Reddit discussions about cheap "${product}"`, price: null, priceDisplay: '→ Check', duration: '—', type: 'reseller', trust: 'Info only · community tips & warnings' },
  ];
}

// ─── SSE endpoint ───
app.get('/api/search', async (req, res) => {
  const product = (req.query.q || '').trim();
  if (!product) return res.status(400).json({ error: 'Missing query' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  const total = SCRAPERS.length + 1;
  let allResults = [];
  let completed = 0;

  send('progress', { completed: 0, total, phase: 'Starting deal hunt…' });

  // Run all scrapers in parallel
  const scrapePromises = SCRAPERS.map(async (s) => {
    try {
      const results = await s.fn(product);
      completed++;
      send('progress', { completed, total, phase: `✓ ${s.name} — ${results.length} results` });
      return results;
    } catch (e) {
      completed++;
      send('progress', { completed, total, phase: `✗ ${s.name} — failed` });
      return [];
    }
  });

  const scrapeResults = await Promise.allSettled(scrapePromises);
  for (const r of scrapeResults) {
    if (r.status === 'fulfilled') allResults.push(...r.value);
  }

  // Add display-ready prices
  allResults = allResults.map(r => ({
    ...r,
    priceDisplay: r.price != null ? `$${r.price.toFixed(2)}` : '—',
  }));

  // Add direct links
  const directLinks = getDirectLinks(product);
  allResults.push(...directLinks);
  completed++;
  send('progress', { completed: total, total, phase: 'Adding marketplace links…' });

  const final = dedup(allResults);
  send('partial', { results: final });
  send('done', { results: final });
  res.end();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', scrapers: SCRAPERS.length }));

app.listen(PORT, '0.0.0.0', () => console.log(`DealHunter AI running on http://0.0.0.0:${PORT}`));
