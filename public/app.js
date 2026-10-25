/**
 * Bene's Wunschliste - Frontend Application
 * Wide List Cards & Subtle Admin Modal
 */

// State
let items = [];
let currentFilter = 'all';
let isAdmin = localStorage.getItem('bene_wishlist_admin') === 'true';
let targetClaimItem = null;

// Persistent unique token for this device/browser
let deviceClaimToken = localStorage.getItem('bene_device_token');
if (!deviceClaimToken) {
  deviceClaimToken = 'user_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
  localStorage.setItem('bene_device_token', deviceClaimToken);
}

// Map of itemId -> claimerToken stored on this device
let myClaims = {};
try {
  myClaims = JSON.parse(localStorage.getItem('bene_my_claims') || '{}');
} catch (e) {
  myClaims = {};
}

// DOM Elements
const itemsList = document.getElementById('itemsList');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const countAll = document.getElementById('countAll');
const countFree = document.getElementById('countFree');
const countClaimed = document.getElementById('countClaimed');
const adminIndicator = document.getElementById('adminIndicator');

// Filter Chips
const filterChips = document.querySelectorAll('.chip');

// Footer Admin Buttons
const footerAdminBtn = document.getElementById('footerAdminBtn');
const footerLogoutBtn = document.getElementById('footerLogoutBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const shareBtn = document.getElementById('shareBtn');

// Modals
const addModal = document.getElementById('addModal');
const closeAddModalBtn = document.getElementById('closeAddModalBtn');
const cancelAddBtn = document.getElementById('cancelAddBtn');
const addWishForm = document.getElementById('addWishForm');
const urlInput = document.getElementById('urlInput');
const fetchPreviewBtn = document.getElementById('fetchPreviewBtn');
const modalPreviewContainer = document.getElementById('modalPreviewContainer');
const previewImg = document.getElementById('previewImg');
const previewSite = document.getElementById('previewSite');
const previewTitle = document.getElementById('previewTitle');
const previewPrice = document.getElementById('previewPrice');
const titleInput = document.getElementById('titleInput');
const priceInput = document.getElementById('priceInput');
const imageUrlInput = document.getElementById('imageUrlInput');
const noteInput = document.getElementById('noteInput');

// Already Claimed Modal
const alreadyClaimedModal = document.getElementById('alreadyClaimedModal');
const closeAlreadyClaimedBtn = document.getElementById('closeAlreadyClaimedBtn');
const claimedItemTitle = document.getElementById('claimedItemTitle');

// Confirm Claim Modal
const confirmClaimModal = document.getElementById('confirmClaimModal');
const cancelConfirmClaimBtn = document.getElementById('cancelConfirmClaimBtn');
const doClaimBtn = document.getElementById('doClaimBtn');
const confirmClaimImg = document.getElementById('confirmClaimImg');
const confirmClaimTitle = document.getElementById('confirmClaimTitle');
const confirmClaimPrice = document.getElementById('confirmClaimPrice');

// Admin PIN Modal
const adminPinModal = document.getElementById('adminPinModal');
const closePinModalBtn = document.getElementById('closePinModalBtn');
const cancelPinBtn = document.getElementById('cancelPinBtn');
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// ========================================================
// INITIALIZATION
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateAdminUI();
  loadItems();

  // Polling for live sync every 15 seconds
  setInterval(loadItems, 15000);
});

