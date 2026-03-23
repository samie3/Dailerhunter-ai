require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Known deal sites & grey markets ───
const KNOWN_SITES = [
  { name: 'Plati.Market', domain: 'plati.market', type: 'grey-market', risk: 'High revoke risk · grey-market keys/accounts' },
  { name: 'GGSEL', domain: 'ggsel.net', type: 'grey-market', risk: 'High risk · Chinese grey-market platform' },
  { name: 'G2A', domain: 'g2a.com', type: 'grey-market', risk: 'Medium risk · check seller ratings & G2A Plus protection' },
  { name: 'Eneba', domain: 'eneba.com', type: 'reseller', risk: 'Medium risk · reseller marketplace with buyer protection' },
  { name: 'Kinguin', domain: 'kinguin.net', type: 'reseller', risk: 'Medium risk · reseller · buyer protection available' },
  { name: 'Sellix', domain: 'sellix.io', type: 'grey-market', risk: 'High risk · individual sellers, no platform guarantee' },
  { name: 'Shoppy', domain: 'shoppy.gg', type: 'grey-market', risk: 'High risk · unvetted sellers, minimal buyer protection' },
  { name: 'GamsGo', domain: 'gamsgo.com', type: 'shared', risk: 'Medium risk · subscription sharing platform' },
  { name: 'GoSplit', domain: 'gosplit.io', type: 'shared', risk: 'Medium risk · subscription splitting service' },
  { name: 'Together Price', domain: 'togetherprice.com', type: 'shared', risk: 'Low-medium risk · established sharing platform' },
  { name: 'Cheapzy', domain: 'cheapzy.com', type: 'shared', risk: 'Medium risk · shared account marketplace' },
  { name: 'AppSumo', domain: 'appsumo.com', type: 'lifetime key', risk: 'Low risk · established LTD platform with refund policy' },
  { name: 'StackSocial', domain: 'stacksocial.com', type: 'lifetime key', risk: 'Low risk · established deal platform' },
  { name: 'DealMirror', domain: 'dealmirror.com', type: 'lifetime key', risk: 'Low-medium risk · LTD reseller' },
  { name: 'PitchGround', domain: 'pitchground.com', type: 'lifetime key', risk: 'Low risk · LTD marketplace with guarantees' },
  { name: 'SaaSMantra', domain: 'saasmantra.com', type: 'lifetime key', risk: 'Low risk · curated LTD deals' },
  { name: 'RapidAPI', domain: 'rapidapi.com', type: 'official', risk: 'Low risk · official API marketplace' },
  { name: 'eBay', domain: 'ebay.com', type: 'reseller', risk: 'Medium risk · check seller feedback, eBay buyer protection' },
  { name: 'Reddit', domain: 'reddit.com', type: 'reseller', risk: 'High risk · peer-to-peer, no buyer protection' },
  { name: 'Telegram', domain: 't.me', type: 'grey-market', risk: 'Very high risk · no buyer protection, scam-prone' },
  { name: 'AliExpress', domain: 'aliexpress.com', type: 'grey-market', risk: 'Medium-high risk · buyer protection available but slow' },
  { name: 'Taobao', domain: 'taobao.com', type: 'grey-market', risk: 'High risk · Chinese market, complex disputes' },
  { name: 'Fiverr', domain: 'fiverr.com', type: 'reseller', risk: 'Medium risk · freelancer marketplace, some account sellers' },
  { name: 'PlayerAuctions', domain: 'playerauctions.com', type: 'reseller', risk: 'Medium risk · established reseller with escrow' },
  { name: 'CDKeys', domain: 'cdkeys.com', type: 'reseller', risk: 'Low-medium risk · established key reseller' },
  { name: 'Humble Bundle', domain: 'humblebundle.com', type: 'bundle', risk: 'Low risk · official partner, charity bundles' },
  { name: 'Fanatical', domain: 'fanatical.com', type: 'bundle', risk: 'Low risk · authorized reseller' },
];

