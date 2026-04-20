/* ================================================================
   DSA Content Override Prototype — app.js
   4-panel master-detail SPA with Chart.js charts
   ================================================================ */
'use strict';

const STATE = {
  role: 'Admin',
  currentView: 'products',
  selectedProduct: null,
  selectedRetailer: null,
  selectedAuditProduct: null,
  products: [],
  attributes: {},
  audit: [],
  users: [],
  config: {},
  overrides: {},
  pendingUndo: {},
};

// ── Score Methodology Info ────────────────────────────────────────
const ATTR_SCORE_INFO = {
  'Image': 'Compares the hero product image on the retailer page against the brand-approved reference using pixel similarity and object-recognition hashing. Score reflects visual match accuracy across crop, background, and asset version.',
  'Secondary Image Match': 'Checks whether secondary and lifestyle images on the listing match brand-approved assets. Each image is scored individually; the attribute score is the mean across all secondary images found.',
  'Bullets': 'Validates bullet points for count, keyword coverage, and text similarity to the reference copy. Missing bullets, truncations beyond 30 characters, or wrong keyword order reduce the score proportionally.',
  'Title': 'Measures title keyword coverage, character-length compliance, and text match against the master title. Brand name presence and exact keyword sequence are weighted higher than filler words.',
  'Description': 'Scores long-form description for keyword density, minimum length (≥ 150 words), and copy accuracy vs. the reference. Boilerplate, placeholder text, or stripped HTML score near 0.',
  'Video': 'Checks for the presence of a brand-approved video on the listing. Binary signal weighted with a bonus multiplier — 100 if a verified brand video is detected, 0 if absent or a third-party video.',
  'Enhanced Content': 'Detects presence of A+ / Enhanced Brand Content modules. Score rewards richer content types: comparison tables (highest), lifestyle narrative modules (medium), basic A+ banners (baseline).',
  'NFT Presence': 'Flags whether a Near Field Technology or serialised digital asset tag is registered against this product listing in the retailer content index.',
};

// ── Boot ─────────────────────────────────────────────────────────
async function boot() {
  await Promise.all([
    fetch('data/products.json').then(r => r.json()).then(d => { STATE.products = d; }),
    fetch('data/attributes.json').then(r => r.json()).then(d => { STATE.attributes = d; }),
    fetch('data/audit.json').then(r => r.json()).then(d => { STATE.audit = d; }),
    fetch('data/users.json').then(r => r.json()).then(d => { STATE.users = d; }),
    fetch('data/config.json').then(r => r.json()).then(d => { STATE.config = d; }),
  ]);

  // Seed overrides from pre-existing attribute override states
  for (const [pid, retailers] of Object.entries(STATE.attributes)) {
    for (const [rid, data] of Object.entries(retailers)) {
      for (const attr of (data.attributes || [])) {
        if (attr.overrideState) {
          STATE.overrides[`${pid}:${rid}:${attr.id}`] = {
            label: attr.overrideLabel, score: attr.overrideScore,
            reason: attr.overrideReason, by: attr.overrideBy,
            at: attr.overrideAt, state: attr.overrideState,
          };
        }
      }
    }
  }

  wireRoleSwitcher();
  wireRailNav();
  updateUserAvatar();
  navigate('products');
}

// ── Role Switcher ─────────────────────────────────────────────────
function wireRoleSwitcher() {
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.role = btn.dataset.role;
      document.querySelectorAll('.role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === STATE.role));
      updateUserAvatar();
      navigate(STATE.currentView.startsWith('product') ? 'products' : STATE.currentView);
      showToast(`Role switched to ${STATE.role}`, 'info');
    });
  });
}

function updateUserAvatar() {
  const el = document.getElementById('currentUserAvatar');
  const user = STATE.users.find(u => u.role === STATE.role) || STATE.users[0];
  if (el && user) el.textContent = user.avatar;
}