function setupEventListeners() {
  // Filters
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderItems();
    });
  });

  // Footer Admin Link: If logged in, opens Add Modal; if not, opens login modal
  const handleAdminClick = () => {
    if (isAdmin) {
      openAddModal();
    } else {
      pinInput.value = '';
      pinError.classList.add('hidden');
      adminPinModal.classList.remove('hidden');
      setTimeout(() => pinInput.focus(), 100);
    }
  };

  footerAdminBtn.addEventListener('click', handleAdminClick);
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', handleAdminClick);

  footerLogoutBtn.addEventListener('click', () => {
    isAdmin = false;
    localStorage.setItem('bene_wishlist_admin', 'false');
    updateAdminUI();
    renderItems();
    showToast('Abgemeldet');
  });

  // Admin indicator click to toggle off admin if desired
  adminIndicator.addEventListener('click', () => {
    if (confirm('Admin-Modus beenden?')) {
      isAdmin = false;
      localStorage.setItem('bene_wishlist_admin', 'false');
      updateAdminUI();
      renderItems();
      showToast('Abgemeldet');
    }
  });

  // PIN / Password Form Submit
  pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    if (pin === 'dreisam26!') {
      isAdmin = true;
      localStorage.setItem('bene_wishlist_admin', 'true');
      adminPinModal.classList.add('hidden');
      updateAdminUI();
      renderItems();
      showToast('Erfolgreich angemeldet! ✨');
      // Immediately open Add Modal!
      setTimeout(openAddModal, 200);
    } else {
      pinError.classList.remove('hidden');
      pinInput.select();
    }
  });

  closePinModalBtn.addEventListener('click', () => adminPinModal.classList.add('hidden'));
  cancelPinBtn.addEventListener('click', () => adminPinModal.classList.add('hidden'));

  // Share button
  shareBtn.addEventListener('click', async () => {
    const shareData = {
      title: "Bene's Wunschliste",
      text: "Hier ist meine Wunschliste mit Geschenkideen! 🎁",
      url: window.location.href.split('?')[0]
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast('Link in Zwischenablage kopiert! 📋');
      } catch (e) {
        prompt('Link kopieren:', shareData.url);
      }
    }
  });

  // Open & Close Add Modal
  function openAddModal() {
    addWishForm.reset();
    modalPreviewContainer.classList.add('hidden');
    addModal.classList.remove('hidden');
    setTimeout(() => urlInput.focus(), 100);
  }

  closeAddModalBtn.addEventListener('click', () => addModal.classList.add('hidden'));
  cancelAddBtn.addEventListener('click', () => addModal.classList.add('hidden'));

  // Auto-fetch metadata on paste or typing link
  let urlDebounce = null;
  urlInput.addEventListener('input', () => {
    clearTimeout(urlDebounce);
    const val = urlInput.value.trim();
    if (val.startsWith('http://') || val.startsWith('https://')) {
      urlDebounce = setTimeout(() => {
        fetchMetadata(val);
      }, 600);
    }
  });

  fetchPreviewBtn.addEventListener('click', () => {
    const val = urlInput.value.trim();
    if (val) {
      fetchMetadata(val);
    } else {
      urlInput.focus();
    }
  });

  // Submit new wish
  addWishForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitAddBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichern...';

    const payload = {
      url: urlInput.value.trim(),
      title: titleInput.value.trim(),
      imageUrl: imageUrlInput.value.trim(),
      price: priceInput.value.trim(),
      note: noteInput.value.trim(),
      siteName: previewSite.textContent || ''
    };

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        addModal.classList.add('hidden');
        showToast('Wunsch erfolgreich eingetragen! 🎁');
        await loadItems();
      } else {
        alert(data.error || 'Fehler beim Speichern');
      }
    } catch (err) {
      alert('Netzwerkfehler beim Speichern');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Produkt speichern';
    }
  });

  // Modals Claim confirmation
  closeAlreadyClaimedBtn.addEventListener('click', () => {
    alreadyClaimedModal.classList.add('hidden');
  });

  cancelConfirmClaimBtn.addEventListener('click', () => {
    confirmClaimModal.classList.add('hidden');
    targetClaimItem = null;
  });

  doClaimBtn.addEventListener('click', async () => {
    if (!targetClaimItem) return;
    doClaimBtn.disabled = true;
    doClaimBtn.textContent = 'Reservieren...';

    try {
      const res = await fetch(`/api/claim/${targetClaimItem.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimerToken: deviceClaimToken })
      });
      const data = await res.json();

      confirmClaimModal.classList.add('hidden');

      if (data.alreadyClaimed) {
        openAlreadyClaimedModal(targetClaimItem.title);
      } else if (data.success) {
        myClaims[targetClaimItem.id] = deviceClaimToken;
        localStorage.setItem('bene_my_claims', JSON.stringify(myClaims));

        launchConfetti();
        showToast('Vielen Dank! Du schenkst Bene eine Freude 🎉');
        await loadItems();
      }
    } catch (err) {
      alert('Fehler beim Reservieren. Bitte erneut versuchen.');
    } finally {
      doClaimBtn.disabled = false;
      doClaimBtn.textContent = 'Ja, ich schenke das! 🎁';
      targetClaimItem = null;
    }
  });

  // Backdrop close
  [addModal, alreadyClaimedModal, confirmClaimModal, adminPinModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

function updateAdminUI() {
  if (isAdmin) {
    adminIndicator.classList.remove('hidden');
    footerAdminBtn.textContent = '+ Produkt eintragen';
    footerLogoutBtn.classList.remove('hidden');
  } else {
    adminIndicator.classList.add('hidden');
    footerAdminBtn.textContent = 'anmelden';
    footerLogoutBtn.classList.add('hidden');
  }
}

// Fetch OG metadata preview
async function fetchMetadata(url) {
  const btnText = fetchPreviewBtn.querySelector('.btn-text');
  const spinner = fetchPreviewBtn.querySelector('.spinner-sm');
  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');
  fetchPreviewBtn.disabled = true;

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const meta = await res.json();

    if (meta.title && !titleInput.value) {
      titleInput.value = meta.title;
    }
    if (meta.imageUrl && !imageUrlInput.value) {
      imageUrlInput.value = meta.imageUrl;
    }
    if (meta.price && !priceInput.value) {
      priceInput.value = meta.price;
    }

    modalPreviewContainer.classList.remove('hidden');
    previewTitle.textContent = meta.title || 'Produkt';
    previewSite.textContent = meta.siteName || 'Shop';
    previewPrice.textContent = meta.price || '';
    if (meta.imageUrl) {
      previewImg.src = meta.imageUrl;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
    }
  } catch (e) {
    console.warn('Metadata scrape preview error', e);
  } finally {
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
    fetchPreviewBtn.disabled = false;
  }
}

// Load wishlist items from API
async function loadItems() {
  try {
    const res = await fetch('/api/items');
    const data = await res.json();
    items = data.items || [];
    updateCounts();
    renderItems();
  } catch (err) {
    console.error('Failed to load items', err);
  } finally {
    loadingState.classList.add('hidden');
  }
}

function updateCounts() {
  const total = items.length;
  const claimedCount = items.filter(it => it.claimed).length;
  const freeCount = total - claimedCount;

  countAll.textContent = total;
  countFree.textContent = freeCount;
  countClaimed.textContent = claimedCount;
}

// Render wide horizontal list items
function renderItems() {
  itemsList.innerHTML = '';

  let filtered = items;
  if (currentFilter === 'free') {
    filtered = items.filter(it => !it.claimed);
  } else if (currentFilter === 'claimed') {
    filtered = items.filter(it => it.claimed);
  }

  if (items.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  filtered.forEach(item => {
    const isClaimedByMe = myClaims[item.id] === deviceClaimToken && item.claimed;
    const isClaimedByOther = item.claimed && !isClaimedByMe;

    const card = document.createElement('article');
    card.className = `list-card ${item.claimed ? 'is-claimed' : ''}`;

    let domainName = item.siteName || '';
    if (!domainName && item.url) {
      try {
        domainName = new URL(item.url).hostname.replace(/^www\./, '');
      } catch (e) {
        domainName = '';
      }
    }

    // Thumbnail
    let thumbHtml = '';
    if (item.imageUrl) {
      thumbHtml = `
        <div class="list-card-thumb-wrap">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="list-card-thumb" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'list-card-placeholder\\'>🎁</div>';">
          ${isClaimedByMe ? `<span class="thumb-user-badge">Reserviert</span>` : (isClaimedByOther ? `<span class="thumb-claimed-badge">Vergeben</span>` : '')}
        </div>
      `;
    } else {
      thumbHtml = `
        <div class="list-card-thumb-wrap">
          <div class="list-card-placeholder">🎁</div>
          ${isClaimedByMe ? `<span class="thumb-user-badge">Reserviert</span>` : (isClaimedByOther ? `<span class="thumb-claimed-badge">Vergeben</span>` : '')}
        </div>
      `;
    }

    // Action button
    let actionBtnHtml = '';
    if (!item.claimed) {
      actionBtnHtml = `
        <button class="btn-claim-inline available" data-action="claim" data-id="${item.id}">
          🎁 Ich schenke das
        </button>
      `;
    } else if (isClaimedByMe) {
      actionBtnHtml = `
        <button class="btn-claim-inline mine" data-action="unclaim" data-id="${item.id}" title="Klick zum Freigeben">
          ✓ Von dir reserviert
        </button>
      `;
    } else {
      // Claimed by someone else -> Clicking brings up "Das wird schon geschenkt!"
      actionBtnHtml = `
        <button class="btn-claim-inline taken" data-action="already-claimed" data-id="${item.id}">
          🔒 Schon geschenkt
        </button>
      `;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="list-card-content">
        <h3 class="list-card-title">${escapeHtml(item.title)}</h3>

        <div class="list-card-meta">
          ${item.price ? `<span class="list-card-price">${escapeHtml(item.price)}</span>` : ''}
          ${domainName ? `<span class="meta-domain">🌐 ${escapeHtml(domainName)}</span>` : ''}
          ${item.note ? `<span class="meta-note" title="${escapeHtml(item.note)}">💡 ${escapeHtml(item.note)}</span>` : ''}
        </div>

        <div class="list-card-actions">
          ${item.url ? `
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn-shop-link">
              Zum Shop ↗
            </a>
          ` : '<span></span>'}

          <div style="display: flex; align-items: center; gap: 6px;">
            ${isAdmin ? `<button class="btn-admin-del" data-action="admin-delete" data-id="${item.id}" title="Löschen">🗑️</button>` : ''}
            ${actionBtnHtml}
          </div>
        </div>
      </div>
    `;

    // Event listeners on card buttons
    const claimBtn = card.querySelector('[data-action="claim"]');
    if (claimBtn) {
      claimBtn.addEventListener('click', () => openConfirmClaimModal(item));
    }

    const takenBtn = card.querySelector('[data-action="already-claimed"]');
    if (takenBtn) {
      takenBtn.addEventListener('click', () => openAlreadyClaimedModal(item.title));
    }

    const unclaimBtn = card.querySelector('[data-action="unclaim"]');
    if (unclaimBtn) {
      unclaimBtn.addEventListener('click', async () => {
        if (confirm(`Möchtest du die Reservierung für „${item.title}“ wieder aufheben?`)) {
          await handleUnclaim(item.id);
        }
      });
    }

    const delBtn = card.querySelector('[data-action="admin-delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (confirm(`„${item.title}“ wirklich löschen?`)) {
          await handleDeleteItem(item.id);
        }
      });
    }

    itemsList.appendChild(card);
  });
}

