/**
 * News 탭 — 주식(국내·미국)·전체 뉴스 (data/news/YYYY-MM-DD.json, cron 07:00 갱신)
 */
const NEWS_MARKET_KEY = 'attendance-news-market';
const NEWS_CATEGORY_KEY = 'attendance-news-category';
let newsCache = null;
let newsMarket = localStorage.getItem(NEWS_MARKET_KEY) || 'kr';
let newsCategory = localStorage.getItem(NEWS_CATEGORY_KEY) || 'stock';

function todayNewsKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newsDataUrls() {
  const date = todayNewsKey();
  const v = window.APP_VERSION || '';
  const q = v ? `?v=${encodeURIComponent(v)}` : '';
  return [
    `./data/news/${date}.json${q}`,
    `./data/news/latest.json${q}`,
  ];
}

async function loadTodayNews() {
  if (newsCache) return newsCache;
  for (const url of newsDataUrls()) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.date === todayNewsKey() || url.includes('latest.json')) {
        newsCache = data;
        return data;
      }
    } catch {
      /* try next */
    }
  }
  return null;
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

function syncNewsCategoryToggle() {
  document.querySelectorAll('[data-category]').forEach((btn) => {
    const active = btn.dataset.category === newsCategory;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const stockToggle = document.getElementById('newsStockToggle');
  if (stockToggle) stockToggle.classList.toggle('hidden', newsCategory !== 'stock');
}

function syncNewsMarketToggle() {
  document.querySelectorAll('[data-market]').forEach((btn) => {
    const active = btn.dataset.market === newsMarket;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
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

  const items = marketData.items || [];
  if (!items.length || !listEl) {
    listCard?.classList.add('hidden');
    return;
  }

  listCard?.classList.remove('hidden');
  listEl.innerHTML = items.map((it) => {
    const title = escapeHtml(it.title || '제목 없음');
    const link = it.link ? escapeHtml(it.link) : '';
    const inner = link
      ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
    return `<li class="news-item">${inner}</li>`;
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

async function initNewsBrief() {
  renderNewsDate();
  bindNewsToggles();
  syncNewsCategoryToggle();
  syncNewsMarketToggle();
  const data = await loadTodayNews();
  renderNewsBrief(data);
}
