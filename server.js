const express = require('express');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

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
    claimed: false,
    claimedAt: null,
    claimerToken: null,
    createdAt: Date.now()
  }
];

function loadItems() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading wishlist file, initializing with defaults', err);
  }
  saveItems(initialWishes);
  return initialWishes;
}

function saveItems(items) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing wishlist file', err);
  }
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
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    let title = (domain.includes('amazon.') && $('#productTitle').text().trim()) ||
                $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('#productTitle').text().trim() ||
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
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('link[rel="image_src"]').attr('href') ||
                   $('meta[itemprop="image"]').attr('content');

    // Amazon-specific image extraction
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
              // Pick highest resolution
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
        // Fallback: search regex in raw html
        const regexMatch = html.match(/https:\/\/[^"'\s]+media-amazon\.com\/images\/I\/[^"'\s]+?\.(?:jpg|jpeg|png|webp)/i);
        if (regexMatch) {
          imageUrl = regexMatch[0];
        }
      }
    }

    // Try detecting price in meta
    let price = $('meta[property="product:price:amount"]').attr('content') ||
                $('meta[property="og:price:amount"]').attr('content');
    const currency = $('meta[property="product:price:currency"]').attr('content') || '€';
    if (price) {
      price = `${price} ${currency}`;
    }

    // Amazon price extraction
    if (!price && domain.includes('amazon.')) {
      const amazonPrice = $('.a-price .a-offscreen').first().text().trim() ||
                          $('.priceToPay').first().text().trim() ||
                          $('#priceblock_ourprice').text().trim() ||
                          $('#priceblock_dealprice').text().trim();
      if (amazonPrice) {
        price = amazonPrice;
      }
    }

    // JSON-LD fallback for images and prices (Shopify, WooCommerce, Galaxus, etc.)
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
          if (!price && candidate && candidate.offers) {
            const offer = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.offers;
            if (offer && offer.price) {
              price = `${offer.price} ${offer.priceCurrency || '€'}`;
            }
          }
        }
      } catch (e) {}
    });

    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, normalizedUrl).href;
      } catch (e) {
        imageUrl = null;
      }
    }

    // Extract description
    const description = $('meta[property="og:description"]').attr('content') ||
                        $('meta[name="description"]').attr('content') ||
                        '';

    // Extract site name
    const siteName = $('meta[property="og:site_name"]').attr('content') || domain;

    return {
      success: true,
      url: normalizedUrl,
      title: title.slice(0, 150),
      imageUrl: imageUrl || '',
      description: description.slice(0, 200),
      siteName: siteName || domain,
      price: price || ''
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
app.get('/api/items', (req, res) => {
  const items = loadItems();
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
  const { url, title, imageUrl, price, note, siteName } = req.body;
  if (!url && !title) {
    return res.status(400).json({ error: 'Link oder Titel erforderlich' });
  }

  let finalTitle = title;
  let finalImage = imageUrl;
  let finalSite = siteName;
  let finalPrice = price;

  // Auto-scrape if details are missing and URL is given
  if (url && (!finalTitle || !finalImage)) {
    const meta = await scrapeUrlMetadata(url);
    if (!finalTitle) finalTitle = meta.title;
    if (!finalImage) finalImage = meta.imageUrl;
    if (!finalSite) finalSite = meta.siteName;
    if (!finalPrice && meta.price) finalPrice = meta.price;
  }

  if (!finalTitle) {
    finalTitle = "Wunsch";
  }

  const newItem = {
    id: "item-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
    title: finalTitle.trim(),
    url: url ? (url.startsWith('http') ? url : 'https://' + url) : '',
    imageUrl: finalImage || '',
    siteName: finalSite || (url ? new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '') : ''),
    price: finalPrice || '',
    note: (note || '').trim(),
    claimed: false,
    claimedAt: null,
    claimerToken: null,
    createdAt: Date.now()
  };

  const items = loadItems();
  items.unshift(newItem);
  saveItems(items);

  res.status(201).json({ item: newItem });
});

// POST /api/claim/:id - claim an item ("Ich schenke das")
app.post('/api/claim/:id', (req, res) => {
  const { id } = req.params;
  const { claimerToken } = req.body;

  const items = loadItems();
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

  saveItems(items);

  return res.json({
    success: true,
    alreadyClaimed: false,
    message: 'Erfolgreich reserviert!',
    item
  });
});

// POST /api/unclaim/:id - release a reservation (e.g. if the user made a mistake or admin)
app.post('/api/unclaim/:id', (req, res) => {
  const { id } = req.params;
  const { claimerToken, isAdmin } = req.body;

  const items = loadItems();
  const item = items.find(it => it.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  // Allow unclaiming if token matches or isAdmin
  if (isAdmin || !item.claimerToken || item.claimerToken === claimerToken) {
    item.claimed = false;
    item.claimedAt = null;
    item.claimerToken = null;
    saveItems(items);
    return res.json({ success: true, item });
  }

  return res.status(403).json({ error: 'Nur derjenige, der reserviert hat, kann die Reservierung aufheben.' });
});

// PUT /api/items/:id - update an existing wish
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { url, title, imageUrl, price, note, siteName } = req.body;

  const items = loadItems();
  const itemIndex = items.findIndex(it => it.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  const existing = items[itemIndex];

  let finalTitle = title !== undefined ? title.trim() : existing.title;
  let finalUrl = url !== undefined ? (url.trim() ? (url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim()) : '') : existing.url;
  let finalImage = imageUrl !== undefined ? imageUrl.trim() : existing.imageUrl;
  let finalPrice = price !== undefined ? price.trim() : existing.price;
  let finalNote = note !== undefined ? note.trim() : existing.note;
  let finalSite = siteName !== undefined ? siteName.trim() : existing.siteName;

  if (finalUrl && (!finalSite || finalSite === '')) {
    try {
      finalSite = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch (e) {}
  }

  items[itemIndex] = {
    ...existing,
    title: finalTitle || existing.title,
    url: finalUrl,
    imageUrl: finalImage,
    siteName: finalSite,
    price: finalPrice,
    note: finalNote,
    updatedAt: Date.now()
  };

  saveItems(items);
  res.json({ success: true, item: items[itemIndex] });
});

// DELETE /api/items/:id - delete a wish
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  let items = loadItems();
  const initialLength = items.length;
  items = items.filter(it => it.id !== id);

  if (items.length === initialLength) {
    return res.status(404).json({ error: 'Geschenk nicht gefunden' });
  }

  saveItems(items);
  res.json({ success: true, message: 'Geschenk entfernt' });
});

// Start server (only if not running as serverless function on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Wishlist server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