// Modals helpers
function openConfirmClaimModal(item) {
  targetClaimItem = item;
  confirmClaimTitle.textContent = item.title;
  confirmClaimPrice.textContent = item.price || '';
  if (item.imageUrl) {
    confirmClaimImg.src = item.imageUrl;
    confirmClaimImg.style.display = 'block';
  } else {
    confirmClaimImg.style.display = 'none';
  }
  confirmClaimModal.classList.remove('hidden');
}

function openAlreadyClaimedModal(itemTitle) {
  claimedItemTitle.textContent = itemTitle || 'Dieses Geschenk';
  alreadyClaimedModal.classList.remove('hidden');
}

// Unclaim
async function handleUnclaim(itemId) {
  try {
    const res = await fetch(`/api/unclaim/${itemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimerToken: deviceClaimToken, isAdmin })
    });
    const data = await res.json();
    if (data.success) {
      delete myClaims[itemId];
      localStorage.setItem('bene_my_claims', JSON.stringify(myClaims));
      showToast('Reservierung freigegeben');
      await loadItems();
    }
  } catch (err) {
    alert('Fehler beim Freigeben');
  }
}

// Admin Delete
async function handleDeleteItem(itemId) {
  try {
    const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Geschenk gelöscht 🗑️');
      delete myClaims[itemId];
      localStorage.setItem('bene_my_claims', JSON.stringify(myClaims));
      await loadItems();
    }
  } catch (err) {
    alert('Fehler beim Löschen');
  }
}

// Confetti blast
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 75,
      spread: 65,
      origin: { y: 0.75 },
      colors: ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899']
    });
  }
}

// Toast
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// Utility: HTML escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