// ─── Query templates for comprehensive search ───
const QUERY_TEMPLATES = [
  '{product} cheap',
  '{product} cheapest price',
  '{product} discount deal',
  '{product} shared account buy',
  '{product} reseller cheap',
  '{product} lifetime deal',
  '{product} grey market buy',
  '{product} family plan share cheap',
  '{product} subscription cheap buy',
  '{product} coupon promo code',
  '{product} student discount edu',
  '{product} upgrade cheap',
  '{product} account buy cheap USD',
  '{product} 1 month cheap',
  '{product} annual yearly discount',
  '{product} region cheap VPN trick',
  'buy {product} cheap reddit',
];

const SITE_QUERIES = KNOWN_SITES.filter(s => !['reddit.com', 'ebay.com'].includes(s.domain))
  .slice(0, 12)
  .map(s => ({ query: `site:${s.domain} {product}`, site: s }));

// ─── Price extraction ───
const PRICE_PATTERNS = [
  /\$\s?(\d{1,5}(?:[.,]\d{1,2})?)/g,
  /(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:USD|usd|\$)/g,
  /USD\s?(\d{1,5}(?:[.,]\d{1,2})?)/g,
  /€\s?(\d{1,5}(?:[.,]\d{1,2})?)/g,
  /(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:EUR|eur|€)/g,
  /£\s?(\d{1,5}(?:[.,]\d{1,2})?)/g,
  /₽\s?(\d{1,6}(?:[.,]\d{1,2})?)/g,
  /(\d{1,6}(?:[.,]\d{1,2})?)\s?(?:RUB|руб)/g,
];

const FX = { USD: 1, EUR: 1.08, GBP: 1.26, RUB: 0.011 };

function extractPrice(text) {
  if (!text) return null;
  const prices = [];
  for (const pat of PRICE_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const raw = (m[1] || m[0]).replace(',', '.');
      let val = parseFloat(raw);
      if (isNaN(val) || val <= 0 || val > 50000) continue;
      // Currency conversion
      if (/[€]|EUR|eur/.test(m[0])) val *= FX.EUR;
      else if (/[£]|GBP/.test(m[0])) val *= FX.GBP;
      else if (/[₽]|RUB|руб/.test(m[0])) val *= FX.RUB;
      prices.push(val);
    }
  }
  return prices.length ? Math.min(...prices) : null;
}

function classifyType(url, title) {
  const u = (url + ' ' + title).toLowerCase();
  for (const site of KNOWN_SITES) {
    if (u.includes(site.domain)) return { type: site.type, trust: site.risk };
  }
  if (/lifetime/i.test(u)) return { type: 'lifetime key', trust: '🔑 Lifetime deal – verify it\'s legit & terms' };
  if (/shared|split|family/i.test(u)) return { type: 'shared', trust: '👥 Shared/split – limited control, revoke possible' };
  if (/trial|free/i.test(u)) return { type: 'trial', trust: 'ℹ️ Trial/promo – time or feature limited' };
  if (/bundle/i.test(u)) return { type: 'bundle', trust: '📦 Bundle deal – check included items' };
  if (/official|\.com\/pricing|\.com\/plans/i.test(u)) return { type: 'official', trust: '✅ Official – safest, full support' };
  return { type: 'reseller', trust: '⚡ Third-party – verify seller reputation' };
}

function extractDuration(text) {
  const t = (text || '').toLowerCase();
  if (/lifetime/i.test(t)) return 'Lifetime';
  const m = t.match(/(\d+)\s*(month|year|day|week)/i);
  if (m) return `${m[1]} ${m[2]}${parseInt(m[1]) > 1 ? 's' : ''}`;
  if (/annual|yearly/i.test(t)) return '1 year';
  if (/monthly/i.test(t)) return '1 month';
  return '—';
}

function sourceName(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const site = KNOWN_SITES.find(s => host.includes(s.domain));
    if (site) return site.name;
    return host;
  } catch { return url; }
}