// ── Rail Nav ──────────────────────────────────────────────────────
function wireRailNav() {
  document.querySelectorAll('.rail-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
}

function setActiveRailItem(view) {
  document.querySelectorAll('.rail-item').forEach(btn => {
    const match = btn.dataset.view === view ||
      (view.startsWith('settings') && btn.dataset.view.startsWith('settings')) ||
      (view === 'products' && btn.dataset.view === 'products');
    btn.classList.toggle('active', match);
  });
}

// ── Router ────────────────────────────────────────────────────────
function navigate(view, params = {}) {
  STATE.currentView = view;
  if (params.productId)  STATE.selectedProduct  = params.productId;
  if (params.retailerId) STATE.selectedRetailer = params.retailerId;

  setActiveRailItem(view);
  renderSubNav(view);

  const main = document.getElementById('mainContent');

  if (view === 'products') {
    main.innerHTML = '';
    renderProductsView(main);
    return;
  }

  main.innerHTML = '';
  // Settings + audit need to scroll their own content; products manages its own panels
  const scrollViews = ['audit','settings-users','settings-config','settings-schedule'];
  main.style.overflowY = scrollViews.includes(view) ? 'auto' : '';

  switch (view) {
    case 'audit':             renderAuditScreen(main); break;
    case 'settings-users':    renderSettingsUsers(main); break;
    case 'settings-config':   renderSettingsConfig(main); break;
    case 'settings-schedule': renderSettingsSchedule(main); break;
    default: main.innerHTML = '<p style="padding:2rem;color:#9CA8C5">Screen not found.</p>';
  }
}

// ── Sub-Nav ───────────────────────────────────────────────────────
function renderSubNav(view) {
  const nav = document.getElementById('subNav');
  nav.innerHTML = '';

  if (view === 'products') {
    nav.innerHTML = `
      <div class="sub-nav__section">
        <div class="sub-nav__heading">Content Quality</div>
        <button class="sub-nav__item active" data-view="products">Product List</button>
        ${STATE.role === 'Admin' ? `<button class="sub-nav__item" data-view="audit">Audit Trail</button>` : ''}
      </div>`;
    nav.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
    return;
  }

  if (view === 'audit') {
    nav.innerHTML = `
      <div class="sub-nav__section">
        <div class="sub-nav__heading">Audit</div>
        <button class="sub-nav__item" data-view="products">Product List</button>
        <button class="sub-nav__item active" data-view="audit">Audit Trail</button>
      </div>`;
    nav.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
    return;
  }

  if (view.startsWith('settings')) {
    const isAdmin = STATE.role === 'Admin';
    nav.innerHTML = `
      <div class="sub-nav__section">
        <div class="sub-nav__heading">Settings</div>
        <button class="sub-nav__item ${view === 'settings-users' ? 'active' : ''}" data-view="settings-users">User Management</button>
        ${isAdmin ? `
        <button class="sub-nav__item ${view === 'settings-config' ? 'active' : ''}" data-view="settings-config">Score Configuration</button>
        <button class="sub-nav__item ${view === 'settings-schedule' ? 'active' : ''}" data-view="settings-schedule">Schedule</button>` : ''}
      </div>`;
    nav.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  }
}

// ════════════════════════════════════════════════════════════════
//  PRODUCTS VIEW — 2-panel split layout
// ════════════════════════════════════════════════════════════════
function renderProductsView(main) {
  const split = document.createElement('div');
  split.className = 'products-split';

  const listPanel = document.createElement('div');
  listPanel.className = 'product-list-panel';
  listPanel.id = 'productListPanel';

  const detailPanel = document.createElement('div');
  detailPanel.className = 'product-detail-panel';
  detailPanel.id = 'productDetailPanel';

  // Focus-restore button (absolutely positioned inside split, visible only in focus mode)
  const focusRestore = document.createElement('button');
  focusRestore.className = 'focus-restore';
  focusRestore.title = 'Restore product list';
  focusRestore.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>List</span>`;

  split.appendChild(listPanel);
  split.appendChild(detailPanel);
  split.appendChild(focusRestore);
  main.appendChild(split);

  renderProductListPanel(listPanel, split);

  focusRestore.addEventListener('click', () => split.classList.remove('focus-mode'));

  if (STATE.selectedProduct) {
    renderProductDetailPanel(detailPanel);
  } else {
    renderDetailEmptyState(detailPanel);
  }
}

function renderProductListPanel(panel, splitRef) {
  panel.innerHTML = `
    <div class="product-list-panel__top">
      <div class="product-list-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9CA8C5" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="#9CA8C5" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="text" placeholder="Search products…" id="productSearch" />
      </div>
      <div class="product-list-filters" id="statusFilter">
        <button class="filter-pill active" data-filter="all">All</button>
        <button class="filter-pill" data-filter="incorrect">Incorrect</button>
        <button class="filter-pill" data-filter="modified">Modified</button>
        <button class="filter-pill" data-filter="correct">Correct</button>
      </div>
    </div>
    <div class="product-list-cards" id="productCards"></div>
    <button class="focus-toggle" id="focusToggle" title="Focus: hide product list">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `;

  if (splitRef) {
    panel.querySelector('#focusToggle').addEventListener('click', () => {
      splitRef.classList.toggle('focus-mode');
    });
  }

  let activeFilter = 'all';
  let searchQuery = '';

  function renderCards() {
    const q = searchQuery.toLowerCase();
    const cards = panel.querySelector('#productCards');
    const filtered = STATE.products.filter(p => {
      const matchQ = !q || p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q);
      if (!matchQ) return false;
      if (activeFilter === 'all') return true;
      const statuses = p.retailers.map(r => r.status);
      if (activeFilter === 'incorrect') return statuses.includes('incorrect');
      if (activeFilter === 'modified')  return statuses.includes('modified');
      if (activeFilter === 'correct')   return !statuses.includes('incorrect') && !statuses.includes('modified');
      return true;
    });
    cards.innerHTML = '';
    if (!filtered.length) { cards.innerHTML = '<div class="empty-state">No products match your filter.</div>'; return; }
    filtered.forEach(p => cards.appendChild(buildProductCard(p)));
  }

  panel.querySelector('#productSearch').addEventListener('input', e => { searchQuery = e.target.value; renderCards(); });
  panel.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      panel.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b === btn));
      renderCards();
    });
  });

  renderCards();
}

function buildProductCard(product) {
  const hasIncorrect = product.retailers.some(r => r.status === 'incorrect');
  const scoreClass   = product.brandScore >= 80 ? 'correct' : product.brandScore >= 61 ? 'review' : 'incorrect';

  const retailerPills = product.retailers.map(r => {
    const cls = r.status === 'correct' ? 'correct' : r.status === 'incorrect' ? 'incorrect' : 'modified';
    return `<span class="retailer-chip retailer-chip--${cls}">${r.name} <strong>${r.score}</strong></span>`;
  }).join('');

  const card = document.createElement('div');
  card.className = `product-card${STATE.selectedProduct === product.id ? ' selected' : ''}`;
  card.dataset.productId = product.id;
  card.innerHTML = `
    <div class="product-card__img-wrap">
      ${product.image
        ? `<img class="product-card__img" src="${product.image}" alt="${product.title}" />`
        : `<div class="product-card__img-placeholder">No image</div>`}
    </div>
    <div class="product-card__body">
      <p class="product-card__sku">Pr ID: ${product.sku}</p>
      <p class="product-card__title">${product.title}</p>
      <p class="product-card__brand">${product.brand}</p>
      <div class="product-card__retailers">${retailerPills}</div>
    </div>
    <div class="product-card__score-wrap">
      <div class="score-badge score-badge--${scoreClass}">${product.brandScore}</div>
      <span class="product-card__score-label">Overall<br>Score</span>
    </div>
    ${hasIncorrect ? '<div class="product-card__alert-dot"></div>' : ''}
  `;

  card.addEventListener('click', () => {
    STATE.selectedProduct  = product.id;
    STATE.selectedRetailer = product.retailers[0]?.id;
    document.querySelectorAll('.product-card').forEach(c => c.classList.toggle('selected', c.dataset.productId === product.id));
    const dp = document.getElementById('productDetailPanel');
    if (dp) renderProductDetailPanel(dp);
  });
  return card;
}

function renderDetailEmptyState(panel) {
  panel.innerHTML = `
    <div class="detail-empty-state">
      <div class="detail-empty-state__icon">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect x="8" y="14" width="40" height="32" rx="4" stroke="#9CA8C5" stroke-width="2"/>
          <path d="M18 22h20M18 29h14M18 36h8" stroke="#9CA8C5" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <p>Select a product from the list to view attribute scores and override content.</p>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  PRODUCT DETAIL PANEL
// ════════════════════════════════════════════════════════════════
function renderProductDetailPanel(panel) {
  panel.innerHTML = '';
  const product = STATE.products.find(p => p.id === STATE.selectedProduct);
  if (!product) { renderDetailEmptyState(panel); return; }

  if (!STATE.selectedRetailer || !product.retailers.find(r => r.id === STATE.selectedRetailer)) {
    STATE.selectedRetailer = product.retailers[0]?.id;
  }
  const retailer = product.retailers.find(r => r.id === STATE.selectedRetailer);

  const content = document.createElement('div');
  content.className = 'detail-content';

  // 0. Product meta panel (image + description + bullets)
  if (product.description || product.bulletPoints?.length) {
    const bulletsHtml = (product.bulletPoints || [])
      .map(b => `<li class="product-meta-panel__bullet">${b}</li>`)
      .join('');
    content.innerHTML += `
      <div class="product-meta-panel">
        ${product.image ? `<img class="product-meta-panel__img" src="${product.image}" alt="${product.title}" />` : ''}
        <div class="product-meta-panel__content">
          ${product.description ? `<p class="product-meta-panel__desc">${product.description}</p>` : ''}
          ${bulletsHtml ? `<ul class="product-meta-panel__bullets">${bulletsHtml}</ul>` : ''}
        </div>
      </div>`;
  }

  // 1. Date bar
  content.innerHTML += `
    <div class="detail-date-bar">
      <span>Updated: <strong>Aug 17, 2025</strong> — <strong>Sep 10, 2025</strong></span>
      <span>Total Instances: <strong>${product.retailers.length * 12}</strong></span>
    </div>`;

  // 2. Score metrics row
  const metricScore = retailer ? retailer.score : product.brandScore;
  content.innerHTML += `
    <div class="metrics-row">
      <div class="metric-box">
        <div class="metric-box__label">Content Quality</div>
        <div class="metric-box__value">${metricScore}</div>
      </div>
      <div class="metric-box">
        <div class="metric-box__label">Average Keyword Rank</div>
        <div class="metric-box__value metric-box__value--muted">—</div>
      </div>
      <div class="metric-box">
        <div class="metric-box__label">Brand Score</div>
        <div class="metric-box__value">${product.brandScore}</div>
      </div>
    </div>`;

  // 3. Scorecards
  const scorecardSec = document.createElement('div');
  scorecardSec.innerHTML = `<div class="scorecard-section__title">Attribute Score Breakdown</div>`;
  const scorecardRow = buildScorecardRow(product, STATE.selectedRetailer);
  scorecardSec.appendChild(scorecardRow);
  content.appendChild(scorecardSec);

  // 4. Charts: stacked bar + trend
  const chartsRow = document.createElement('div');
  chartsRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';

  const stackCard = document.createElement('div');
  stackCard.className = 'chart-card';
  stackCard.innerHTML = `<div class="chart-card__title">Content Score Across Retailers</div><div class="chart-canvas-wrap"><canvas id="stackedBarChart"></canvas></div>`;

  const trendCard = document.createElement('div');
  trendCard.className = 'chart-card';
  trendCard.innerHTML = `<div class="chart-card__title">Content Quality Over Time</div><div class="chart-canvas-wrap"><canvas id="trendChart"></canvas></div>`;

  chartsRow.appendChild(stackCard);
  chartsRow.appendChild(trendCard);
  content.appendChild(chartsRow);

  // 5. Attribute table (with retailer selector)
  const attrSection = buildAttrTableSection(product, STATE.selectedRetailer, panel);
  content.appendChild(attrSection);

  // 6. Embedded audit trail (Admin only)
  if (STATE.role === 'Admin') {
    content.appendChild(buildEmbeddedAuditTrail(product));
  }

  panel.appendChild(content);

  // Init charts after DOM is ready
  requestAnimationFrame(() => {
    initStackedBarChart(product);
    initTrendChart(product);
  });
}

// ── Scorecard Row ─────────────────────────────────────────────────
function buildScorecardRow(product, retailerId) {
  const attrData = STATE.attributes[product.id]?.[retailerId] || null;
  const row = document.createElement('div');
  row.className = 'scorecard-row';

  const attrs = attrData?.attributes || generateSyntheticAttrs(product);
  const scoreable = attrs.filter(a => typeof a.systemScore === 'number' && !isNaN(a.systemScore));

  scoreable.slice(0, 6).forEach(attr => {
    const key = `${product.id}:${retailerId}:${attr.id}`;
    const ov  = STATE.overrides[key];
    const score = ov?.score ?? attr.systemScore;
    const delta = Math.round((Math.random() * 6 - 2) * 10) / 10;
    const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const pct = Math.min(100, score);

    row.innerHTML += `
      <div class="scorecard">
        <div class="scorecard__name">${attr.name}</div>
        <div class="scorecard__score-row">
          <span class="scorecard__score">${score}</span>
          <span class="scorecard__delta scorecard__delta--${deltaClass}">${deltaStr}</span>
        </div>
        <div class="scorecard__bar-track">
          <div class="scorecard__bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  });

  return row;
}

// ── Stacked Bar Chart ─────────────────────────────────────────────
function initStackedBarChart(product) {
  const canvas = document.getElementById('stackedBarChart');
  if (!canvas || !window.Chart) return;

  const retailers = product.retailers;
  const labels = retailers.map(r => r.name);

  // Generate per-retailer red/green distributions (binary: Correct / Incorrect)
  const incorrectData = retailers.map(r => {
    return r.score < 80 ? Math.round(100 - r.score + Math.random() * 8) : Math.round(5 + Math.random() * 10);
  });
  const correctData = retailers.map((r, i) => Math.max(0, 100 - incorrectData[i]));

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Incorrect', data: incorrectData, backgroundColor: '#FF545D', borderWidth: 0 },
        { label: 'Correct', data: correctData, backgroundColor: '#00BD70', borderWidth: 0 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: "'Poppins', sans-serif", size: 10 }, boxWidth: 10, padding: 8 } },
        tooltip: { mode: 'index' },
      },
      scales: {
        x: { stacked: true, display: false, max: 100 },
        y: { stacked: true, ticks: { font: { family: "'Poppins', sans-serif", size: 11 } } },
      },
    },
  });
}

// ── Trend Chart ───────────────────────────────────────────────────
function initTrendChart(product) {
  const canvas = document.getElementById('trendChart');
  if (!canvas || !window.Chart) return;

  const labels = ['Jul 17', 'Jul 24', 'Aug 1', 'Aug 8', 'Aug 17'];
  const colors = ['#73CBCA', '#4C5F90', '#F1937B', '#858FAF', '#B98272', '#89B9F1'];

  const attrNames = ['overall', 'bullet', 'image', 'title', 'description'];
  const datasets = attrNames.slice(0, Math.min(attrNames.length, product.retailers.length + 2)).map((name, i) => {
    const base = 78 + Math.round(Math.random() * 14);
    return {
      label: name,
      data: labels.map((_, j) => base + Math.round((j * 1.5) + (Math.random() * 4 - 2))),
      borderColor: colors[i % colors.length],
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#fff',
      pointBorderColor: colors[i % colors.length],
      tension: 0,
    };
  });

  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { family: "'Poppins', sans-serif", size: 10 }, boxWidth: 10, padding: 6 } },
      },
      scales: {
        x: { ticks: { font: { family: "'Poppins', sans-serif", size: 10 } }, grid: { color: '#EEF0F8' } },
        y: { min: 75, max: 100, ticks: { font: { family: "'Poppins', sans-serif", size: 10 } }, grid: { color: '#EEF0F8' } },
      },
    },
  });
}

// ── Attribute Table ───────────────────────────────────────────────
function buildAttrTableSection(product, retailerId, panelRef) {
  const section = document.createElement('div');
  section.className = 'attr-table-section';
  section.id = 'attrTableSection';

  // Build retailer selector tabs inside header
  const head = document.createElement('div');
  head.className = 'attr-table-section__head';
  head.innerHTML = `
    <div class="attr-table-section__title">Content Quality Across Retailers</div>
    <div style="display:flex;gap:4px;" id="retailerTabs"></div>`;
  section.appendChild(head);

  product.retailers.forEach(r => {
    const tab = document.createElement('button');
    tab.className = `filter-pill${r.id === retailerId ? ' active' : ''}`;
    tab.textContent = r.name;
    tab.addEventListener('click', () => {
      STATE.selectedRetailer = r.id;
      head.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b === tab));
      renderAttrTableBody(section, product, r.id, panelRef);
    });
    head.querySelector('#retailerTabs').appendChild(tab);
  });

  // Info row
  const info = document.createElement('div');
  info.className = 'attr-audit-info-row';
  info.innerHTML = `
    <span>Date of Reference Update: <strong>Jul 28, 2025</strong></span>
    <span>Date of Analysis: <strong>Aug 17, 2025</strong></span>`;
  section.appendChild(info);

  renderAttrTableBody(section, product, retailerId, panelRef);
  return section;
}

function renderAttrTableBody(section, product, retailerId, panelRef) {
  // Remove old body if present
  const old = section.querySelector('.attr-table-body');
  if (old) old.remove();

  const body = document.createElement('div');
  body.className = 'attr-table-body';

  const retailer = product.retailers.find(r => r.id === retailerId);
  const attrData = STATE.attributes[product.id]?.[retailerId];
  const attrs = attrData?.attributes || generateSyntheticAttrs(product);
  const hasContentChange = !attrData || Math.random() > 0.4;
  const canOverride = STATE.role === 'Admin' || STATE.role === 'Editor';

  // Yellow retailer banner (if content changed)
  if (hasContentChange && retailer) {
    const banner = document.createElement('div');
    banner.className = 'retailer-banner';
    banner.innerHTML = `
      <div class="retailer-banner__left">
        <div class="retailer-banner__name">${retailer.name}</div>
        <div class="retailer-banner__msg">The content for this product has changed since the last time we tracked this. The change was observed in Image and Description.</div>
      </div>
      <div class="retailer-banner__score">Score: ${retailer.score}%</div>`;
    body.appendChild(banner);
  }

  // Column headers
  body.innerHTML += `
    <div class="attr-col-headers">
      <div class="attr-col-hdr"></div>
      <div class="attr-col-hdr">Attribute</div>
      <div class="attr-col-hdr">Score</div>
      <div class="attr-col-hdr">Label</div>
      <div class="attr-col-hdr">${canOverride ? 'Action' : ''}</div>
    </div>`;

  // Attribute rows
  attrs.forEach(attr => {
    const key = `${product.id}:${retailerId}:${attr.id}`;
    const override = STATE.overrides[key];
    const pending  = STATE.pendingUndo[key];
    const effectiveLabel = override ? override.label : (attr.displayLabel || scoreToLabel(attr.systemScore));
    const labelClass = effectiveLabel === 'Correct' ? 'correct' : effectiveLabel === 'Incorrect' ? 'incorrect' : 'review';
    const isModified = !!override;
    const isPending  = !!pending;

    // Row
    const rowWrap = document.createElement('div');
    rowWrap.className = 'attr-row-wrap';

    const row = document.createElement('div');
    row.className = `attr-row${isModified ? ' attr-row--modified' : ''}${isPending ? ' attr-row--pending' : ''}`;
    row.dataset.attrKey = key;

    const scoreDisplay = (typeof attr.systemScore === 'number' && !isNaN(attr.systemScore))
      ? `<span class="score-val">${attr.systemScore}</span>`
      : `<span class="score-val score-val--na">—</span>`;

    const expandBtn = `<button class="expand-btn" data-attr-key="${key}" title="Expand">+</button>`;

    const metaHtml = (isModified && override?.by)
      ? (() => {
          const d = override.at ? new Date(override.at) : null;
          const dateStr = d ? d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' })
            + ' · ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'UTC', hour12:true }) + ' UTC' : '';
          const oldLbl  = override.oldLabel || '—';
          const oldScr  = override.oldScore  != null ? override.oldScore  : attr.systemScore;
          const newScr  = override.score     != null ? override.score     : null;
          const REASON_LABELS = { 'OR-01':'Image marketing label','OR-02':'Image typography / topology','OR-03':'Text rephrasing','OR-04':'Regional / language adaptation','OR-05':'Character / formatting difference','OR-06':'Truncation','OR-07':'Secondary image ordering','OR-08':'Other' };
          const reasonLabel = override.reason ? (() => {
            const code = override.reason.match(/^(OR-\d+)/)?.[1] || '';
            const freeText = override.reason.replace(/^OR-\d+:\s*/, '').trim();
            const labelText = REASON_LABELS[code] || freeText || override.reason;
            const display = (code === 'OR-08' && freeText) ? `${labelText}: ${freeText}` : labelText;
            return code ? `${display} (${code})` : display;
          })() : '—';
          const scoreLine = newScr != null
            ? `\nOld score: ${parseFloat(oldScr).toFixed(2)}   New score: ${parseFloat(newScr).toFixed(2)}` : '';
          const tip = `Updated by: ${override.by}\nDate: ${dateStr}\nOld: score ${oldScr} → ${oldLbl}\nNew: ${override.label}${scoreLine}\nReason: ${reasonLabel}`;
          return `<button class="info-icon-btn" title="${tip}" aria-label="Override history">ⓘ</button>`;
        })() : '';

    let actionCell = '';
    if (canOverride) {
      if (isPending) {
        actionCell = `<div class="undo-wrap" id="undo-${key.replace(/:/g,'_')}"></div>`;
      } else if (!isOverrideEligible(attr.systemScore)) {
        actionCell = `<span class="eligibility-indicator" title="Score is within the configured normal range — override not required">In range</span>`;
      } else if (isModified) {
        actionCell = `<button class="btn-undo-update" data-attr-key="${key}">Undo Update</button>`;
      } else {
        actionCell = `<button class="btn-update" data-attr-key="${key}">Update</button>`;
      }
    }

    row.innerHTML = `
      ${expandBtn}
      <div class="attr-name-cell">
        <span class="attr-name">${attr.name}</span>
        <button class="info-btn" title="Score methodology">i</button>
        ${isModified ? '<span class="modified-badge">Modified</span>' : ''}
        ${metaHtml}
      </div>
      ${scoreDisplay}
      <div><span class="status-pill status-pill--${labelClass}">${effectiveLabel}</span></div>
      <div>${actionCell}</div>`;

    rowWrap.appendChild(row);
    body.appendChild(rowWrap);

    // Wire expand button
    row.querySelector('.expand-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const existing = rowWrap.querySelector('.attr-expanded');
      if (existing) {
        existing.remove();
        btn.textContent = '+';
        btn.classList.remove('is-expanded');
      } else {
        btn.textContent = '−';
        btn.classList.add('is-expanded');
        rowWrap.appendChild(buildAttrExpanded(attr, key, override, { product, retailerId, section, panelRef, canOverride }));
      }
    });

    // Wire info button
    row.querySelector('.info-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const existing = rowWrap.querySelector('.attr-info-panel');
      if (existing) {
        existing.remove();
        btn.classList.remove('active');
      } else {
        btn.classList.add('active');
        const panel = document.createElement('div');
        panel.className = 'attr-info-panel';
        const methodology = ATTR_SCORE_INFO[attr.name] || 'Score reflects how closely this attribute matches the brand reference across key quality dimensions. Weights are configured in Score Configuration settings.';
        panel.innerHTML = `
          <div class="attr-info-panel__heading">Score methodology — ${attr.name}</div>
          <p class="attr-info-panel__desc">${methodology}</p>`;
        rowWrap.appendChild(panel);
      }
    });

    // Wire Update button
    if (canOverride && !isPending) {
      const updateBtn = row.querySelector('.btn-update');
      if (updateBtn) {
        updateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openOverridePopup(key, product, retailerId, attr, section, panelRef);
        });
      }
      // Wire Undo Update button — reverts to old label/score
      const undoUpdateBtn = row.querySelector('.btn-undo-update');
      if (undoUpdateBtn) {
        undoUpdateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const revertLabel = override.oldLabel || scoreToLabel(attr.systemScore);
          const revertScore = override.oldScore ?? null;
          submitOverride(key, product, retailerId, attr, revertLabel, revertScore, '', section, panelRef);
        });
      }
    }

    // Post-commit confirmation message (12.1.3)
    if (isModified && !isPending) {
      // Calculate next 2 AM UTC regardless of stale config.schedule.nextRun
      const nextRun = (() => {
        const d = new Date(); d.setUTCHours(2,0,0,0);
        if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1);
        return d;
      })();
      const diffMs  = nextRun.getTime() - Date.now();
      const diffHrs = Math.max(1, Math.round(diffMs / 36e5));
      const istOpts = { timeZone:'Asia/Kolkata', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true };
      const istStr  = nextRun.toLocaleString('en-IN', istOpts).replace(',','');
      const scheduleMsg = `Updates in ${diffHrs} hour${diffHrs !== 1 ? 's' : ''} (by ${istStr} IST)`;
      const confirmEl = document.createElement('div');
      confirmEl.className = 'post-commit-msg';
      confirmEl.innerHTML = `<span class="post-commit-msg__check">✓</span> Updated. Scorecard reflects this change on the next refresh.${scheduleMsg ? `<span class="post-commit-msg__schedule">${scheduleMsg}</span>` : ''}`;
      rowWrap.appendChild(confirmEl);
    }

    // Render undo countdown if pending
    if (isPending) {
      const undoCell = row.querySelector(`#undo-${key.replace(/:/g,'_')}`);
      if (undoCell) renderUndoCountdown(undoCell, key, product, retailerId, attr, panelRef);
    }
  });

  section.appendChild(body);
}

// ── Expanded attribute row ────────────────────────────────────────
function buildAttrExpanded(attr, key, override, ctx = {}) {
  const { product, retailerId, canOverride } = ctx;
  const div = document.createElement('div');
  div.className = 'attr-expanded';

  function refreshExpanded() {
    const newDiv = buildAttrExpanded(attr, key, STATE.overrides[key], ctx);
    div.replaceWith(newDiv);
  }

  const isImage = attr.name.toLowerCase().includes('image');
  const isSecondaryImage = attr.name.toLowerCase().includes('secondary');

  if (isImage && isSecondaryImage && product && retailerId) {
    // Per-image section: 3 synthetic secondary image rows with independent override
    const perImageSection = document.createElement('div');
    perImageSection.className = 'per-image-section';
    perImageSection.innerHTML = `
      <div class="per-image-section__header">
        <span class="per-image-section__title">Per-image override</span>
        <span class="per-image-section__hint">Override each secondary image independently</span>
      </div>`;

    const syntheticImages = [
      { num: 1, systemScore: 87, systemValue: 'pack_front_angle.jpg' },
      { num: 2, systemScore: 44, systemValue: 'lifestyle_kitchen.jpg' },
      { num: 3, systemScore: 91, systemValue: 'ingredients_close.jpg' },
    ];

    syntheticImages.forEach(({ num, systemScore, systemValue }) => {
      const imgAttr = {
        id: `${attr.id}_img${num}`,
        name: `Secondary Image ${num}`,
        systemScore,
        displayLabel: scoreToLabel(systemScore),
        systemValue,
        attributeType: 'secondary_image',
      };
      const imgKey = `${product.id}:${retailerId}:${imgAttr.id}`;
      const imgOverride = STATE.overrides[imgKey];
      const effectiveLabel = imgOverride ? imgOverride.label : imgAttr.displayLabel;
      const lblClass = effectiveLabel === 'Correct' ? 'correct' : effectiveLabel === 'Incorrect' ? 'incorrect' : 'review';
      const isImgModified = !!imgOverride;

      const metaHtml = (isImgModified && imgOverride?.by)
        ? `<button class="info-icon-btn" title="Updated by: ${imgOverride.by}\nDate: ${imgOverride.at ? new Date(imgOverride.at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})+' UTC' : ''}\nReason: ${imgOverride.reason || '—'}" aria-label="Override history">ⓘ</button>` : '';

      let actionHtml = '';
      if (canOverride) {
        actionHtml = isImgModified
          ? `<button class="btn-undo-update per-img-undo-btn">Undo</button>`
          : `<button class="btn-update per-img-update-btn">Update</button>`;
      }

      const imgRow = document.createElement('div');
      imgRow.className = `per-image-row${isImgModified ? ' per-image-row--modified' : ''}`;
      imgRow.innerHTML = `
        <div class="per-image-row__compare">
          <div class="per-image-col">
            <div class="per-image-col__label">Reference</div>
            <div class="per-image-thumb per-image-thumb--ref">${num}</div>
          </div>
          <div class="per-image-col">
            <div class="per-image-col__label">Actual</div>
            <div class="per-image-thumb per-image-thumb--actual">${num}</div>
          </div>
        </div>
        <div class="per-image-row__info">
          <span class="per-image-row__name">${imgAttr.name}${isImgModified ? ' <span class="modified-badge">Modified</span>' : ''}</span>
          <div class="per-image-row__status">
            <span class="status-pill status-pill--${lblClass}">${effectiveLabel}</span>
            ${metaHtml}
            <span class="per-image-row__score">Score: ${imgAttr.systemScore}</span>
          </div>
        </div>
        <div class="per-image-row__action">${actionHtml}</div>`;

      const updateBtn = imgRow.querySelector('.per-img-update-btn');
      if (updateBtn) {
        updateBtn.addEventListener('click', e => {
          e.stopPropagation();
          openPerImageOverridePopup(imgKey, product, retailerId, imgAttr, refreshExpanded);
        });
      }
      const undoBtn = imgRow.querySelector('.per-img-undo-btn');
      if (undoBtn) {
        undoBtn.addEventListener('click', e => {
          e.stopPropagation();
          const revertLabel = imgOverride.oldLabel || scoreToLabel(imgAttr.systemScore);
          commitPerImageOverride(imgKey, revertLabel, imgOverride.oldScore ?? null, '', refreshExpanded);
        });
      }

      perImageSection.appendChild(imgRow);
    });

    div.appendChild(perImageSection);
  } else if (isImage) {
    div.innerHTML = `
      <div class="attr-expanded__img-compare">
        <div class="attr-expanded__img-col">
          <div class="attr-expanded__img-label">Reference image</div>
          <div class="attr-expanded__img"><div class="attr-expanded__img-placeholder">Reference image not available</div></div>
        </div>
        <div class="attr-expanded__img-col">
          <div class="attr-expanded__img-label">Actual image</div>
          <div class="attr-expanded__img"><div class="attr-expanded__img-placeholder">Actual image not available</div></div>
        </div>
      </div>`;
  }

  const score = override?.score ?? attr.systemScore;
  const metaItems = [
    ['Score', typeof score === 'number' ? score : '—'],
    ['System value', attr.systemValue || '—'],
    ['Attribute type', attr.attributeType || attr.name],
  ];
  if (override) {
    metaItems.push(['Override by', override.by || '—']);
    if (override.reason) metaItems.push(['Reason', override.reason]);
  }

  const meta = document.createElement('div');
  meta.className = 'attr-expanded__meta';
  metaItems.forEach(([label, val]) => {
    meta.innerHTML += `<div class="attr-meta-row"><span class="attr-meta-row__label">${label}</span><span class="attr-meta-row__val">${val}</span></div>`;
  });

  if (override) {
    meta.innerHTML += `<div class="attr-override-info">Manually overridden — score recompute scheduled for next run</div>`;
  }

  div.appendChild(meta);
  return div;
}

// ── Per-image override helpers ────────────────────────────────────
function commitPerImageOverride(imgKey, newLabel, newScore, reason, onDone) {
  const user = STATE.users.find(u => u.role === STATE.role) || STATE.users[0];
  const oldOverride = STATE.overrides[imgKey];
  const oldLabel = oldOverride ? oldOverride.label : scoreToLabel(parseInt(imgKey.split('img')[1]) > 0 ? 80 : 50);

  if (newLabel === oldLabel && !newScore) {
    delete STATE.overrides[imgKey];
  } else {
    STATE.overrides[imgKey] = {
      label: newLabel, score: newScore,
      oldLabel, oldScore: oldOverride?.score ?? null,
      reason, by: user.name, at: new Date().toISOString(),
      state: 'modified', committedAt: new Date().toISOString(),
    };
  }

  const attrName = imgKey.split(':').pop().replace(/_/g, ' ');
  showToast(`${attrName} updated to ${newLabel}`, 'success');
  if (onDone) onDone();
}

function openPerImageOverridePopup(imgKey, product, retailerId, imgAttr, onDone) {
  const mode = STATE.config.overrideMode || 'label';
  const override = STATE.overrides[imgKey];
  const currentLabel = override?.label || imgAttr.displayLabel || scoreToLabel(imgAttr.systemScore);
  const currentScore = override?.score ?? imgAttr.systemScore ?? 80;
  const retailerName = product.retailers.find(r => r.id === retailerId)?.name || retailerId;
  const cfgLabels    = STATE.config.scoreThresholds?.labels || {};
  const correctLabel   = cfgLabels.correct?.label   || 'Correct';
  const incorrectLabel = cfgLabels.incorrect?.label  || 'Incorrect';

  const backdrop = document.getElementById('overrideBackdrop');
  backdrop.innerHTML = '';
  backdrop.classList.remove('hidden');

  const popup = document.createElement('div');
  popup.className = 'override-popup';
  popup.innerHTML = `
    <div class="override-popup__header">
      <div>
        <div class="override-popup__title">Override: ${imgAttr.name}</div>
        <div class="override-popup__subtitle">${product.title} @ ${retailerName}</div>
      </div>
      <div class="override-popup__header-right">
        <span class="override-mode-badge override-mode-badge--${mode}">${mode === 'score' ? 'Score-based' : 'Label-based'}</span>
        <button class="override-popup__close" id="perImgClose">&times;</button>
      </div>
    </div>
    <div class="override-popup__body">
      ${mode === 'label' ? `
      <div>
        <label class="field-label">Assign label</label>
        <div class="label-choices">
          <label class="label-choice ${currentLabel === correctLabel ? 'selected-correct' : ''}">
            <input type="radio" name="newLabel" value="${correctLabel}" ${currentLabel === correctLabel ? 'checked' : ''} />
            <span class="status-pill status-pill--correct">${correctLabel}</span>
          </label>
          <label class="label-choice ${currentLabel === incorrectLabel ? 'selected-incorrect' : ''}">
            <input type="radio" name="newLabel" value="${incorrectLabel}" ${currentLabel === incorrectLabel ? 'checked' : ''} />
            <span class="status-pill status-pill--incorrect">${incorrectLabel}</span>
          </label>
        </div>
      </div>` : `
      <div>
        <label class="field-label">Set confidence score <span class="field-label__range">0 – 100</span></label>
        <div class="score-slider-wrap">
          <input type="range" min="0" max="100" value="${currentScore}" class="score-slider" id="perImgScoreSlider" />
          <input type="number" min="0" max="100" value="${currentScore}" class="score-number" id="perImgScoreNumber" />
        </div>
        <div class="score-preview" id="perImgScorePreview">
          Label: <span class="status-pill status-pill--${scoreToLabelClass(currentScore)}">${scoreToLabel(currentScore)}</span>
        </div>
      </div>`}
      <div class="override-popup__reason">
        <label class="field-label">Reason <span class="optional-tag">Optional</span></label>
        <select id="perImgReasonCode" class="override-reason-select">
          <option value="">— Select a reason (optional) —</option>
          <option value="OR-01">Image marketing label</option>
          <option value="OR-02">Image typography / topology</option>
          <option value="OR-07">Secondary image ordering</option>
          <option value="OR-08">Other</option>
        </select>
        <div id="perImgOtherWrap" class="override-other-wrap" style="display:none">
          <textarea rows="2" placeholder="Describe the variation (encouraged, not required)…" id="perImgReasonText"></textarea>
        </div>
      </div>
    </div>
    <div class="override-popup__footer">
      <button class="btn btn--secondary" id="perImgCancel">Cancel</button>
      <button class="btn btn--primary" id="perImgSubmit">Confirm Override</button>
    </div>`;

  backdrop.appendChild(popup);

  function close() { backdrop.classList.add('hidden'); backdrop.innerHTML = ''; }
  popup.querySelector('#perImgClose').addEventListener('click', close);
  popup.querySelector('#perImgCancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  popup.querySelector('#perImgReasonCode').addEventListener('change', e => {
    popup.querySelector('#perImgOtherWrap').style.display = e.target.value === 'OR-08' ? 'block' : 'none';
  });

  if (mode === 'label') {
    popup.querySelectorAll('.label-choice input').forEach(inp => {
      inp.addEventListener('change', () => {
        popup.querySelectorAll('.label-choice').forEach(lc => {
          const v = lc.querySelector('input').value;
          const on = lc.querySelector('input').checked;
          lc.className = 'label-choice' + (on ? ` selected-${v === correctLabel ? 'correct' : 'incorrect'}` : '');
        });
      });
    });
  } else {
    const slider = popup.querySelector('#perImgScoreSlider');
    const numInput = popup.querySelector('#perImgScoreNumber');
    const preview = popup.querySelector('#perImgScorePreview');
    function syncScore(val) {
      const v = Math.min(100, Math.max(0, parseInt(val) || 0));
      slider.value = v; numInput.value = v;
      preview.innerHTML = `Label: <span class="status-pill status-pill--${scoreToLabelClass(v)}">${scoreToLabel(v)}</span>`;
    }
    slider.addEventListener('input', () => syncScore(slider.value));
    numInput.addEventListener('input', () => syncScore(numInput.value));
  }

  popup.querySelector('#perImgSubmit').addEventListener('click', () => {
    const reasonCode = popup.querySelector('#perImgReasonCode').value;
    const freeText   = popup.querySelector('#perImgReasonText')?.value.trim() || '';
    const reason     = reasonCode === 'OR-08' ? `${reasonCode}: ${freeText}`.trim().replace(/:\s*$/, '') : reasonCode || '';
    let newLabel, newScore;
    if (mode === 'score') {
      newScore = parseInt(popup.querySelector('#perImgScoreNumber').value);
      newLabel = scoreToLabel(newScore);
    } else {
      const checked = popup.querySelector('input[name="newLabel"]:checked');
      if (!checked) { showToast('Please select a label', 'error'); return; }
      newLabel = checked.value;
      newScore = null;
    }
    close();
    commitPerImageOverride(imgKey, newLabel, newScore, reason, onDone);
  });
}

