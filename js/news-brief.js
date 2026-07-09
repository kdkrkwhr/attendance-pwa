/**
 * News 탭 — 주식(국내·미국)·전체 뉴스 (data/news/YYYY-MM-DD.json, cron 07:00 갱신)
 */
const NEWS_MARKET_KEY = 'attendance-news-market';
const NEWS_CATEGORY_KEY = 'attendance-news-category';
const NEWS_PINS_KEY = 'attendance-news-pins';
const NEWS_PIN_MAX = 8;
let newsCache = null;
let newsMarket = localStorage.getItem(NEWS_MARKET_KEY) || 'kr';
let newsCategory = localStorage.getItem(NEWS_CATEGORY_KEY) || 'stock';
let newsSearchQuery = '';

async function loadTodayNews() {
  if (newsCache) return newsCache;
  newsCache = await loadDailyJson('news');
  return newsCache;
}

function activeNewsKey() {
  return newsCategory === 'all' ? 'all' : newsMarket;
}

function pickMarketData(data, key) {
  if (data?.markets?.[key]) return data.markets[key];
  // ponytail: legacy flat JSON → 전체 탭에만 표시
  if (key === 'all' && (data?.summary || data?.items?.length)) {
    return { summary: data.summary, items: data.items || [] };
  }
  return null;
}

