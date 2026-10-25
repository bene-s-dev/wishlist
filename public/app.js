/**
 * Bene's Wunschliste - Frontend Application
 * Wide List Cards & Subtle Admin Modal
 */

// State
let items = [];
let currentFilter = 'all';
let isAdmin = localStorage.getItem('bene_wishlist_admin') === 'true';
let targetClaimItem = null;
let editingItemId = null;
let draggedItemId = null;
let isReordering = false;

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
const similarCheckbox = document.getElementById('similarCheckbox');
const previewBadge = document.getElementById('previewBadge');

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
// BADGE HELPERS: "oder ähnlich"
// ========================================================

function updateSimilarPreview() {
  if (!previewBadge) return;
  if (similarCheckbox && similarCheckbox.checked) {
    previewBadge.innerHTML = `<i data-lucide="layers"></i> <span>oder ähnlich</span>`;
    previewBadge.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  } else {
    previewBadge.innerHTML = '';
    previewBadge.classList.add('hidden');
  }
}

// ========================================================
// INITIALIZATION
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateAdminUI();
  loadItems();
  if (window.lucide) {
    lucide.createIcons();
  }

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
  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    if (!pin) return;

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pin })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        isAdmin = true;
        localStorage.setItem('bene_wishlist_admin', 'true');
        adminPinModal.classList.add('hidden');
        pinError.classList.add('hidden');
        pinInput.value = '';
        updateAdminUI();
        renderItems();
        showToast('Erfolgreich angemeldet');
        // Immediately open Add Modal!
        setTimeout(openAddModal, 200);
      } else {
        pinError.classList.remove('hidden');
        pinInput.select();
      }
    } catch (err) {
      console.error('Login verification error:', err);
      pinError.classList.remove('hidden');
    }
  });

  closePinModalBtn.addEventListener('click', () => adminPinModal.classList.add('hidden'));
  cancelPinBtn.addEventListener('click', () => adminPinModal.classList.add('hidden'));

  // Share button
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const shareData = {
        title: "Benes Wunschliste",
        text: "Hier ist meine Wunschliste mit Geschenkideen!",
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
          showToast('Link in Zwischenablage kopiert');
        } catch (e) {
          prompt('Link kopieren:', shareData.url);
        }
      }
    });
  }

  closeAddModalBtn.addEventListener('click', () => {
    addModal.classList.add('hidden');
    editingItemId = null;
  });
  cancelAddBtn.addEventListener('click', () => {
    addModal.classList.add('hidden');
    editingItemId = null;
  });

  // Auto-normalize URL on blur
  urlInput.addEventListener('blur', () => {
    let val = urlInput.value.trim();
    if (val && !/^https?:\/\//i.test(val)) {
      if (val.includes('.') && !val.includes(' ')) {
        urlInput.value = 'https://' + val;
      }
    }
  });

  // Auto-fetch metadata on paste or typing link
  let urlDebounce = null;
  urlInput.addEventListener('input', () => {
    clearTimeout(urlDebounce);
    let val = urlInput.value.trim();
    if (val && !/^https?:\/\//i.test(val) && val.includes('.') && !val.includes(' ')) {
      val = 'https://' + val;
    }
    if (val.startsWith('http://') || val.startsWith('https://')) {
      urlDebounce = setTimeout(() => {
        fetchMetadata(val);
      }, 600);
    }
  });

  fetchPreviewBtn.addEventListener('click', () => {
    let val = urlInput.value.trim();
    if (val) {
      if (!/^https?:\/\//i.test(val)) {
        val = 'https://' + val;
        urlInput.value = val;
      }
      fetchMetadata(val);
    } else {
      urlInput.focus();
    }
  });

  // Live update preview price when user types or enters price manually
  priceInput.addEventListener('input', () => {
    previewPrice.textContent = priceInput.value.trim();
  });

  // Auto-convert dollar to euro if pasted or entered
  priceInput.addEventListener('blur', () => {
    let p = priceInput.value.trim();
    if (p.includes('$') || /USD/i.test(p)) {
      p = p.replace(/\$/g, '').replace(/USD/i, '').trim();
      p = p.replace('.', ',') + ' €';
      priceInput.value = p;
    }
    previewPrice.textContent = priceInput.value.trim();
  });

  // "oder ähnlich" Checkbox in modal
  if (similarCheckbox) {
    similarCheckbox.addEventListener('change', updateSimilarPreview);
  }

  // Submit wish (create or edit)
  addWishForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitAddBtn');
    const isEdit = !!editingItemId;

    let rawUrl = urlInput.value.trim();
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
      urlInput.value = rawUrl;
    }

    let titleVal = titleInput.value.trim();
    if (!titleVal && previewTitle.textContent && previewTitle.textContent !== 'Titel') {
      titleVal = previewTitle.textContent.trim();
      titleInput.value = titleVal;
    }

    // Require at least title or URL
    if (!titleVal && !rawUrl) {
      showToast('Bitte gib einen Titel oder Link ein');
      titleInput.focus();
      return;
    }

    if (!titleVal && rawUrl) {
      try {
        titleVal = new URL(rawUrl).hostname.replace(/^www\./, '');
        titleInput.value = titleVal;
      } catch (e) {
        titleVal = 'Wunsch';
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Aktualisieren...' : 'Speichern...';

    const isSimilar = similarCheckbox ? similarCheckbox.checked : false;

    const payload = {
      url: rawUrl,
      title: titleVal,
      imageUrl: imageUrlInput.value.trim(),
      price: priceInput.value.trim(),
      note: noteInput.value.trim(),
      similarAllowed: isSimilar,
      badge: isSimilar ? 'oder ähnlich' : '',
      siteName: previewSite.textContent && previewSite.textContent !== 'shop.de' ? previewSite.textContent.trim() : ''
    };

    const endpoint = isEdit ? `/api/items/${editingItemId}` : '/api/items';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && (data.success !== false)) {
        addModal.classList.add('hidden');
        showToast(isEdit ? 'Wunsch erfolgreich aktualisiert' : 'Wunsch erfolgreich eingetragen');
        editingItemId = null;
        await loadItems();
      } else {
        alert(data.error || 'Fehler beim Speichern');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Netzwerkfehler beim Speichern. Bitte Verbindung prüfen.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Änderungen speichern' : 'Produkt speichern';
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
        showToast('Vielen Dank! Du schenkst Bene eine Freude');
        await loadItems();
      }
    } catch (err) {
      alert('Fehler beim Reservieren. Bitte erneut versuchen.');
    } finally {
      doClaimBtn.disabled = false;
      doClaimBtn.innerHTML = '<i data-lucide="gift"></i> Ja, ich schenke das!';
      if (window.lucide) lucide.createIcons();
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

// Open & Close Add/Edit Modal
function openAddModal() {
  editingItemId = null;
  addWishForm.reset();
  if (similarCheckbox) similarCheckbox.checked = false;
  updateSimilarPreview();
  document.getElementById('addModalTitle').textContent = 'Neues Produkt eintragen';
  document.getElementById('submitAddBtn').textContent = 'Produkt speichern';
  modalPreviewContainer.classList.add('hidden');
  addModal.classList.remove('hidden');
  setTimeout(() => urlInput.focus(), 100);
}

function openEditModal(item) {
  if (!item) return;
  editingItemId = item.id;
  addWishForm.reset();
  document.getElementById('addModalTitle').textContent = 'Wunsch bearbeiten';
  document.getElementById('submitAddBtn').textContent = 'Änderungen speichern';

  urlInput.value = item.url || '';
  titleInput.value = item.title || '';
  priceInput.value = item.price || '';
  imageUrlInput.value = item.imageUrl || '';
  noteInput.value = item.note || '';

  const isSimilar = !!(item.similarAllowed || item.badge === 'oder ähnlich');
  if (similarCheckbox) similarCheckbox.checked = isSimilar;
  updateSimilarPreview();

  let site = item.siteName || '';
  if (!site && item.url) {
    try {
      const u = item.url.startsWith('http') ? item.url : 'https://' + item.url;
      site = new URL(u).hostname.replace(/^www\./, '');
    } catch (e) {
      site = 'Shop';
    }
  }

  if (item.imageUrl || item.title) {
    modalPreviewContainer.classList.remove('hidden');
    previewTitle.textContent = item.title || '';
    previewSite.textContent = site || 'Shop';
    previewPrice.textContent = item.price || '';
    if (item.imageUrl) {
      previewImg.src = item.imageUrl;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
    }
    updateSimilarPreview();
  } else {
    modalPreviewContainer.classList.add('hidden');
  }

  addModal.classList.remove('hidden');
  setTimeout(() => titleInput.focus(), 100);
}

// Reordering Logic
async function moveItem(fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  renderItems();
  await saveNewOrder();
}

async function saveNewOrder() {
  isReordering = true;
  const itemIds = items.map(it => it.id);
  try {
    const res = await fetch('/api/items/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('Fehler beim Speichern der Reihenfolge');
      await loadItems();
    } else {
      showToast('Reihenfolge gespeichert');
    }
  } catch (err) {
    console.error('Reorder error:', err);
    showToast('Netzwerkfehler beim Umsortieren');
    await loadItems();
  } finally {
    isReordering = false;
  }
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
    modalPreviewContainer.classList.remove('hidden');
    previewTitle.textContent = meta.title || 'Produkt';
    previewSite.textContent = meta.siteName || 'Shop';
    previewPrice.textContent = priceInput.value.trim();
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
  if (isReordering || editingItemId !== null || !addModal.classList.contains('hidden')) {
    return;
  }

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
  if (countAll) countAll.textContent = total;
  if (countFree) countFree.textContent = items.filter(it => !it.claimed).length;
  if (countClaimed) countClaimed.textContent = items.filter(it => it.claimed).length;
}

// Render wide horizontal list items
function renderItems() {
  itemsList.innerHTML = '';

  const filtered = items;

  if (items.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  filtered.forEach((item, index) => {
    const isClaimedByMe = myClaims[item.id] === deviceClaimToken && item.claimed;

    const isSimilar = !!(item.similarAllowed || item.badge === 'oder ähnlich');

    const card = document.createElement('article');
    card.className = isSimilar ? 'list-card has-badge' : 'list-card';
    card.dataset.id = item.id;
    card.dataset.index = index;

    let domainName = item.siteName || '';
    if (!domainName && item.url) {
      try {
        domainName = new URL(item.url).hostname.replace(/^www\./, '');
      } catch (e) {
        domainName = '';
      }
    }

    // Light Orange Badge "oder ähnlich"
    let badgeHtml = '';
    if (isSimilar) {
      badgeHtml = `
        <span class="badge-orange">
          <i data-lucide="layers"></i>
          <span>oder ähnlich</span>
        </span>
      `;
    }

    // Admin order controls (Move Up / Drag / Move Down)
    let orderControlsHtml = '';
    if (isAdmin) {
      const isFirst = index === 0;
      const isLast = index === filtered.length - 1;
      orderControlsHtml = `
        <div class="card-order-controls">
          <button type="button" class="btn-order-move" data-action="move-up" data-id="${item.id}" ${isFirst ? 'disabled' : ''} title="Nach oben verschieben">
            <i data-lucide="chevron-up"></i>
          </button>
          <div class="drag-handle" title="Gedrückt halten zum Umsortieren">
            <i data-lucide="grip-vertical"></i>
          </div>
          <button type="button" class="btn-order-move" data-action="move-down" data-id="${item.id}" ${isLast ? 'disabled' : ''} title="Nach unten verschieben">
            <i data-lucide="chevron-down"></i>
          </button>
        </div>
      `;
    }

    // Thumbnail - never reveals claimed status of others beforehand
    let thumbHtml = '';
    if (item.imageUrl) {
      thumbHtml = `
        <div class="list-card-thumb-wrap">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="list-card-thumb" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'list-card-placeholder\\'><i data-lucide=\\'gift\\'></i></div>'; if (window.lucide) lucide.createIcons();">
          ${isClaimedByMe ? `<span class="thumb-user-badge">Reserviert</span>` : ''}
        </div>
      `;
    } else {
      thumbHtml = `
        <div class="list-card-thumb-wrap">
          <div class="list-card-placeholder"><i data-lucide="gift"></i></div>
          ${isClaimedByMe ? `<span class="thumb-user-badge">Reserviert</span>` : ''}
        </div>
      `;
    }

    // Action button - says "Noch frei?" for everyone else
    let actionBtnHtml = '';
    if (isClaimedByMe) {
      actionBtnHtml = `
        <button class="btn-claim-inline mine" data-action="unclaim" data-id="${item.id}" title="Klick zum Freigeben">
          <i data-lucide="check"></i> Von dir reserviert
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="btn-claim-inline available" data-action="check-claim" data-id="${item.id}">
          Noch frei?
        </button>
      `;
    }

    card.innerHTML = `
      ${orderControlsHtml}
      ${thumbHtml}
      <div class="list-card-content">
        <h3 class="list-card-title">${escapeHtml(item.title)}</h3>

        <div class="list-card-meta">
          ${item.price ? `<span class="list-card-price">${escapeHtml(item.price)}</span>` : ''}
          ${domainName ? `<span class="meta-domain"><i data-lucide="globe"></i> ${escapeHtml(domainName)}</span>` : ''}
          ${badgeHtml}
          ${item.note ? `<span class="meta-note" title="${escapeHtml(item.note)}"><i data-lucide="file-text"></i> ${escapeHtml(item.note)}</span>` : ''}
        </div>

        <div class="list-card-actions">
          ${item.url ? `
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn-shop-link">
              Zum Shop <i data-lucide="external-link"></i>
            </a>
          ` : '<span></span>'}

          <div style="display: flex; align-items: center; gap: 6px;">
            ${isAdmin ? `
              <button type="button" class="btn-admin-edit" data-action="admin-edit" data-id="${item.id}" title="Bearbeiten">
                <i data-lucide="edit-3"></i>
              </button>
              <button type="button" class="btn-admin-del" data-action="admin-delete" data-id="${item.id}" title="Löschen">
                <i data-lucide="trash-2"></i>
              </button>
            ` : ''}
            ${actionBtnHtml}
          </div>
        </div>
      </div>
    `;

    // Event listeners on card buttons
    const checkClaimBtn = card.querySelector('[data-action="check-claim"]');
    if (checkClaimBtn) {
      checkClaimBtn.addEventListener('click', () => {
        if (item.claimed) {
          openAlreadyClaimedModal(item.title);
        } else {
          openConfirmClaimModal(item);
        }
      });
    }

    const editBtn = card.querySelector('[data-action="admin-edit"]');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(item);
      });
    }

    const unclaimBtn = card.querySelector('[data-action="unclaim"]');
    if (unclaimBtn) {
      unclaimBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Möchtest du die Reservierung für „${item.title}“ wieder aufheben?`)) {
          await handleUnclaim(item.id);
        }
      });
    }

    const delBtn = card.querySelector('[data-action="admin-delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`„${item.title}“ wirklich löschen?`)) {
          await handleDeleteItem(item.id);
        }
      });
    }

    // Admin order controls: Move Up & Move Down
    if (isAdmin) {
      const moveUpBtn = card.querySelector('[data-action="move-up"]');
      if (moveUpBtn && index > 0) {
        moveUpBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await moveItem(index, index - 1);
        });
      }

      const moveDownBtn = card.querySelector('[data-action="move-down"]');
      if (moveDownBtn && index < filtered.length - 1) {
        moveDownBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await moveItem(index, index + 1);
        });
      }

      // Drag and Drop
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', (e) => {
        draggedItemId = item.id;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          card.classList.add('drag-over-above');
          card.classList.remove('drag-over-below');
        } else {
          card.classList.add('drag-over-below');
          card.classList.remove('drag-over-above');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-above', 'drag-over-below');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over-above', 'drag-over-below');
        if (!draggedItemId || draggedItemId === item.id) return;

        const fromIdx = items.findIndex(it => it.id === draggedItemId);
        let toIdx = items.findIndex(it => it.id === item.id);
        if (fromIdx === -1 || toIdx === -1) return;

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY >= midY && fromIdx < toIdx) {
          // Keep toIdx as is (will place after)
        }

        const [movedItem] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, movedItem);
        renderItems();
        await saveNewOrder();
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.querySelectorAll('.list-card').forEach(c => {
          c.classList.remove('drag-over-above', 'drag-over-below', 'is-dragging');
        });
        draggedItemId = null;
      });
    }

    itemsList.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
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
      showToast('Geschenk gelöscht');
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
