const express = require('express');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'wishlist.json');
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (!isProduction ? 'dreisam26!' : null);

if (isProduction && !process.env.ADMIN_PASSWORD) {
  console.warn('⚠️ WARNUNG: ADMIN_PASSWORD ist online nicht gesetzt! Bitte in Vercel konfigurieren.');
}

// Ensure data directory exists and seed initial file if on Vercel
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (process.env.VERCEL && !fs.existsSync(DATA_FILE)) {
  const seedFile = path.join(__dirname, 'data', 'wishlist.json');
  if (fs.existsSync(seedFile)) {
    try {
      fs.copyFileSync(seedFile, DATA_FILE);
    } catch (e) {
      console.warn('Could not seed /tmp/wishlist.json', e);
    }
  }
}

// Redis Setup via STORAGE_URL
const STORAGE_URL = process.env.STORAGE_URL || process.env.REDIS_URL || process.env.KV_URL;
const REDIS_KEY = 'wishlist:items';
let redisClient = null;

if (STORAGE_URL) {
  try {
    const isRest = STORAGE_URL.startsWith('http://') || STORAGE_URL.startsWith('https://');
    if (!isRest) {
      redisClient = new Redis(STORAGE_URL, {
        maxRetriesPerRequest: 3,
        connectTimeout: 7000,
        lazyConnect: false,
        tls: STORAGE_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
      });

      redisClient.on('connect', () => {
        console.log('✅ Verbunden mit Redis über STORAGE_URL');
      });

      redisClient.on('error', (err) => {
        console.warn('⚠️ Redis Verbindungsfehler:', err.message);
      });
    } else {
      console.log('ℹ️ STORAGE_URL ist REST-Endpunkt');
    }
  } catch (err) {
    console.error('⚠️ Fehler bei Redis-Initialisierung:', err.message);
    redisClient = null;
  }
} else {
  console.log('ℹ️ Keine STORAGE_URL gefunden – nutze lokale Speicherung in data/wishlist.json');
}

// Helpers for Redis get/set (supporting both ioredis and Upstash REST)
async function getRedisData() {
  if (STORAGE_URL && (STORAGE_URL.startsWith('http://') || STORAGE_URL.startsWith('https://'))) {
    const token = process.env.STORAGE_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    const res = await fetch(`${STORAGE_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await res.json();
    return json.result ? JSON.parse(json.result) : null;
  } else if (redisClient) {
    const data = await redisClient.get(REDIS_KEY);
    return data ? JSON.parse(data) : null;
  }
  return null;
}

async function setRedisData(items) {
  const str = JSON.stringify(items);
  if (STORAGE_URL && (STORAGE_URL.startsWith('http://') || STORAGE_URL.startsWith('https://'))) {
    const token = process.env.STORAGE_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    const res = await fetch(`${STORAGE_URL}/set/${REDIS_KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(str)
    });
    return res.ok;
  } else if (redisClient) {
    await redisClient.set(REDIS_KEY, str);
    return true;
  }
  return false;
}

// Default initial items if wishlist is completely empty
const initialWishes = [
  {
    id: "item-1",
    title: "Aarke Carbonator 3 Wassersprudler (Edelstahl matt)",
    url: "https://www.aarke.com/de/carbonator-3-steel",
    imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80",
    siteName: "aarke.com",
    price: "ca. 190 €",
    note: "Farbe: Sand oder Edelstahl matt",
    badge: "Favorit",
    claimed: false,
    claimedAt: null,
    claimerToken: null,
    createdAt: Date.now() - 86400000 * 2
  },
  {
    id: "item-2",
    title: "Das große Buch der Kaffeekunst & Barista Handbuch",
    url: "https://www.thalia.de",
    imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
    siteName: "thalia.de",
    price: "ca. 35 €",
    note: "Gerne als Hardcover",
    badge: "",
    claimed: true,
    claimedAt: Date.now() - 3600000,
    claimerToken: "sample-other-guest",
    createdAt: Date.now() - 86400000
  },
  {
    id: "item-3",
    title: "Sony WH-1000XM5 Noise Cancelling Kopfhörer",
    url: "https://www.sony.de",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
    siteName: "sony.de",
    price: "ca. 299 €",
    note: "Farbe: Schwarz oder Silber",
    badge: "",
    claimed: false,
    claimedAt: null,
    claimerToken: null,
    createdAt: Date.now()
  }
];

function loadLocalFallbackItems() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading wishlist file, initializing with defaults', err);
  }
  saveLocalFallbackItems(initialWishes);
  return initialWishes;
}