// ─── Free search engines (no API key needed) ───

async function duckDuckGoSearch(query, maxResults = 15) {
  try {
    const { data } = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('.result').each((i, el) => {
      if (results.length >= maxResults) return false;
      const titleEl = $(el).find('.result__title a');
      const snippetEl = $(el).find('.result__snippet');
      const href = titleEl.attr('href') || '';
      // DDG wraps URLs
      let url = href;
      if (href.includes('uddg=')) {
        try { url = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch {}
      }
      if (!url || url.startsWith('/')) return;
      results.push({
        title: titleEl.text().trim(),
        url,
        snippet: snippetEl.text().trim(),
      });
    });
    return results;
  } catch (e) {
    console.error('DDG error:', e.message);
    return [];
  }
}

async function googleSearch(query, maxResults = 15) {
  try {
    const { data } = await axios.get('https://www.google.com/search', {
      params: { q: query, num: maxResults, hl: 'en' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('div.g, div[data-sokoban-container]').each((i, el) => {
      if (results.length >= maxResults) return false;
      const a = $(el).find('a').first();
      const url = a.attr('href') || '';
      if (!url.startsWith('http')) return;
      const title = $(el).find('h3').first().text().trim();
      const snippet = $(el).find('[data-sncf], .VwiC3b, .lEBKkf').first().text().trim();
      if (title) results.push({ title, url, snippet });
    });
    return results;
  } catch (e) {
    console.error('Google error:', e.message);
    return [];
  }
}

// Use DDG as primary, Google as fallback
async function webSearch(query, maxResults = 12) {
  let results = await duckDuckGoSearch(query, maxResults);
  if (results.length < 3) {
    const gResults = await googleSearch(query, maxResults);
    // Merge without duplicates
    const urls = new Set(results.map(r => r.url));
    for (const r of gResults) {
      if (!urls.has(r.url)) {
        results.push(r);
        urls.add(r.url);
      }
    }
  }
  return results.slice(0, maxResults);
}

// ─── Direct site scrapers for top grey markets ───

async function scrapePlati(product) {
  try {
    const { data } = await axios.get('https://plati.market/search/' + encodeURIComponent(product), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('[class*="product"], .goods_list_row, .goods-item, tr.row, .product-card').each((i, el) => {
      if (results.length >= 8) return false;
      const a = $(el).find('a[href*="/"]').first();
      const title = a.text().trim() || $(el).find('[class*="title"], [class*="name"]').text().trim();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://plati.market' + href;
      const priceText = $(el).find('[class*="price"], [class*="cost"]').text().trim();
      if (title && href) results.push({ title, url: href, snippet: priceText + ' ' + title });
    });
    return results;
  } catch { return []; }
}

async function scrapeG2A(product) {
  try {
    const { data } = await axios.get('https://www.g2a.com/search', {
      params: { query: product },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('[class*="ProductCard"], [class*="product-card"], li[class*="item"]').each((i, el) => {
      if (results.length >= 8) return false;
      const a = $(el).find('a').first();
      const title = a.text().trim() || $(el).find('[class*="title"]').text().trim();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://www.g2a.com' + href;
      const priceText = $(el).find('[class*="price"], [class*="Price"]').text().trim();
      if (title && href) results.push({ title, url: href, snippet: priceText + ' ' + title });
    });
    return results;
  } catch { return []; }
}

async function scrapeEneba(product) {
  try {
    const { data } = await axios.get('https://www.eneba.com/store?text=' + encodeURIComponent(product), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('[class*="product"], [class*="Product"], [class*="card"]').each((i, el) => {
      if (results.length >= 8) return false;
      const a = $(el).find('a').first();
      const title = a.text().trim() || $(el).find('[class*="title"]').text().trim();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) href = 'https://www.eneba.com' + href;
      const priceText = $(el).find('[class*="price"], [class*="Price"]').text().trim();
      if (title && href) results.push({ title, url: href, snippet: priceText + ' ' + title });
    });
    return results;
  } catch { return []; }
}

function isRelevant(title, snippet, product) {
  // Filter out generic/junk pages
  const combined = (title + ' ' + snippet).toLowerCase();
  const prod = product.toLowerCase();
  const prodWords = prod.split(/\s+/).filter(w => w.length > 2);
  // At least one significant product word must appear
  const hasProductWord = prodWords.some(w => combined.includes(w));
  if (!hasProductWord) return false;
  // Skip category pages, homepages, login pages, blog/news with no deal
  const junkPatterns = [
    /^(gaming|software|subscriptions|gift cards|outlet|categories)$/i,
    /\/category\//i, /\/login/i, /\/register/i, /\/signup/i,
    /^pay less with/i, /^best deals$/i,
  ];
  if (junkPatterns.some(p => p.test(title) || p.test(snippet))) return false;
  return true;
}

function parseResults(rawResults, product) {
  const seen = new Set();
  return rawResults
    .map(r => {
      const combined = `${r.title} ${r.snippet}`;
      const price = extractPrice(combined);
      const url = r.url;
      if (!url || seen.has(url)) return null;
      seen.add(url);
      // Filter irrelevant results
      if (!isRelevant(r.title, r.snippet, product)) return null;
      const { type, trust } = classifyType(url, combined);
      return {
        source: sourceName(url),
        url,
        product: (r.title || product).slice(0, 100),
        price,
        priceDisplay: price != null ? `$${price.toFixed(2)}` : '—',
        duration: extractDuration(combined),
        type,
        trust,
      };
    })
    .filter(Boolean);
}

function dedup(results) {
  const seen = new Set();
  return results
    .filter(r => {
      const key = r.url.replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (a.price == null && b.price == null) return 0;
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    });
}

// ─── SSE search endpoint ───
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

  // Build all queries
  const queries = QUERY_TEMPLATES.map(t => t.replace('{product}', product));
  const siteQueries = SITE_QUERIES.map(sq => ({
    query: sq.query.replace('{product}', product),
    site: sq.site,
  }));

  const totalSteps = queries.length + siteQueries.length + 3; // +3 for direct scrapers
  let allResults = [];
  let completed = 0;

  const tick = (extra) => {
    completed++;
    send('progress', { completed, total: totalSteps, ...(extra || {}) });
  };

  // Phase 1: Direct site scrapers (parallel)
  send('progress', { completed: 0, total: totalSteps, phase: 'Scraping grey markets directly…' });
  const directScrapers = [
    scrapePlati(product).then(r => { tick({ phase: 'Plati.Market scraped' }); return r; }),
    scrapeG2A(product).then(r => { tick({ phase: 'G2A scraped' }); return r; }),
    scrapeEneba(product).then(r => { tick({ phase: 'Eneba scraped' }); return r; }),
  ];
  const directResults = await Promise.allSettled(directScrapers);
  for (const r of directResults) {
    if (r.status === 'fulfilled' && r.value.length) {
      allResults.push(...parseResults(r.value, product));
    }
  }
  if (allResults.length) send('partial', { results: dedup(allResults).slice(0, 80) });

  // Phase 2: Web searches in batches
  const allQueries = [...queries, ...siteQueries.map(sq => sq.query)];
  const batchSize = 3;
  for (let i = 0; i < allQueries.length; i += batchSize) {
    const batch = allQueries.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(q => webSearch(q, 10))
    );
    for (const r of batchResults) {
      tick({ phase: `Searching the web… (${completed}/${totalSteps})` });
      if (r.status === 'fulfilled' && r.value.length) {
        allResults.push(...parseResults(r.value, product));
      }
    }
    // Send partial results
    const deduped = dedup(allResults);
    send('partial', { results: deduped.slice(0, 100) });

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  const final = dedup(allResults);
  send('done', { results: final });
  res.end();
});

app.listen(PORT, () => console.log(`DealHunter AI running on http://localhost:${PORT}`));
