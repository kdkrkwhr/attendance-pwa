/**
 * 오늘 탭 — 회사 근처 날씨 (data/weather/YYYY-MM-DD.json, cron 06:00 갱신)
 */
function isRainyPeriod(period) {
  if (!period) return false;
  const pty = String(period.pty || '');
  if (pty && pty !== '없음' && /비|소나기|눈|진눈|빗/i.test(pty)) return true;
  return false;
}

function shouldShowMapRain(data) {
  if (!data) return false;
  if (isRainyPeriod(getWeatherPeriodNow(data))) return true;
  const sum = String(data.summary || '');
  if (!/비|소나기|우산|강수|빗/.test(sum)) return false;
  return (data.periods || []).some(isRainyPeriod);
}

function weatherEmojiFromPeriod(period) {
  if (!period) return '🌤';
  const pty = String(period.pty || '');
  if (pty.includes('소나기') || pty.includes('비')) return '🌧️';
  if (pty.includes('눈')) return '❄️';
  const sky = String(period.sky || '');
  if (sky.includes('맑')) return '☀️';
  if (sky.includes('구름')) return '⛅';
  if (sky.includes('흐림')) return '☁️';
  return '🌤';
}

function getWeatherPeriodNow(data) {
  if (!data?.periods?.length) return null;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let best = data.periods[0];
  for (const p of data.periods) {
    const [h, m = 0] = String(p.time || '0:0').split(':').map(Number);
    if (h * 60 + m <= nowMin) best = p;
    else break;
  }
  return best;
}

function formatWeatherTempLabel(data, period) {
  if (period?.temp != null) return `${period.temp}°C`;
  const hi = data?.highlights || {};
  if (hi.tempMin != null && hi.tempMax != null) return `${hi.tempMin}~${hi.tempMax}°C`;
  return '';
}

async function loadTodayWeather() {
  return loadDailyJson('weather');
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
