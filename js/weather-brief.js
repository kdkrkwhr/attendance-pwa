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

function needsUmbrellaToday(data) {
  if (!data) return false;
  const sum = String(data.summary || '');
  if (/우산 챙기|우산 필요|비\/소나기 가능/.test(sum)) return true;
  return typeof shouldShowMapRain === 'function' && shouldShowMapRain(data);
}

function needsHeatWarningToday(data) {
  if (!data) return false;
  const hi = data.highlights || {};
  if (hi.tempMax != null && hi.tempMax >= 33) return true;
  const sum = String(data.summary || '');
  return /폭염|무더|고온|자외선|덥/.test(sum);
}

function renderUmbrellaBadge(data) {
  const el = document.getElementById('umbrellaBadge');
  if (!el) return;
  el.classList.toggle('hidden', !needsUmbrellaToday(data));
}

function renderHeatBadge(data) {
  const el = document.getElementById('heatBadge');
  if (!el) return;
  el.classList.toggle('hidden', !needsHeatWarningToday(data));
}

function renderWeatherBrief(data) {
  const card = document.getElementById('weatherBriefCard');
  const summaryEl = document.getElementById('weatherBriefSummary');
  const metaEl = document.getElementById('weatherBriefMeta');
  if (!card) return;

  renderUmbrellaBadge(data);
  renderHeatBadge(data);

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
    ? (function () {
        const diffMs = Date.now() - new Date(data.generatedAt).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return '방금';
        if (diffMin < 60) return `${diffMin}분 전`;
        const diffH = Math.floor(diffMin / 60);
        return `${diffH}시간 전`;
      })()
    : '';
  if (metaEl) {
    metaEl.textContent = [loc, range, gen ? `${gen} 갱신` : ''].filter(Boolean).join(' · ');
  }

  renderWeatherPeriods(data);
}

function renderWeatherPeriods(data) {
  const el = document.getElementById('weatherBriefPeriods');
  if (!el) return;
  const periods = data?.periods || [];
  if (!periods.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  const nowH = new Date().getHours();
  let prevTemp = null;
  el.innerHTML = periods
    .map((p) => {
      const emoji = weatherEmojiFromPeriod(p);
      const rain = isRainyPeriod(p);
      const pop = p.pop > 0 ? ` · ${p.pop}%` : '';
      const ph = parseInt(p.time, 10);
      const isNow = ph === nowH;
      const cls = [rain ? 'weather-period-rain' : '', isNow ? 'weather-period-now' : ''].filter(Boolean).join(' ');
      let arrow = '';
      if (prevTemp != null && p.temp != null) {
        if (p.temp > prevTemp) arrow = '<span class="temp-arrow temp-up"> ↑</span>';
        else if (p.temp < prevTemp) arrow = '<span class="temp-arrow temp-down"> ↓</span>';
        else arrow = '<span class="temp-arrow temp-steady"> →</span>';
      }
      prevTemp = p.temp;
      return `<li class="${cls}">${emoji} ${p.time} ${p.temp}°${arrow}${pop}</li>`;
    })
    .join('');
}

async function initWeatherBrief() {
  const data = await loadTodayWeather();
  renderWeatherBrief(data);
}
