/**
 * News 탭 — 주식(국내·미국)·전체 뉴스 (data/news/YYYY-MM-DD.json, cron 07:00 갱신)
 */
const NEWS_MARKET_KEY = 'attendance-news-market';
const NEWS_CATEGORY_KEY = 'attendance-news-category';
const NEWS_PINS_KEY = 'attendance-news-pins';
const NEWS_READ_KEY = 'attendance-news-read';
const NEWS_UNREAD_ONLY_KEY = 'attendance-news-unread-only';
const NEWS_PIN_MAX = 8;
let newsCache = null;
let newsMarket = localStorage.getItem(NEWS_MARKET_KEY) || 'kr';
let newsCategory = localStorage.getItem(NEWS_CATEGORY_KEY) || 'stock';
let newsSearchQuery = '';
let newsUnreadOnly = localStorage.getItem(NEWS_UNREAD_ONLY_KEY) === '1';

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

function extractPinKeyword(title) {
  const t = String(title || '').replace(/^\[[^\]]+\]\s*/, '').trim();
  const quoted = t.match(/^["「]([가-힣A-Za-z0-9]{2,12})/);
  if (quoted) return quoted[1];
  const lead = t.match(/^([가-힣A-Za-z0-9]{2,12})/);
  if (lead) return lead[1];
  const parts = t.split(/[\s,·…|]+/).filter(Boolean);
  return (parts[0] || '').slice(0, 12);
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

function filterNewsByUnread(items, readSet) {
  if (!newsUnreadOnly) return items;
  return items.filter((it) => !it.link || !readSet.has(it.link));
}

function countUnreadNews(items, readSet) {
  return items.filter((it) => it.link && !readSet.has(it.link)).length;
}

function countAllUnreadNews(data) {
  if (!data) return 0;
  const readSet = loadNewsReadSet();
  const seen = new Set();
  let unread = 0;
  for (const key of ['kr', 'us', 'all']) {
    const items = pickMarketData(data, key)?.items || [];
    for (const it of items) {
      if (!it.link || readSet.has(it.link) || seen.has(it.link)) continue;
      seen.add(it.link);
      unread += 1;
    }
  }
  return unread;
}

function syncNewsTabBadge(unread) {
  const badge = document.getElementById('newsTabBadge');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
    badge.setAttribute('aria-label', `미읽음 ${unread}건`);
    badge.removeAttribute('aria-hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
    badge.removeAttribute('aria-label');
    badge.setAttribute('aria-hidden', 'true');
  }
}

function syncNewsUnreadToggle() {
  const btn = document.getElementById('newsUnreadToggle');
  if (!btn) return;
  btn.classList.toggle('active', newsUnreadOnly);
  btn.setAttribute('aria-pressed', newsUnreadOnly ? 'true' : 'false');
}

function loadNewsReadSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(NEWS_READ_KEY) || '{}');
    const today = typeof todayKey === 'function' ? todayKey() : new Date().toISOString().slice(0, 10);
    if (raw.date !== today) return new Set();
    return new Set(Array.isArray(raw.links) ? raw.links : []);
  } catch {
    return new Set();
  }
}

function markNewsArticleRead(link) {
  const href = String(link || '').trim();
  if (!href) return;
  try {
    const today = typeof todayKey === 'function' ? todayKey() : new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(localStorage.getItem(NEWS_READ_KEY) || '{}');
    const links = raw.date === today && Array.isArray(raw.links) ? [...raw.links] : [];
    if (!links.includes(href)) links.push(href);
    localStorage.setItem(NEWS_READ_KEY, JSON.stringify({ date: today, links }));
  } catch (e) {}
}

function markAllNewsArticlesRead(links) {
  const hrefs = (links || []).map((l) => String(l || '').trim()).filter(Boolean);
  if (!hrefs.length) return;
  try {
    const today = typeof todayKey === 'function' ? todayKey() : new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(localStorage.getItem(NEWS_READ_KEY) || '{}');
    const set = new Set(raw.date === today && Array.isArray(raw.links) ? raw.links : []);
    hrefs.forEach((h) => set.add(h));
    localStorage.setItem(NEWS_READ_KEY, JSON.stringify({ date: today, links: [...set] }));
  } catch (e) {}
}

function syncNewsMarkAllBtn(unreadCount) {
  const btn = document.getElementById('newsMarkAllRead');
  if (!btn) return;
  const show = unreadCount > 0;
  btn.hidden = !show;
  btn.disabled = !show;
}