function saveLocalFallbackItems(items) {
  try {
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(items, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error writing wishlist file atomically, attempting fallback', err);
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
      return true;
    } catch (fallbackErr) {
      console.error('Critical: Failed to save wishlist file', fallbackErr);
      return false;
    }
  }
}

// Unified loadItems: Redis primary with fallback to local file
async function loadItems() {
  if (STORAGE_URL || redisClient) {
    try {
      const items = await getRedisData();
      if (items && Array.isArray(items)) {
        return items;
      }
      // If redis is empty, seed it with the existing local items!
      const initial = loadLocalFallbackItems();
      await setRedisData(initial);
      return initial;
    } catch (err) {
      console.error('Redis read error, falling back to local file:', err.message);
    }
  }
  return loadLocalFallbackItems();
}

// Unified saveItems: saves to Redis and local backup
async function saveItems(items) {
  let redisSaved = false;
  if (STORAGE_URL || redisClient) {
    try {
      redisSaved = await setRedisData(items);
    } catch (err) {
      console.error('Redis write error:', err.message);
    }
  }

  const localSaved = saveLocalFallbackItems(items);
  return redisSaved || localSaved;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Scraper function to fetch OpenGraph and page metadata
async function scrapeUrlMetadata(targetUrl) {
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  const parsedUrl = new URL(normalizedUrl);
  const domain = parsedUrl.hostname.replace(/^www\./, '');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cookie': 'i18n-prefs=EUR; lc-acbde=de_DE; lc-main=de_DE; session-currency=EUR; sp-cdn="L5Z9:DE"'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title from meta tags
    let title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('meta[name="title"]').attr('content') ||
                (domain.includes('amazon.') && $('#productTitle').text().trim()) ||
                $('title').text().trim() ||
                domain;

    // Clean up trailing shop brand names without truncating specs (e.g. ESP32-S3)
    title = title
      .replace(/\s*:\s*Amazon\.[a-z.]+.*$/i, '')
      .replace(/\s*[|\-–—]\s*(Amazon|Galaxus|Zalando|Otto|MediaMarkt|Saturn|Thalia)[^|\-–—]*$/i, '')
      .trim() || title;

    // Extract image - standard meta tags
    let imageUrl = $('meta[property="og:image:secure_url"]').attr('content') ||
                   $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image:src"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('link[rel="image_src"]').attr('href') ||
                   $('meta[itemprop="image"]').attr('content');

    // Amazon-specific image extraction as fallback if no meta image found
    if (!imageUrl && domain.includes('amazon.')) {
      const landingImg = $('#landingImage');
      if (landingImg.length) {
        imageUrl = landingImg.attr('data-old-hires') || landingImg.attr('src');
        const dynamic = landingImg.attr('data-a-dynamic-image');
        if (dynamic) {
          try {
            const parsed = JSON.parse(dynamic);
            const urls = Object.keys(parsed);
            if (urls.length > 0) {
              urls.sort((a, b) => (parsed[b][0] * parsed[b][1]) - (parsed[a][0] * parsed[a][1]));
              imageUrl = urls[0];
            }
          } catch (e) {}
        }
      }
      if (!imageUrl) {
        imageUrl = $('#imgBlkFront').attr('src') || $('#main-image').attr('src');
      }
      if (!imageUrl) {
        const regexMatch = html.match(/https:\/\/[^"'\s]+media-amazon\.com\/images\/I\/[^"'\s]+?\.(?:jpg|jpeg|png|webp)/i);
        if (regexMatch) {
          imageUrl = regexMatch[0];
        }
      }
    }

    // JSON-LD fallback for images if no meta tag image found
    if (!imageUrl) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).text();
          const data = JSON.parse(raw);
          const candidates = Array.isArray(data) ? data : [data];
          for (const candidate of candidates) {
            if (!imageUrl && candidate) {
              if (typeof candidate.image === 'string') imageUrl = candidate.image;
              else if (Array.isArray(candidate.image) && candidate.image[0]) {
                imageUrl = typeof candidate.image[0] === 'string' ? candidate.image[0] : candidate.image[0].url;
              } else if (candidate.image && candidate.image.url) imageUrl = candidate.image.url;
            }
          }
        } catch (e) {}
      });
    }

    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, normalizedUrl).href;
      } catch (e) {
        imageUrl = null;
      }
    }

    // Extract description from meta tags
    const description = $('meta[property="og:description"]').attr('content') ||
                        $('meta[name="twitter:description"]').attr('content') ||
                        $('meta[name="description"]').attr('content') ||
                        '';

    // Extract site name from meta tags
    const siteName = $('meta[property="og:site_name"]').attr('content') || domain;

    return {
      success: true,
      url: normalizedUrl,
      title: title.slice(0, 150),
      imageUrl: imageUrl || '',
      description: description.slice(0, 200),
      siteName: siteName || domain,
      price: ''
    };
  } catch (error) {
    clearTimeout(timeout);
    console.warn(`Scrape failed for ${normalizedUrl}:`, error.message);
    return {
      success: false,
      url: normalizedUrl,
      title: domain,
      imageUrl: '',
      description: '',
      siteName: domain,
      price: '',
      error: error.message
    };
  }
}

