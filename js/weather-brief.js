/**
 * 오늘 탭 — 회사 근처 날씨 (data/weather/YYYY-MM-DD.json, cron 06:00 갱신)
 */
function todayWeatherKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weatherDataUrls() {
  const date = todayWeatherKey();
  const v = window.APP_VERSION || '';
  const q = v ? `?v=${encodeURIComponent(v)}` : '';
  return [
    `./data/weather/${date}.json${q}`,
    `./data/weather/latest.json${q}`,
  ];
}

async function loadTodayWeather() {
  for (const url of weatherDataUrls()) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.date === todayWeatherKey() || url.includes('latest.json')) return data;
    } catch {
      /* try next */
    }
  }
  return null;
}

function renderWeatherBrief(data) {
  const card = document.getElementById('weatherBriefCard');
  const summaryEl = document.getElementById('weatherBriefSummary');
  const metaEl = document.getElementById('weatherBriefMeta');
  if (!card) return;

  if (!data?.summary) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  if (summaryEl) summaryEl.textContent = data.summary;

  const hi = data.highlights || {};
  const range = hi.tempMin != null && hi.tempMax != null
    ? `${hi.tempMin}~${hi.tempMax}°C`
    : '';
  const loc = data.location || '회사';
  const gen = data.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';
  if (metaEl) {
    metaEl.textContent = [loc, range, gen ? `${gen} 갱신` : ''].filter(Boolean).join(' · ');
  }
}

async function initWeatherBrief() {
  const data = await loadTodayWeather();
  renderWeatherBrief(data);
}