function renderNewsPinBar(items) {
  const bar = document.getElementById('newsPinBar');
  if (!bar) return;
  const show = newsCategory === 'stock';
  bar.classList.toggle('hidden', !show);
  if (!show) return;

  const chipsEl = document.getElementById('newsPinChips');
  const pins = getActiveNewsPins();
  const articles = items || (() => {
    const marketData = newsCache ? pickMarketData(newsCache, activeNewsKey()) : null;
    return marketData?.items || [];
  })();
  if (chipsEl) {
    chipsEl.innerHTML = pins.length
      ? pins.map((p) => {
          const count = articles.filter((it) => articleMatchesPin(it, p)).length;
          const countTag = count > 0 ? `<span class="news-pin-count">${count}</span>` : '';
          const safe = escapeHtml(p);
          return `<button type="button" class="news-pin-chip" data-pin="${safe}" aria-label="${safe} 핀 해제${count ? `, 기사 ${count}건` : ''}">📌 ${safe}${countTag} ×</button>`;
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

  syncNewsTabBadge(countAllUnreadNews(data));

  if (!marketData?.summary && !(marketData?.items?.length)) {
    card?.classList.add('hidden');
    listCard?.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  card?.classList.remove('hidden');
  if (summaryEl) summaryEl.textContent = marketData.summary || '';

  const pins = getActiveNewsPins();
  const readSet = loadNewsReadSet();
  const sorted = sortNewsByPins(marketData.items || [], pins);
  const searched = filterNewsBySearch(sorted, newsSearchQuery);
  const items = filterNewsByUnread(searched, readSet);
  const unread = countUnreadNews(searched, readSet);
  syncNewsMarkAllBtn(unread);

  const gen = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const metaParts = [];
  if (unread > 0) metaParts.push(`미읽음 ${unread}`);
  if (gen) metaParts.push(`${gen} 갱신`);
  if (metaEl) metaEl.textContent = metaParts.join(' · ');
  if (!sorted.length || !listEl) {
    listCard?.classList.add('hidden');
    return;
  }

  listCard?.classList.remove('hidden');
  renderNewsPinBar(sorted);
  if (!items.length) {
    const emptyMsg = newsUnreadOnly ? '미읽은 기사가 없어요' : '검색 결과가 없어요';
    listEl.innerHTML = `<li class="news-item news-item-empty">${emptyMsg}</li>`;
    return;
  }
  const showQuickPin = newsCategory === 'stock';
  listEl.innerHTML = items.map((it) => {
    const title = escapeHtml(it.title || '제목 없음');
    const link = it.link ? escapeHtml(it.link) : '';
    const inner = link
      ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
    const matched = pins.find((p) => articleMatchesPin(it, p));
    const pinCls = matched ? ' news-item-pinned' : '';
    const readCls = it.link && readSet.has(it.link) ? ' news-item-read' : '';
    const pinTag = matched ? `<span class="news-pin-tag">📌 ${escapeHtml(matched)}</span>` : '';
    const kw = extractPinKeyword(it.title);
    const quickPin = showQuickPin && kw
      ? `<button type="button" class="news-item-pin-btn" data-pin-suggest="${escapeHtml(kw)}" aria-label="${escapeHtml(kw)} 핀 추가">📌</button>`
      : '';
    return `<li class="news-item${pinCls}${readCls}"><div class="news-item-row"><div class="news-item-body">${pinTag}${inner}</div>${quickPin}</div></li>`;
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

function bindNewsUnreadToggle() {
  const btn = document.getElementById('newsUnreadToggle');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    newsUnreadOnly = !newsUnreadOnly;
    localStorage.setItem(NEWS_UNREAD_ONLY_KEY, newsUnreadOnly ? '1' : '0');
    syncNewsUnreadToggle();
    const data = await loadTodayNews();
    renderNewsBrief(data);
  });
}

function bindNewsMarkAllRead() {
  const btn = document.getElementById('newsMarkAllRead');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    const data = await loadTodayNews();
    const key = activeNewsKey();
    const marketData = data ? pickMarketData(data, key) : null;
    const pins = getActiveNewsPins();
    const sorted = sortNewsByPins(marketData?.items || [], pins);
    const searched = filterNewsBySearch(sorted, newsSearchQuery);
    const links = searched.map((it) => it.link).filter(Boolean);
    markAllNewsArticlesRead(links);
    const refreshed = await loadTodayNews();
    renderNewsBrief(refreshed);
  });
}

function bindNewsQuickPin() {
  const list = document.getElementById('newsList');
  if (!list || list.dataset.quickPinBound) return;
  list.dataset.quickPinBound = '1';
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pin-suggest]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const kw = btn.dataset.pinSuggest;
    if (!kw) return;
    addNewsPin(kw);
    const data = await loadTodayNews();
    renderNewsBrief(data);
  });
}

function bindNewsReadTracking() {
  const list = document.getElementById('newsList');
  if (!list || list.dataset.readBound) return;
  list.dataset.readBound = '1';
  list.addEventListener('click', (e) => {
    if (e.target.closest('[data-pin-suggest]')) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    markNewsArticleRead(href);
    a.closest('.news-item')?.classList.add('news-item-read');
    loadTodayNews().then((data) => {
      syncNewsTabBadge(countAllUnreadNews(data));
      if (newsUnreadOnly) renderNewsBrief(data);
    });
  });
}

async function initNewsBrief() {
  renderNewsDate();
  bindNewsToggles();
  bindNewsPinBar();
  bindNewsSearch();
  bindNewsUnreadToggle();
  bindNewsMarkAllRead();
  bindNewsQuickPin();
  bindNewsReadTracking();
  syncNewsUnreadToggle();
  syncNewsCategoryToggle();
  syncNewsMarketToggle();
  const data = await loadTodayNews();
  renderNewsBrief(data);
}