// API Routes

// POST /api/auth/verify - check admin password
app.post('/api/auth/verify', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Passwort erforderlich' });
  }

  // If running online and no env var set, block authentication
  const currentPassword = process.env.ADMIN_PASSWORD || (!isProduction ? 'dreisam26!' : null);
  if (!currentPassword) {
    return res.status(500).json({
      success: false,
      error: 'ADMIN_PASSWORD Umgebungsvariable ist auf dem Server noch nicht konfiguriert!'
    });
  }

  if (password === currentPassword) {
    return res.json({ success: true });
  } else {
    return res.status(401).json({ success: false, error: 'Falsches Passwort' });
  }
});

// GET /api/items - list all items
app.get('/api/items', async (req, res) => {
  const items = await loadItems();
  res.json({ items });
});

// POST /api/scrape - preview link metadata
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const meta = await scrapeUrlMetadata(url);
  res.json(meta);
});

// POST /api/items - create new wish item
app.post('/api/items', async (req, res) => {
  const { url, title, imageUrl, price, note, siteName, badge, similarAllowed } = req.body;
  if (!url && !title) {
    return res.status(400).json({ error: 'Link oder Titel erforderlich' });
  }

  let finalTitle = (title || '').trim();
  let finalImage = (imageUrl || '').trim();
  let finalSite = (siteName || '').trim();
  let finalPrice = (price || '').trim();
  let finalUrl = (url || '').trim();

  if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
    finalUrl = 'https://' + finalUrl;
  }

  // Only auto-scrape if title or image is missing and URL is given
  if (finalUrl && (!finalTitle || !finalImage)) {
    try {
      const meta = await scrapeUrlMetadata(finalUrl);
      if (!finalTitle && meta.title) finalTitle = meta.title;
      if (!finalImage && meta.imageUrl) finalImage = meta.imageUrl;
      if (!finalSite && meta.siteName) finalSite = meta.siteName;
    } catch (e) {
      console.warn('Scraping error during item creation:', e.message);
    }
  }

  if (!finalTitle) {
    if (finalUrl) {
      try {
        finalTitle = new URL(finalUrl).hostname.replace(/^www\./, '');
      } catch (e) {
        finalTitle = "Wunsch";
      }
    } else {
      finalTitle = "Wunsch";
    }
  }

  if (finalUrl && !finalSite) {
    try {
      finalSite = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch (e) {
      finalSite = '';
    }
  }

  const isSimilar = !!similarAllowed || badge === 'oder ähnlich';

  const newItem = {
    id: "item-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
    title: finalTitle,
    url: finalUrl,
    imageUrl: finalImage,
    siteName: finalSite,
    price: finalPrice,
    note: (note || '').trim(),
    similarAllowed: isSimilar,
    badge: isSimilar ? 'oder ähnlich' : (badge || '').trim(),
    claimed: false,
    claimedAt: null,
    claimerToken: null,
    createdAt: Date.now()
  };

  const items = await loadItems();
  items.unshift(newItem);
  const saved = await saveItems(items);
  if (!saved) {
    return res.status(500).json({ error: 'Fehler beim Speichern der Wunschliste' });
  }

  res.status(201).json({ success: true, item: newItem });
});

