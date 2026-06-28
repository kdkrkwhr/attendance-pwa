/**
 * News 탭 — 오늘 주요 뉴스 (data/news/YYYY-MM-DD.json, cron 07:00 갱신)
 */
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
  for (const url of newsDataUrls()) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.date === todayNewsKey() || url.includes('latest.json')) return data;
    } catch {
      /* try next */
    }
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

function renderNewsBrief(data) {
  const card = document.getElementById('newsBriefCard');
  const listCard = document.getElementById('newsListCard');
  const empty = document.getElementById('newsEmpty');
  const summaryEl = document.getElementById('newsBriefSummary');
  const metaEl = document.getElementById('newsBriefMeta');
  const listEl = document.getElementById('newsList');

  if (!data?.summary && !(data?.items?.length)) {
    card?.classList.add('hidden');
    listCard?.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  card?.classList.remove('hidden');
  if (summaryEl) summaryEl.textContent = data.summary || '';

  const gen = data.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';
  if (metaEl) metaEl.textContent = gen ? `${gen} 갱신` : '';

  const items = data.items || [];
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

async function initNewsBrief() {
  renderNewsDate();
  const data = await loadTodayNews();
  renderNewsBrief(data);
}