function renderNewsDate() {
  const el = document.getElementById('newsTodayDate');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function loadNewsPins() {
  try {
    const raw = JSON.parse(localStorage.getItem(NEWS_PINS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveNewsPins(pins) {
  localStorage.setItem(NEWS_PINS_KEY, JSON.stringify(pins));
}

function getActiveNewsPins() {
  if (newsCategory !== 'stock') return [];
  const all = loadNewsPins();
  const list = all[newsMarket];
  return Array.isArray(list) ? list.map((s) => String(s).trim()).filter(Boolean) : [];
}

function addNewsPin(name) {
  const term = String(name || '').trim();
  if (!term || newsCategory !== 'stock') return;
  const pins = loadNewsPins();
  const list = getActiveNewsPins();
  if (list.some((p) => p.toLowerCase() === term.toLowerCase())) return;
  if (list.length >= NEWS_PIN_MAX) list.shift();
  list.push(term);
  pins[newsMarket] = list;
  saveNewsPins(pins);
}

function removeNewsPin(name) {
  const term = String(name || '').trim();
  if (!term) return;
  const pins = loadNewsPins();
  const list = getActiveNewsPins().filter((p) => p !== term);
  pins[newsMarket] = list;
  saveNewsPins(pins);
}

function articleMatchesPin(item, pin) {
  const hay = `${item?.title || ''} ${item?.description || ''}`.toLowerCase();
  return hay.includes(String(pin).toLowerCase());
}

function sortNewsByPins(items, pins) {
  if (!pins.length) return items;
  const pinned = [];
  const rest = [];
  items.forEach((it) => {
    if (pins.some((p) => articleMatchesPin(it, p))) pinned.push(it);
    else rest.push(it);
  });
  return [...pinned, ...rest];
}

function filterNewsBySearch(items, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const hay = `${it?.title || ''} ${it?.description || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderNewsPinBar() {
  const bar = document.getElementById('newsPinBar');
  if (!bar) return;
  const show = newsCategory === 'stock';
  bar.classList.toggle('hidden', !show);
  if (!show) return;

  const chipsEl = document.getElementById('newsPinChips');
  const pins = getActiveNewsPins();
  if (chipsEl) {
    chipsEl.innerHTML = pins.length
      ? pins.map((p) => {
          const safe = escapeHtml(p);
          return `<button type="button" class="news-pin-chip" data-pin="${safe}" aria-label="${safe} 핀 해제">📌 ${safe} ×</button>`;
        }).join('')
      : '<span class="news-pin-hint">종목명을 핀하면 관련 기사가 위로 올라와요</span>';
  }
}

function syncNewsCategoryToggle() {
  document.querySelectorAll('[data-category]').forEach((btn) => {
    const active = btn.dataset.category === newsCategory;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const stockToggle = document.getElementById('newsStockToggle');
  if (stockToggle) stockToggle.classList.toggle('hidden', newsCategory !== 'stock');
  renderNewsPinBar();
}

function syncNewsMarketToggle() {
  document.querySelectorAll('[data-market]').forEach((btn) => {
    const active = btn.dataset.market === newsMarket;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderNewsPinBar();
}

function renderNewsBrief(data) {
  const card = document.getElementById('newsBriefCard');
  const listCard = document.getElementById('newsListCard');
  const empty = document.getElementById('newsEmpty');
  const summaryEl = document.getElementById('newsBriefSummary');
  const metaEl = document.getElementById('newsBriefMeta');
  const listEl = document.getElementById('newsList');
  const listTitle = document.getElementById('newsListTitle');

  const key = activeNewsKey();
  const marketData = data ? pickMarketData(data, key) : null;

  if (listTitle) {
    const titles = { kr: '국내 주식 기사', us: '미국 주식 기사', all: '주요 뉴스' };
    listTitle.textContent = titles[key] || '뉴스';
  }

  if (!marketData?.summary && !(marketData?.items?.length)) {
    card?.classList.add('hidden');
    listCard?.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  card?.classList.remove('hidden');
  if (summaryEl) summaryEl.textContent = marketData.summary || '';

  const gen = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';
  if (metaEl) metaEl.textContent = gen ? `${gen} 갱신` : '';

  const pins = getActiveNewsPins();
  const sorted = sortNewsByPins(marketData.items || [], pins);
  const items = filterNewsBySearch(sorted, newsSearchQuery);
  if (!sorted.length || !listEl) {
    listCard?.classList.add('hidden');
    return;
  }

  listCard?.classList.remove('hidden');
  renderNewsPinBar();
  if (!items.length) {
    listEl.innerHTML = '<li class="news-item news-item-empty">검색 결과가 없어요</li>';
    return;
  }
  listEl.innerHTML = items.map((it) => {
    const title = escapeHtml(it.title || '제목 없음');
    const link = it.link ? escapeHtml(it.link) : '';
    const inner = link
      ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
    const matched = pins.find((p) => articleMatchesPin(it, p));
    const pinCls = matched ? ' news-item-pinned' : '';
    const pinTag = matched ? `<span class="news-pin-tag">📌 ${escapeHtml(matched)}</span>` : '';
    return `<li class="news-item${pinCls}">${pinTag}${inner}</li>`;
  }).join('');
}

function bindNewsToggles() {
  document.querySelectorAll('[data-category]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const next = btn.dataset.category;
      if (!next || next === newsCategory) return;
      newsCategory = next;
      localStorage.setItem(NEWS_CATEGORY_KEY, newsCategory);
      syncNewsCategoryToggle();
      const data = await loadTodayNews();
      renderNewsBrief(data);
    });
  });

  document.querySelectorAll('[data-market]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const next = btn.dataset.market;
      if (!next || next === newsMarket) return;
      newsMarket = next;
      localStorage.setItem(NEWS_MARKET_KEY, newsMarket);
      syncNewsMarketToggle();
      const data = await loadTodayNews();
      renderNewsBrief(data);
    });
  });
}

function bindNewsPinBar() {
  const form = document.getElementById('newsPinForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('newsPinInput');
      const name = input?.value;
      if (!name?.trim()) return;
      addNewsPin(name);
      if (input) input.value = '';
      const data = await loadTodayNews();
      renderNewsBrief(data);
    });
  }

  const chips = document.getElementById('newsPinChips');
  if (chips && !chips.dataset.bound) {
    chips.dataset.bound = '1';
    chips.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-pin]');
      if (!btn) return;
      removeNewsPin(btn.dataset.pin);
      const data = await loadTodayNews();
      renderNewsBrief(data);
    });
  }
}

function bindNewsSearch() {
  const input = document.getElementById('newsSearchInput');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('input', async () => {
    newsSearchQuery = input.value;
    const data = await loadTodayNews();
    renderNewsBrief(data);
  });
}

async function initNewsBrief() {
  renderNewsDate();
  bindNewsToggles();
  bindNewsPinBar();
  bindNewsSearch();
  syncNewsCategoryToggle();
  syncNewsMarketToggle();
  const data = await loadTodayNews();
  renderNewsBrief(data);
}