// POST /api/claim/:id - claim an item ("Ich schenke das")
app.post('/api/claim/:id', async (req, res) => {
  const { id } = req.params;
  const { claimerToken } = req.body;

  const items = await loadItems();
  const itemIndex = items.findIndex(it => it.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  const item = items[itemIndex];

  // Check if already claimed
  if (item.claimed) {
    return res.status(200).json({
      success: false,
      alreadyClaimed: true,
      message: 'Das wird schon geschenkt!',
      item
    });
  }

  // Mark as claimed
  item.claimed = true;
  item.claimedAt = Date.now();
  item.claimerToken = claimerToken || 'guest-' + Date.now();

  const saved = await saveItems(items);
  if (!saved) {
    return res.status(500).json({ error: 'Fehler beim Speichern der Reservierung' });
  }

  return res.json({
    success: true,
    alreadyClaimed: false,
    message: 'Erfolgreich reserviert!',
    item
  });
});

// POST /api/unclaim/:id - release a reservation (e.g. if the user made a mistake or admin)
app.post('/api/unclaim/:id', async (req, res) => {
  const { id } = req.params;
  const { claimerToken, isAdmin } = req.body;

  const items = await loadItems();
  const item = items.find(it => it.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  // Allow unclaiming if token matches or isAdmin
  if (isAdmin || !item.claimerToken || item.claimerToken === claimerToken) {
    item.claimed = false;
    item.claimedAt = null;
    item.claimerToken = null;
    const saved = await saveItems(items);
    if (!saved) {
      return res.status(500).json({ error: 'Fehler beim Freigeben' });
    }
    return res.json({ success: true, item });
  }

  return res.status(403).json({ error: 'Nur derjenige, der reserviert hat, kann die Reservierung aufheben.' });
});

// PUT /api/items/reorder or POST /api/items/reorder - reorder wishlist items
const handleReorder = async (req, res) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ error: 'itemIds muss ein Array sein' });
  }

  const items = await loadItems();
  const itemMap = new Map(items.map(it => [it.id, it]));

  const reordered = [];
  for (const id of itemIds) {
    if (itemMap.has(id)) {
      reordered.push(itemMap.get(id));
      itemMap.delete(id);
    }
  }

  // Append any items that were not part of the payload
  for (const item of itemMap.values()) {
    reordered.push(item);
  }

  const saved = await saveItems(reordered);
  if (!saved) {
    return res.status(500).json({ error: 'Fehler beim Speichern der neuen Reihenfolge' });
  }

  res.json({ success: true, items: reordered });
};

app.put('/api/items/reorder', handleReorder);
app.post('/api/items/reorder', handleReorder);

// PUT /api/items/:id - update an existing wish
app.put('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { url, title, imageUrl, price, note, siteName, badge, similarAllowed } = req.body;

  const items = await loadItems();
  const itemIndex = items.findIndex(it => it.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  const existing = items[itemIndex];

  let finalTitle = title !== undefined ? title.trim() : existing.title;
  let finalUrl = url !== undefined ? url.trim() : existing.url;
  if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
    finalUrl = 'https://' + finalUrl;
  }

  let finalImage = imageUrl !== undefined ? imageUrl.trim() : existing.imageUrl;
  let finalPrice = price !== undefined ? price.trim() : existing.price;
  let finalNote = note !== undefined ? note.trim() : existing.note;
  let finalSite = siteName !== undefined ? siteName.trim() : existing.siteName;

  let finalSimilarAllowed;
  if (similarAllowed !== undefined) {
    finalSimilarAllowed = !!similarAllowed;
  } else if (badge !== undefined) {
    finalSimilarAllowed = badge === 'oder ähnlich';
  } else {
    finalSimilarAllowed = !!(existing.similarAllowed || existing.badge === 'oder ähnlich');
  }

  let finalBadge = finalSimilarAllowed ? 'oder ähnlich' : (badge !== undefined ? badge.trim() : (existing.badge === 'oder ähnlich' ? '' : (existing.badge || '')));

  if (finalUrl && (!finalSite || finalSite === '')) {
    try {
      finalSite = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch (e) {}
  }

  items[itemIndex] = {
    ...existing,
    title: finalTitle || existing.title || "Wunsch",
    url: finalUrl,
    imageUrl: finalImage,
    siteName: finalSite,
    price: finalPrice,
    note: finalNote,
    similarAllowed: finalSimilarAllowed,
    badge: finalBadge,
    updatedAt: Date.now()
  };

  const saved = await saveItems(items);
  if (!saved) {
    return res.status(500).json({ error: 'Fehler beim Speichern der Änderungen' });
  }

  res.json({ success: true, item: items[itemIndex] });
});

// DELETE /api/items/:id - delete a wish
app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  let items = await loadItems();
  const initialLength = items.length;
  items = items.filter(it => it.id !== id);

  if (items.length === initialLength) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  const saved = await saveItems(items);
  if (!saved) {
    return res.status(500).json({ error: 'Fehler beim Löschen' });
  }

  res.json({ success: true, message: 'Geschenk entfernt' });
});

// Start server (only if not running as serverless function on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Wishlist server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