// ── Override Eligibility Check ────────────────────────────────────
function isOverrideEligible(systemScore) {
  const elig = STATE.config.overrideEligibility;
  if (!elig?.enabled) return true;
  const s = parseInt(systemScore);
  if (isNaN(s)) return true;
  // Show override only when score is OUTSIDE the hidden band
  return s < elig.eligibleBelowScore || s > elig.eligibleAboveScore;
}

// ── Override Popup ────────────────────────────────────────────────
function openOverridePopup(key, product, retailerId, attr, attrSection, panelRef) {
  const backdrop = document.getElementById('overrideBackdrop');
  const override = STATE.overrides[key];
  const mode = STATE.config.overrideMode || 'label';
  const retailerName = product.retailers.find(r => r.id === retailerId)?.name || retailerId;

  // Dynamic label names — read from config so threshold renaming propagates here
  const cfgLabels      = STATE.config.scoreThresholds?.labels || {};
  const correctLabel   = cfgLabels.correct?.label   || 'Correct';
  const incorrectLabel = cfgLabels.incorrect?.label  || 'Incorrect';

  const currentLabel = override?.label || attr.displayLabel || scoreToLabel(attr.systemScore);
  const currentScore = override?.score ?? attr.systemScore ?? 80;

  backdrop.innerHTML = '';
  backdrop.classList.remove('hidden');

  const popup = document.createElement('div');
  popup.className = 'override-popup';
  popup.innerHTML = `
    <div class="override-popup__header">
      <div>
        <div class="override-popup__title">Override: ${attr.name}</div>
        <div class="override-popup__subtitle">${product.title} @ ${retailerName}</div>
      </div>
      <div class="override-popup__header-right">
        <span class="override-mode-badge override-mode-badge--${mode}">${mode === 'score' ? 'Score-based' : 'Label-based'}</span>
        <button class="override-popup__close" id="overrideClose">&times;</button>
      </div>
    </div>

    <div class="override-popup__body">

      ${mode === 'label' ? `
      <div id="labelSection">
        <label class="field-label">Assign label</label>
        <div class="label-choices">
          <label class="label-choice ${currentLabel === correctLabel ? 'selected-correct' : ''}">
            <input type="radio" name="newLabel" value="${correctLabel}" ${currentLabel === correctLabel ? 'checked' : ''} />
            <span class="status-pill status-pill--correct">${correctLabel}</span>
          </label>
          <label class="label-choice ${currentLabel === incorrectLabel ? 'selected-incorrect' : ''}">
            <input type="radio" name="newLabel" value="${incorrectLabel}" ${currentLabel === incorrectLabel ? 'checked' : ''} />
            <span class="status-pill status-pill--incorrect">${incorrectLabel}</span>
          </label>
        </div>
      </div>` : `
      <div id="scoreSection">
        <label class="field-label">Set confidence score <span class="field-label__range">0 – 100</span></label>
        <div class="score-slider-wrap">
          <input type="range" min="0" max="100" value="${currentScore}" class="score-slider" id="scoreSlider" />
          <input type="number" min="0" max="100" value="${currentScore}" class="score-number" id="scoreNumber" />
        </div>
        <div class="score-preview" id="scorePreview">
          Label: <span class="status-pill status-pill--${scoreToLabelClass(currentScore)}">${scoreToLabel(currentScore)}</span>
        </div>
      </div>`}

      <div class="override-popup__reason">
        <label class="field-label">Reason <span class="optional-tag">Optional</span></label>
        <select id="overrideReasonCode" class="override-reason-select">
          <option value="">— Select a reason (optional) —</option>
          <option value="OR-01">Image marketing label</option>
          <option value="OR-02">Image typography / topology</option>
          <option value="OR-03">Text rephrasing</option>
          <option value="OR-04">Regional / language adaptation</option>
          <option value="OR-05">Character / formatting difference</option>
          <option value="OR-06">Truncation</option>
          <option value="OR-07">Secondary image ordering</option>
          <option value="OR-08">Other</option>
        </select>
        <div id="overrideOtherWrap" class="override-other-wrap" style="display:none">
          <textarea rows="2" placeholder="Describe the variation (encouraged, not required)…" id="overrideReason">${override?.reason || ''}</textarea>
        </div>
      </div>

    </div>

    <div class="override-popup__footer">
      <button class="btn btn--secondary" id="overrideCancel">Cancel</button>
      <button class="btn btn--primary" id="overrideSubmit">Confirm Override</button>
    </div>`;

  backdrop.appendChild(popup);

  function close() {
    backdrop.classList.add('hidden');
    backdrop.innerHTML = '';
  }

  backdrop.querySelector('#overrideClose').addEventListener('click', close);
  backdrop.querySelector('#overrideCancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  // OR-08 free-text toggle
  backdrop.querySelector('#overrideReasonCode').addEventListener('change', e => {
    backdrop.querySelector('#overrideOtherWrap').style.display = e.target.value === 'OR-08' ? 'block' : 'none';
  });

  if (mode === 'label') {
    backdrop.querySelectorAll('.label-choice input').forEach(inp => {
      inp.addEventListener('change', () => {
        backdrop.querySelectorAll('.label-choice').forEach(lc => {
          const v  = lc.querySelector('input').value;
          const on = lc.querySelector('input').checked;
          lc.className = 'label-choice' + (on
            ? ` selected-${v === correctLabel ? 'correct' : 'incorrect'}`
            : '');
        });
      });
    });
  } else {
    const slider   = backdrop.querySelector('#scoreSlider');
    const numInput = backdrop.querySelector('#scoreNumber');
    const preview  = backdrop.querySelector('#scorePreview');
    function syncScore(val) {
      const v = Math.min(100, Math.max(0, parseInt(val) || 0));
      slider.value = v; numInput.value = v;
      preview.innerHTML = `Label: <span class="status-pill status-pill--${scoreToLabelClass(v)}">${scoreToLabel(v)}</span>`;
    }
    slider.addEventListener('input', () => syncScore(slider.value));
    numInput.addEventListener('input', () => syncScore(numInput.value));
  }

  backdrop.querySelector('#overrideSubmit').addEventListener('click', () => {
    const reasonCode = backdrop.querySelector('#overrideReasonCode').value;
    const freeText   = backdrop.querySelector('#overrideReason')?.value.trim() || '';
    const reason     = reasonCode === 'OR-08' ? `${reasonCode}: ${freeText}`.trim().replace(/:\s*$/, '')
                     : reasonCode || '';
    let newLabel, newScore;
    if (mode === 'score') {
      newScore = parseInt(backdrop.querySelector('#scoreNumber').value);
      newLabel = scoreToLabel(newScore);
    } else {
      const checked = backdrop.querySelector('input[name="newLabel"]:checked');
      if (!checked) { showToast('Please select a label', 'error'); return; }
      newLabel = checked.value;
      newScore = null;
    }
    close();
    submitOverride(key, product, retailerId, attr, newLabel, newScore, reason, attrSection, panelRef);
  });
}

// ── Override Submit / Commit / Undo ───────────────────────────────
function submitOverride(key, product, retailerId, attr, newLabel, newScore, reason, attrSection, panelRef) {
  const user = STATE.users.find(u => u.role === STATE.role) || STATE.users[0];
  const oldOverride = STATE.overrides[key];
  const oldLabel = oldOverride ? oldOverride.label : (attr.displayLabel || scoreToLabel(attr.systemScore));
  const secs = STATE.config.countdownTimer?.durationSeconds ?? 10;

  STATE.pendingUndo[key] = {
    oldLabel, oldScore: oldOverride?.score ?? null,
    newLabel, newScore, reason,
    by: user.name, at: new Date().toISOString(), timerHandle: null,
  };

  STATE.pendingUndo[key].timerHandle = setTimeout(() => {
    commitOverride(key, product, retailerId, attr, user);
    refreshAttrSection(attrSection, product, retailerId, panelRef);
    showToast(`"${attr.name}" updated to ${newLabel}`, 'success');
  }, secs * 1000);

  refreshAttrSection(attrSection, product, retailerId, panelRef);
}

function commitOverride(key, product, retailerId, attr, user) {
  const pending = STATE.pendingUndo[key];
  if (!pending) return;
  STATE.overrides[key] = {
    label: pending.newLabel, score: pending.newScore,
    oldLabel: pending.oldLabel, oldScore: pending.oldScore,
    reason: pending.reason, by: pending.by, at: pending.at,
    committedAt: new Date().toISOString(), state: 'modified',
  };
  STATE.audit.unshift({
    id: `rt_${Date.now()}`,
    timestamp: pending.at,
    action: pending.newScore !== null ? 'score_override' : 'label_override',
    actor: { id: user?.id || 'u0', name: user?.name || 'User', role: STATE.role },
    productId: product.id, productTitle: product.title,
    retailerId, retailerName: product.retailers.find(r => r.id === retailerId)?.name,
    attributeId: attr.id, attributeName: attr.name,
    previousLabel: pending.oldLabel, newLabel: pending.newLabel,
    previousScore: pending.oldScore, newScore: pending.newScore,
    reason: pending.reason || null,
    propagationTriggered: true, scheduledRecompute: STATE.config.schedule?.nextRun,
  });
  delete STATE.pendingUndo[key];
}

function undoOverride(key, product, retailerId, attr, attrSection, panelRef) {
  const pending = STATE.pendingUndo[key];
  if (!pending) return;
  clearTimeout(pending.timerHandle);
  if (!pending.oldScore && pending.oldLabel === (attr.displayLabel || scoreToLabel(attr.systemScore))) {
    delete STATE.overrides[key];
  } else if (STATE.overrides[key]) {
    STATE.overrides[key] = { ...STATE.overrides[key], label: pending.oldLabel, score: pending.oldScore };
  } else {
    delete STATE.overrides[key];
  }
  delete STATE.pendingUndo[key];
  refreshAttrSection(attrSection, product, retailerId, panelRef);
  showToast('Update undone', 'info');
}

function refreshAttrSection(attrSection, product, retailerId, panelRef) {
  renderAttrTableBody(attrSection, product, retailerId, panelRef);
}

// ── Undo Countdown ────────────────────────────────────────────────
function renderUndoCountdown(cell, key, product, retailerId, attr, panelRef) {
  const pending = STATE.pendingUndo[key];
  if (!pending) return;
  const secs = STATE.config.countdownTimer?.durationSeconds ?? 10;
  let remaining = secs;

  const btn = document.createElement('button');
  btn.className = 'btn-undo';
  btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 9l4-4-4-4M7 5H3a9 9 0 100 14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Undo`;

  const timer = document.createElement('span');
  timer.className = 'undo-timer';
  timer.textContent = `${remaining}s`;

  cell.appendChild(btn);
  cell.appendChild(timer);

  const section = cell.closest('.attr-table-section');
  btn.addEventListener('click', () => {
    if (section) undoOverride(key, product, retailerId, attr, section, panelRef);
  });

  const interval = setInterval(() => {
    remaining--;
    timer.textContent = `${remaining}s`;
    if (remaining <= 0) clearInterval(interval);
  }, 1000);
}

// ── Recent Override Activity (embedded) ──────────────────────────
function buildEmbeddedAuditTrail(product) {
  const div = document.createElement('div');
  div.className = 'recent-overrides';

  const now = Date.now();
  const window24h = 24 * 60 * 60 * 1000;
  const entries = STATE.audit
    .filter(e => e.productId === product.id && (now - new Date(e.timestamp).getTime()) <= window24h)
    .slice(0, 10);

  const dotColor = { label_override: '#108EE9', score_override: '#00BD70', config_change: '#FFDE4C', user_invited: '#9CA8C5' };

  const header = document.createElement('div');
  header.className = 'recent-overrides__header';
  header.innerHTML = `
    <span class="recent-overrides__title">Recent Override Activity</span>
    <span class="recent-overrides__meta">${entries.length} in the last 24 h</span>`;
  div.appendChild(header);

  const rowsEl = document.createElement('div');
  rowsEl.className = 'recent-overrides__rows';

  if (!entries.length) {
    rowsEl.innerHTML = '<div class="recent-overrides__empty">No overrides recorded for this product in the last 24 hours.</div>';
  } else {
    entries.forEach(e => {
      const changeText = e.previousLabel && e.newLabel
        ? `${e.previousLabel} → ${e.newLabel}`
        : (e.previousScore != null && e.newScore != null ? `${e.previousScore} → ${e.newScore}` : '');
      const color = dotColor[e.action] || '#9CA8C5';
      const row = document.createElement('div');
      row.className = 'recent-override-row';
      row.innerHTML = `
        <div class="recent-override-row__dot" style="background:${color}"></div>
        <div class="recent-override-row__body">
          <div class="recent-override-row__top">
            <span class="recent-override-row__attr">${e.attributeName || e.action}</span>
            ${changeText ? `<span class="recent-override-row__change">${changeText}</span>` : ''}
          </div>
          <div class="recent-override-row__meta">
            <span>${e.actor.name}</span>
            ${e.retailerName ? `<span>${e.retailerName}</span>` : ''}
            <span>${formatDateTime(e.timestamp)}</span>
          </div>
        </div>`;
      rowsEl.appendChild(row);
    });
  }
  div.appendChild(rowsEl);

  const footer = document.createElement('div');
  footer.className = 'recent-overrides__footer';
  footer.innerHTML = `
    <button class="recent-overrides__cta" id="viewAllOverridesBtn">
      View all overrides for this product
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <span class="recent-overrides__window">SKU: ${product.sku}</span>`;
  div.appendChild(footer);

  footer.querySelector('#viewAllOverridesBtn').addEventListener('click', () => {
    STATE.selectedAuditProduct = { id: product.id, sku: product.sku, title: product.title };
    navigate('audit');
  });

  return div;
}

// ════════════════════════════════════════════════════════════════
//  SCREEN: Audit Trail
// ════════════════════════════════════════════════════════════════
function renderAuditScreen(container) {
  if (STATE.role !== 'Admin') {
    container.innerHTML = `<div class="access-denied"><h2>Access Restricted</h2><p>Audit trail is available to Admins only.</p></div>`;
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'audit-screen-layout';

  // Unique actors and retailers from audit data
  const actors    = [...new Set(STATE.audit.map(e => e.actor.name))].sort();
  const retailers = [...new Set(STATE.audit.map(e => e.retailerName).filter(Boolean))].sort();

  // --- Sidebar ---
  const sidebar = document.createElement('aside');
  sidebar.className = 'audit-sidebar';
  const preProduct = STATE.selectedAuditProduct;
  STATE.selectedAuditProduct = null; // consume after reading

  sidebar.innerHTML = `
    <div class="audit-sidebar__header">
      <div class="audit-sidebar__title">Filters</div>
    </div>
    <div class="audit-sidebar__body">
      <div class="audit-filter-group">
        <label class="audit-filter-label">Product / SKU</label>
        <input type="text" class="audit-product-input" id="auditProductFilter"
          placeholder="Search by product or SKU…"
          value="${preProduct ? preProduct.title : ''}" />
      </div>
      <div class="audit-filter-group">
        <label class="audit-filter-label">User</label>
        <select class="audit-filter-select" id="auditUserFilter">
          <option value="">All users</option>
          ${actors.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="audit-filter-group">
        <label class="audit-filter-label">Retailer</label>
        <select class="audit-filter-select" id="auditRetailerFilter">
          <option value="">All retailers</option>
          ${retailers.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>
      <div class="audit-filter-group">
        <label class="audit-filter-label">Date from</label>
        <input type="date" class="audit-filter-input" id="auditDateFrom" />
      </div>
      <div class="audit-filter-group">
        <label class="audit-filter-label">Date to</label>
        <input type="date" class="audit-filter-input" id="auditDateTo" />
      </div>
      <button class="audit-filter-clear" id="auditClearFilters">Clear filters</button>
    </div>`;

  // --- Main area ---
  const mainArea = document.createElement('div');
  mainArea.className = 'audit-main';
  mainArea.innerHTML = `
    <div class="audit-main-header">
      <div>
        <h2>Audit Trail</h2>
        <p>Complete history of content overrides and system events</p>
      </div>
      <div class="audit-search-box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9CA8C5" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="#9CA8C5" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="text" placeholder="Search audit log…" id="auditSearch" />
      </div>
    </div>
    <div class="audit-log" id="auditLog"></div>`;

  layout.appendChild(sidebar);
  layout.appendChild(mainArea);
  container.appendChild(layout);

  const logEl          = mainArea.querySelector('#auditLog');
  const searchEl       = mainArea.querySelector('#auditSearch');
  const productFilterEl= sidebar.querySelector('#auditProductFilter');
  const userFilterEl   = sidebar.querySelector('#auditUserFilter');
  const retailerEl     = sidebar.querySelector('#auditRetailerFilter');
  const dateFromEl     = sidebar.querySelector('#auditDateFrom');
  const dateToEl       = sidebar.querySelector('#auditDateTo');
  const clearBtn       = sidebar.querySelector('#auditClearFilters');

  function render() {
    const q        = searchEl.value.toLowerCase();
    const prodF    = productFilterEl.value.toLowerCase();
    const userF    = userFilterEl.value;
    const retailF  = retailerEl.value;
    const fromF    = dateFromEl.value ? new Date(dateFromEl.value) : null;
    const toF      = dateToEl.value   ? new Date(dateToEl.value + 'T23:59:59') : null;

    const filtered = STATE.audit.filter(e => {
      if (prodF && !(
        (e.productTitle || '').toLowerCase().includes(prodF) ||
        (e.productId    || '').toLowerCase().includes(prodF)
      )) return false;
      if (userF   && e.actor.name     !== userF)   return false;
      if (retailF && e.retailerName   !== retailF)  return false;
      if (fromF) { const ts = new Date(e.timestamp); if (ts < fromF) return false; }
      if (toF)   { const ts = new Date(e.timestamp); if (ts > toF)   return false; }
      if (q && !(
        (e.productTitle  || '').toLowerCase().includes(q) ||
        (e.actor.name    || '').toLowerCase().includes(q) ||
        (e.attributeName || '').toLowerCase().includes(q) ||
        (e.retailerName  || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });

    logEl.innerHTML = '';
    if (!filtered.length) { logEl.innerHTML = '<div class="empty-state">No audit entries match.</div>'; return; }
    filtered.forEach(e => logEl.appendChild(buildAuditRow(e)));
  }

  searchEl.addEventListener('input', render);
  productFilterEl.addEventListener('input', render);
  userFilterEl.addEventListener('change', render);
  retailerEl.addEventListener('change', render);
  dateFromEl.addEventListener('change', render);
  dateToEl.addEventListener('change', render);

  clearBtn.addEventListener('click', () => {
    searchEl.value = '';
    productFilterEl.value = '';
    userFilterEl.value = '';
    retailerEl.value = '';
    dateFromEl.value = '';
    dateToEl.value = '';
    render();
  });

  render();
}

function buildAuditRow(entry) {
  const row = document.createElement('div');
  row.className = 'audit-row' + (entry.productId ? ' audit-row--clickable' : '');

  const labels = { label_override: 'Label Override', score_override: 'Score Override', config_change: 'Config Change', user_invited: 'User Invited' };

  const changeDesc = entry.productTitle
    ? `<strong>${entry.productTitle}</strong>${entry.retailerName ? ` @ ${entry.retailerName}` : ''}${entry.attributeName ? ` — ${entry.attributeName}` : ''}`
    : (entry.reason || '—');

  const labelChange = (entry.previousLabel && entry.newLabel)
    ? `<span class="audit-label-change"><span class="status-pill status-pill--${labelClass(entry.previousLabel)}">${entry.previousLabel}</span> → <span class="status-pill status-pill--${labelClass(entry.newLabel)}">${entry.newLabel}</span></span>` : '';

  const scoreChange = (entry.previousScore != null && entry.newScore != null)
    ? `<span class="audit-score-change">${entry.previousScore} → ${entry.newScore}</span>` : '';

  row.innerHTML = `
    <div class="audit-row__type-dot audit-row__type-dot--${entry.action}"></div>
    <div class="audit-row__body">
      <div class="audit-row__top">
        <span class="audit-action-badge audit-action-badge--${entry.action}">${labels[entry.action] || entry.action}</span>
        <span class="audit-row__actor">${entry.actor.name}</span>
        <span class="role-badge role-badge--${entry.actor.role}">${entry.actor.role}</span>
        <span class="audit-row__time">${formatDateTime(entry.timestamp)}</span>
      </div>
      <div class="audit-row__desc">${changeDesc}</div>
      <div class="audit-row__changes">${labelChange}${scoreChange}</div>
      ${entry.reason ? `<div class="audit-row__reason">"${entry.reason}"</div>` : ''}
      ${entry.propagationTriggered ? `<div class="audit-row__propagation">↪ Score recompute scheduled: ${entry.scheduledRecompute ? formatDateTime(entry.scheduledRecompute) : 'next run'}</div>` : ''}
    </div>`;

  if (entry.productId) {
    row.addEventListener('click', () => {
      STATE.selectedProduct  = entry.productId;
      STATE.selectedRetailer = entry.retailerId;
      navigate('products');
    });
  }
  return row;
}

// ════════════════════════════════════════════════════════════════
//  SCREEN: Settings — Users
// ════════════════════════════════════════════════════════════════
function renderSettingsUsers(container) {
  const tpl = document.getElementById('tpl-settings-users');
  container.appendChild(tpl.content.cloneNode(true));

  const totalCount  = STATE.users.length;
  const activeCount = STATE.users.filter(u => u.status !== 'pending').length;
  const pendingCount = STATE.users.filter(u => u.status === 'pending').length;

  // Inject stat row into the first settings-card (team members card)
  const firstCard = container.querySelector('.settings-card');
  if (firstCard) {
    const statRow = document.createElement('div');
    statRow.className = 'user-stat-row';
    statRow.innerHTML = `
      <div class="user-stat-tile">
        <span class="user-stat-tile__value">${totalCount}</span>
        <span class="user-stat-tile__label">Total Members</span>
        <span class="user-stat-tile__sub">across all roles</span>
      </div>
      <div class="user-stat-tile">
        <span class="user-stat-tile__value user-stat-tile__value--green">${activeCount}</span>
        <span class="user-stat-tile__label">Active</span>
        <span class="user-stat-tile__sub">logged in recently</span>
      </div>
      <div class="user-stat-tile">
        <span class="user-stat-tile__value${pendingCount > 0 ? ' user-stat-tile__value--amber' : ''}">${pendingCount}</span>
        <span class="user-stat-tile__label">Invite Pending</span>
        <span class="user-stat-tile__sub">awaiting acceptance</span>
      </div>`;
    firstCard.insertBefore(statRow, firstCard.querySelector('.settings-card__header').nextSibling);
  }

  const tbody = container.querySelector('#usersTableBody');
  container.querySelector('#userCount').textContent = `${totalCount} members`;

  const isAdmin = STATE.role === 'Admin';

  STATE.users.forEach(user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="user-cell">
        <div class="user-avatar">${user.avatar}</div>
        <div><div class="user-name">${user.name}</div><div class="user-email">${user.email}</div></div>
      </div></td>
      <td><span class="role-badge role-badge--${user.role}">${user.role}</span></td>
      <td><span class="user-status user-status--${user.status === 'pending' ? 'pending' : 'active'}">${user.status === 'pending' ? 'Invite Pending' : 'Active'}</span></td>
      <td style="font-size:12px;color:#9CA8C5">${user.lastActive ? timeAgo(user.lastActive) : '—'}</td>
      <td>${isAdmin && user.role !== 'Admin' ? `
        <select class="role-select" data-user-id="${user.id}">
          <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
          <option value="Editor" ${user.role === 'Editor' ? 'selected' : ''}>Editor</option>
          <option value="Viewer" ${user.role === 'Viewer' ? 'selected' : ''}>Viewer</option>
        </select>` : `<span class="user-actions__self">${user.role === 'Admin' ? 'Owner' : '—'}</span>`}</td>`;
    tbody.appendChild(tr);
  });

  container.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const user = STATE.users.find(u => u.id === sel.dataset.userId);
      if (user) { user.role = sel.value; showToast(`${user.name} → ${sel.value}`, 'success'); }
    });
  });

  // Role permissions info button
  const roleInfoBtn = container.querySelector('#roleInfoBtn');
  if (roleInfoBtn) {
    roleInfoBtn.addEventListener('click', () => {
      showModal('Role Permissions', `
        <div class="role-perms-grid">
          ${[
            { role: 'Admin', perms: [
              { label: 'View products & scores', yes: true },
              { label: 'Override labels',         yes: true },
              { label: 'Override scores',         yes: true },
              { label: 'View audit trail',        yes: true },
              { label: 'Manage users',            yes: true },
              { label: 'Score configuration',     yes: true },
            ]},
            { role: 'Editor', perms: [
              { label: 'View products & scores', yes: true },
              { label: 'Override labels',         yes: true },
              { label: 'Override scores',         yes: false },
              { label: 'View audit trail',        yes: true },
              { label: 'Manage users',            yes: false },
              { label: 'Score configuration',     yes: false },
            ]},
            { role: 'Viewer', perms: [
              { label: 'View products & scores', yes: true },
              { label: 'Override labels',         yes: false },
              { label: 'Override scores',         yes: false },
              { label: 'View audit trail',        yes: false },
              { label: 'Manage users',            yes: false },
              { label: 'Score configuration',     yes: false },
            ]},
          ].map(({ role, perms }) => `
            <div class="role-perms-col">
              <div class="role-badge role-badge--${role}">${role}</div>
              <ul class="perm-list">
                ${perms.map(p => `<li class="perm perm--${p.yes ? 'yes' : 'no'}">${p.label}</li>`).join('')}
              </ul>
            </div>`).join('')}
        </div>`, () => true);
      // Hide the Cancel/Confirm footer for info-only modal
      requestAnimationFrame(() => {
        const footer = document.querySelector('#modalBox .modal__footer');
        if (footer) footer.style.display = 'none';
      });
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  SCREEN: Settings — Score Config
// ════════════════════════════════════════════════════════════════
function renderSettingsConfig(container) {
  if (STATE.role !== 'Admin') {
    container.innerHTML = `<div class="access-denied"><h2>Access Restricted</h2><p>Score configuration is Admins only.</p></div>`;
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  layout.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Score Configuration</h1>
        <p class="page-subtitle">Define override mode and score threshold mapping</p>
      </div>
    </div>

    <!-- Override Mode -->
    <div class="settings-card">
      <div class="settings-card__header">
        <h3>Override Mode</h3>
        <span class="settings-card__hint">Controls what editors can change per attribute</span>
      </div>
      <div class="settings-card-grid">
        <div class="settings-col-left">
          <div class="override-mode-toggle" id="overrideModeToggle">
            <label class="mode-option">
              <input type="radio" name="overrideMode" value="label" />
              <div class="mode-option__body">
                <strong>Label-based</strong>
                <p>Editors assign Correct / Incorrect labels. System scores remain unchanged.</p>
              </div>
            </label>
            <label class="mode-option">
              <input type="radio" name="overrideMode" value="score" />
              <div class="mode-option__body">
                <strong>Score-based</strong>
                <p>Editors directly set the confidence score (0–100). Label derived automatically from thresholds.</p>
              </div>
            </label>
          </div>
        </div>
        <div class="settings-col-right">
          <div class="settings-col-right__title">When to use each mode</div>
          <div class="config-zone-preview">
            <div class="config-zone-item" id="modeGuideLabel">
              <div class="config-zone-swatch" style="background:#108EE9"></div>
              <div class="config-zone-text">
                <strong>Label-based</strong>
                <p>Editors assign Correct / Incorrect labels directly. System confidence scores stay unchanged — the label is the only thing that moves.</p>
              </div>
            </div>
            <div class="config-zone-item" id="modeGuideScore">
              <div class="config-zone-swatch" style="background:#7C3AED"></div>
              <div class="config-zone-text">
                <strong>Score-based</strong>
                <p>Editors set a precise confidence score (0–100). The label is derived automatically from the threshold ranges configured below.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Thresholds -->
    <div class="settings-card">
      <div class="settings-card__header">
        <h3>Score → Label Thresholds</h3>
        <span class="settings-card__hint">Changes trigger full score re-propagation on next scheduled run</span>
      </div>
      <div class="settings-card-grid">
        <div class="settings-col-left">
          <div class="threshold-config" id="thresholdConfig">
            <div class="threshold-visual" id="thresholdVisual"></div>
            <div class="threshold-row">
              <div class="threshold-pill threshold-pill--correct">Correct</div>
              <div class="threshold-range">
                <label>Min score</label>
                <input type="number" id="correctMin" min="0" max="100" class="threshold-input" />
                <span>— 100</span>
              </div>
            </div>
            <div class="threshold-row threshold-row--derived">
              <div class="threshold-pill threshold-pill--incorrect">Incorrect</div>
              <div class="threshold-range threshold-range--derived">
                <span id="incorrectRangeDerived">0 — 79 (derived)</span>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-col-right">
          <div class="settings-col-right__title">Zone definitions</div>
          <div class="config-zone-preview">
            <div class="config-zone-item">
              <div class="config-zone-swatch config-zone-swatch--correct"></div>
              <div class="config-zone-text">
                <strong>Correct</strong>
                <p>Content closely matches the brand reference. No action required.</p>
              </div>
            </div>
            <div class="config-zone-item">
              <div class="config-zone-swatch config-zone-swatch--incorrect"></div>
              <div class="config-zone-text">
                <strong>Incorrect</strong>
                <p>Significant mismatch vs brand reference. Override or re-crawl required.</p>
              </div>
            </div>
          </div>
          <div class="config-impact-note">
            Threshold changes apply at the next scheduled recompute. Use <strong>Force Refresh</strong> on the Schedule page to apply immediately.
          </div>
        </div>
      </div>
      <div class="settings-card__footer">
        <button class="btn btn--primary" id="saveThresholdsBtn">Save Thresholds</button>
      </div>
    </div>

    <!-- Override Eligibility Window -->
    <div class="settings-card" id="eligibilityCard">
      <div class="settings-card__header">
        <h3>Override Eligibility Window</h3>
        <span class="settings-card__hint">Optional — restrict when the override action is shown to editors</span>
      </div>
      <div class="settings-card-grid">
        <div class="settings-col-left">
          <div class="eligibility-toggle-row">
            <label class="toggle-switch">
              <input type="checkbox" id="eligibilityEnabled" />
              <span class="toggle-switch__track"><span class="toggle-switch__thumb"></span></span>
            </label>
            <span class="toggle-switch__label">Enable eligibility window</span>
          </div>
          <div class="eligibility-range-config" id="eligibilityRangeConfig">
            <p class="eligibility-help-text">Show the Override button only when score is <strong>outside</strong> this range</p>
            <div class="eligibility-range-inputs">
              <div class="eligibility-range-field">
                <label class="eligibility-range-label">Show when score is below</label>
                <input type="number" id="eligibilityBelow" min="0" max="100" class="threshold-input" />
              </div>
              <div class="eligibility-range-sep">or above</div>
              <div class="eligibility-range-field">
                <label class="eligibility-range-label">Show when score is above</label>
                <input type="number" id="eligibilityAbove" min="0" max="100" class="threshold-input" />
              </div>
            </div>
            <div class="eligibility-preview" id="eligibilityPreview"></div>
          </div>
        </div>
        <div class="settings-col-right">
          <div class="settings-col-right__title">How it works</div>
          <p style="font-size:12px;color:#64748B;line-height:1.6;margin:0 0 12px">When enabled, the <strong>Override</strong> button is hidden for any attribute whose score falls inside the defined normal band. This focuses editors only on out-of-range content and reduces unnecessary overrides on scores that are already healthy.</p>
          <div class="config-zone-preview">
            <div class="config-zone-item">
              <div class="config-zone-swatch" style="background:#FF545D"></div>
              <div class="config-zone-text"><strong>Score below lower bound</strong><p>Override available — content likely needs correction.</p></div>
            </div>
            <div class="config-zone-item">
              <div class="config-zone-swatch" style="background:#E8ECF4"></div>
              <div class="config-zone-text"><strong>Score within normal band</strong><p>Override hidden — score is within acceptable range, no action needed.</p></div>
            </div>
            <div class="config-zone-item">
              <div class="config-zone-swatch" style="background:#00BD70"></div>
              <div class="config-zone-text"><strong>Score above upper bound</strong><p>Override available — content is high-confidence and may warrant label confirmation.</p></div>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-card__footer">
        <button class="btn btn--primary" id="saveEligibilityBtn">Save</button>
      </div>
    </div>

    <!-- Undo Window -->
    <div class="settings-card">
      <div class="settings-card__header">
        <h3>Undo Window</h3>
        <span class="settings-card__hint">Seconds editors have to undo an override after submitting</span>
      </div>
      <div class="settings-card-grid">
        <div class="settings-col-left">
          <div class="countdown-config">
            <label class="countdown-config__label">Duration (seconds)</label>
            <input type="number" id="countdownDuration" min="5" max="60" class="threshold-input" />
          </div>
        </div>
        <div class="settings-col-right">
          <div class="settings-col-right__title">How this works</div>
          <p style="font-size:12px;color:#64748B;line-height:1.6;margin:0">After an override is submitted, editors have this many seconds to click <strong>Undo</strong> before the change is committed to the audit trail and score propagation is triggered. Minimum 5s, maximum 60s.</p>
        </div>
      </div>
      <div class="settings-card__footer">
        <button class="btn btn--primary" id="saveCountdownBtn">Save</button>
      </div>
    </div>`;

  container.appendChild(layout);

  // Mode radios — wire + make right column reactive
  const modeRightItems = {
    label: container.querySelector('#modeGuideLabel'),
    score: container.querySelector('#modeGuideScore'),
  };
  function setModeActive(mode) {
    ['label','score'].forEach(m => {
      const el = modeRightItems[m];
      if (el) el.classList.toggle('config-zone-item--active', m === mode);
    });
  }
  container.querySelectorAll('input[name="overrideMode"]').forEach(r => {
    r.checked = r.value === STATE.config.overrideMode;
    r.addEventListener('change', () => {
      STATE.config.overrideMode = r.value;
      setModeActive(r.value);
      showToast(`Override mode set to ${r.value}-based`, 'info');
    });
  });
  setModeActive(STATE.config.overrideMode);

  // Thresholds
  const correctMinEl = container.querySelector('#correctMin');
  const incorrectRangeEl = container.querySelector('#incorrectRangeDerived');
  correctMinEl.value = STATE.config.scoreThresholds.correct_min;

  function updateVisual() {
    const cMin = parseInt(correctMinEl.value) || 80;
    const vis = container.querySelector('#thresholdVisual');
    if (vis) {
      vis.innerHTML = `
        <div class="threshold-vis-incorrect" style="width:${cMin}%"></div>
        <div class="threshold-vis-correct"   style="width:${100 - cMin}%"></div>`;
    }
    if (incorrectRangeEl) incorrectRangeEl.textContent = `0 — ${cMin - 1} (derived)`;
  }
  updateVisual();
  correctMinEl.addEventListener('input', updateVisual);

  container.querySelector('#saveThresholdsBtn').addEventListener('click', () => {
    STATE.config.scoreThresholds.correct_min = parseInt(correctMinEl.value);
    showToast('Thresholds saved', 'success');
  });

  // Eligibility card
  const eligEl       = STATE.config.overrideEligibility || {};
  const eligToggle   = container.querySelector('#eligibilityEnabled');
  const eligRange    = container.querySelector('#eligibilityRangeConfig');
  const eligBelow    = container.querySelector('#eligibilityBelow');
  const eligAbove    = container.querySelector('#eligibilityAbove');
  const eligPreview  = container.querySelector('#eligibilityPreview');

  eligToggle.checked  = !!eligEl.enabled;
  eligBelow.value     = eligEl.eligibleBelowScore ?? 60;
  eligAbove.value     = eligEl.eligibleAboveScore ?? 80;
  eligRange.style.display = eligEl.enabled ? 'block' : 'none';

  function updateEligPreview() {
    const lo = parseInt(eligBelow.value) || 60;
    const hi = parseInt(eligAbove.value) || 80;
    eligPreview.innerHTML = `
      <div class="eligibility-preview-row eligibility-preview-row--show">
        <span class="eligibility-dot eligibility-dot--show"></span>Score &lt; ${lo} — <strong>Override shown</strong>
      </div>
      <div class="eligibility-preview-row eligibility-preview-row--hide">
        <span class="eligibility-dot eligibility-dot--hide"></span>Score ${lo}–${hi} — <strong>Override hidden</strong> (normal range)
      </div>
      <div class="eligibility-preview-row eligibility-preview-row--show">
        <span class="eligibility-dot eligibility-dot--show"></span>Score &gt; ${hi} — <strong>Override shown</strong>
      </div>`;
  }
  if (eligEl.enabled) updateEligPreview();

  eligToggle.addEventListener('change', () => {
    eligRange.style.display = eligToggle.checked ? 'block' : 'none';
    if (eligToggle.checked) updateEligPreview();
  });
  eligBelow.addEventListener('input', updateEligPreview);
  eligAbove.addEventListener('input', updateEligPreview);

  container.querySelector('#saveEligibilityBtn').addEventListener('click', () => {
    if (!STATE.config.overrideEligibility) STATE.config.overrideEligibility = {};
    STATE.config.overrideEligibility.enabled           = eligToggle.checked;
    STATE.config.overrideEligibility.eligibleBelowScore = parseInt(eligBelow.value);
    STATE.config.overrideEligibility.eligibleAboveScore = parseInt(eligAbove.value);
    showToast('Override eligibility window saved', 'success');
  });

  // Undo window
  const cdEl = container.querySelector('#countdownDuration');
  cdEl.value = STATE.config.countdownTimer?.durationSeconds ?? 10;
  container.querySelector('#saveCountdownBtn').addEventListener('click', () => {
    STATE.config.countdownTimer.durationSeconds = parseInt(cdEl.value);
    showToast('Undo window updated', 'success');
  });
}

// ════════════════════════════════════════════════════════════════
//  SCREEN: Settings — Schedule
// ════════════════════════════════════════════════════════════════
function renderSettingsSchedule(container) {
  if (STATE.role !== 'Admin') {
    container.innerHTML = `<div class="access-denied"><h2>Access Restricted</h2><p>Schedule configuration is Admins only.</p></div>`;
    return;
  }
  const sched = STATE.config.schedule;

  // Synthetic run history (last 5 runs)
  const runHistory = [
    { status: 'success', time: sched.lastRun,                              dur: `${sched.runDurationMinutes}m`, scope: '4 levels' },
    { status: 'success', time: new Date(new Date(sched.lastRun).getTime() - 86400000).toISOString(), dur: '12m', scope: '4 levels' },
    { status: 'warning', time: new Date(new Date(sched.lastRun).getTime() - 172800000).toISOString(), dur: '18m', scope: '4 levels' },
    { status: 'success', time: new Date(new Date(sched.lastRun).getTime() - 259200000).toISOString(), dur: '11m', scope: '4 levels' },
    { status: 'success', time: new Date(new Date(sched.lastRun).getTime() - 345600000).toISOString(), dur: '13m', scope: '4 levels' },
  ];
  const runHistoryHtml = runHistory.map(r => `
    <div class="run-item">
      <div class="run-item__dot run-item__dot--${r.status}"></div>
      <span class="run-item__time">${formatDateTime(r.time)}</span>
      <span class="run-item__dur">${r.dur}</span>
    </div>`).join('');

  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  layout.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Score Recompute Schedule</h1>
        <p class="page-subtitle">Configure when propagated scores are recalculated</p>
      </div>
    </div>

    <!-- Status card -->
    <div class="settings-card">
      <div class="settings-card__header"><h3>Schedule Status</h3></div>
      <div class="settings-card-grid">
        <div class="settings-col-left">
          <div class="schedule-status" style="padding:4px 0">
            <div class="schedule-status__badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#00BD70" opacity="0.2"/><path d="M8 12l3 3 5-5" stroke="#00BD70" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Healthy
            </div>
            <div class="schedule-status__meta">
              <div class="schedule-meta-row"><span class="schedule-meta-row__label">Last run:</span><span class="schedule-meta-row__value">${formatDateTime(sched.lastRun)}</span></div>
              <div class="schedule-meta-row"><span class="schedule-meta-row__label">Next run:</span><span class="schedule-meta-row__value">${formatDateTime(sched.nextRun)}</span></div>
              <div class="schedule-meta-row"><span class="schedule-meta-row__label">Duration:</span><span class="schedule-meta-row__value">${sched.runDurationMinutes} min</span></div>
            </div>
          </div>
        </div>
        <div class="settings-col-right">
          <div class="settings-col-right__title">Recent run history</div>
          <div class="schedule-run-history">${runHistoryHtml}</div>
        </div>
      </div>
    </div>

    <!-- Cron Expression -->
    <div class="settings-card">
      <div class="settings-card__header">
        <h3>Cron Expression</h3>
        <span class="settings-card__hint">Standard Unix cron format (UTC)</span>
      </div>
      <div class="settings-card-grid">
        <div class="settings-col-left">
          <div class="cron-config">
            <div class="cron-input-wrap">
              <input type="text" id="cronExpression" class="cron-input" placeholder="0 2 * * *" />
              <div class="cron-human-readable" id="cronHumanReadable">Every day at 2:00 AM UTC</div>
            </div>
            <div class="cron-presets">
              <span>Presets:</span>
              <button class="cron-preset" data-cron="0 2 * * *">Daily 2AM</button>
              <button class="cron-preset" data-cron="0 2 * * 0">Weekly Sun</button>
              <button class="cron-preset" data-cron="0 2 1 * *">Monthly 1st</button>
            </div>
          </div>
        </div>
        <div class="settings-col-right">
          <div class="settings-col-right__title">Propagation scope</div>
          <div class="propagation-levels" style="display:flex;flex-direction:column;gap:10px">
            <label class="prop-level"><input type="checkbox" checked disabled /> Attribute scores <span class="prop-level__note">Source — always recomputed</span></label>
            <label class="prop-level"><input type="checkbox" id="propProduct" checked /> Product-level aggregate</label>
            <label class="prop-level"><input type="checkbox" id="propRetailer" checked /> Retailer-level aggregate</label>
            <label class="prop-level"><input type="checkbox" id="propBrand" checked /> Brand-level aggregate</label>
          </div>
        </div>
      </div>
      <div class="settings-card__footer">
        <button class="btn btn--secondary" id="runNowBtn">Force Refresh Now</button>
        <button class="btn btn--primary" id="saveCronBtn">Save Schedule</button>
      </div>
    </div>`;

  container.appendChild(layout);

  const cronInput = container.querySelector('#cronExpression');
  const cronHuman = container.querySelector('#cronHumanReadable');
  cronInput.value = sched.cronExpression;
  cronHuman.textContent = sched.humanReadable;

  container.querySelectorAll('.cron-preset').forEach(btn => {
    btn.addEventListener('click', () => { cronInput.value = btn.dataset.cron; cronHuman.textContent = cronToHuman(btn.dataset.cron); });
  });
  cronInput.addEventListener('input', () => { cronHuman.textContent = cronToHuman(cronInput.value); });
  container.querySelector('#saveCronBtn').addEventListener('click', () => {
    STATE.config.schedule.cronExpression = cronInput.value;
    STATE.config.schedule.humanReadable  = cronToHuman(cronInput.value);
    showToast('Schedule updated', 'success');
  });
  container.querySelector('#runNowBtn').addEventListener('click', () => showToast('Manual recompute triggered — running in background', 'info'));
}

// ════════════════════════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════════════════════════
function showModal(title, bodyHtml, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalBackdrop').classList.remove('hidden');

  const confirmBtn = document.getElementById('modalConfirm');
  const close = () => document.getElementById('modalBackdrop').classList.add('hidden');
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener('click', () => { if (onConfirm() !== false) close(); });
  document.getElementById('modalCancel').onclick = close;
  document.getElementById('modalClose').onclick  = close;
  document.getElementById('modalBackdrop').onclick = e => { if (e.target === document.getElementById('modalBackdrop')) close(); };
}

// ════════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__icon">${{success:'✓', error:'✕', info:'ℹ'}[type] || '•'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => { toast.classList.remove('toast--visible'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ════════════════════════════════════════════════════════════════
//  SYNTHETIC ATTRIBUTE DATA (for products without real data)
// ════════════════════════════════════════════════════════════════
function generateSyntheticAttrs(product) {
  const names = ['Image', 'Secondary Image Match', 'Bullets', 'Title', 'Description', 'Video', 'Enhanced Content', 'NFT Presence'];
  const scores = [87, null, 91, 94, 38, null, null, null];
  const labels = ['Correct', null, 'Correct', 'Correct', 'Incorrect', null, null, null];
  const systems = ['Product image file', '--', 'Pack of 24, Contains 1 bar', product.title, 'Short 3-line description', 'No', '--', 'Yes'];

  // Vary slightly per product
  const offset = (product.brandScore - 80);

  return names.map((name, i) => ({
    id: `a_${i + 1}`,
    name,
    systemValue: systems[i],
    systemScore: scores[i] != null ? Math.min(100, Math.max(20, scores[i] + offset + Math.round(Math.random() * 6 - 3))) : null,
    displayLabel: labels[i] || (scores[i] != null ? (scores[i] + offset >= 80 ? 'Correct' : 'Incorrect') : '--'),
    attributeType: name.toLowerCase(),
  }));
}

// ════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════
function scoreToLabel(score) {
  const s = parseInt(score);
  if (isNaN(s)) return 'Incorrect';
  const t = STATE.config.scoreThresholds || {};
  return s >= (t.correct_min ?? 80) ? 'Correct' : 'Incorrect';
}
function scoreToLabelClass(score) {
  return scoreToLabel(score) === 'Correct' ? 'correct' : 'incorrect';
}
function labelClass(label) {
  if (label === 'Correct') return 'correct';
  if (label === 'Incorrect') return 'incorrect';
  return 'review'; // covers 'Correct - Slightly Modified' and other override states
}
function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function cronToHuman(cron) {
  const m = { '0 2 * * *': 'Every day at 2:00 AM UTC', '0 2 * * 0': 'Every Sunday at 2:00 AM UTC', '0 2 1 * *': 'First of every month at 2:00 AM UTC', '*/30 * * * *': 'Every 30 minutes', '0 * * * *': 'Every hour' };
  return m[cron] || `Cron: ${cron}`;
}

boot();
