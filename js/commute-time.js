/**
 * commute-time 스킬 연동: 회사 → 집 소요시간 (자차 proxy + Hermes/ODsay 대중교통)
 */
const COMMUTE_CACHE_KEY = 'attendance-commute-cache';
const COMMUTE_FETCH_LOCK = { running: false };

const COMMUTE_HERMES_SYSTEM =
  'commute-time 스킬만 사용한다. SKILL.md 워크플로( geocode → Kakao mobility → ODsay )를 터미널로 따른다. ' +
  '응답은 스킬의 「응답 형식」만 5줄 이내로 출력한다. 다른 설명·질문 금지.';

function getCommuteConfig() {
  const cfg = window.APP_CONFIG?.commute || {};
  const office = cfg.office || {
    lat: window.APP_CONFIG?.lunchMap?.defaultCenter?.[0] ?? 37.5845,
    lng: window.APP_CONFIG?.lunchMap?.defaultCenter?.[1] ?? 126.8856,
    label: 'DMC첨단산업센터',
  };
  return {
    office,
    proxyBase: cfg.proxyBase || 'https://k-skill-proxy.nomadamas.org',
    cacheMinutes: cfg.cacheMinutes ?? 20,
    prefetchMinutesBeforeLeave: cfg.prefetchMinutesBeforeLeave ?? 45,
  };
}

function getHomeAddress() {
  const settings = typeof loadSettings === 'function' ? loadSettings() : {};
  return (settings.homeAddress || '').trim();
}

function isCommuteEnabled() {
  return Boolean(getHomeAddress());
}

function loadCommuteCache() {
  try {
    const raw = localStorage.getItem(COMMUTE_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.homeAddress !== getHomeAddress()) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCommuteCache(data) {
  localStorage.setItem(COMMUTE_CACHE_KEY, JSON.stringify({
    ...data,
    homeAddress: getHomeAddress(),
    fetchedAt: new Date().toISOString(),
  }));
}

function isCommuteCacheFresh(cache) {
  if (!cache?.fetchedAt) return false;
  const ageMs = Date.now() - new Date(cache.fetchedAt).getTime();
  return ageMs < getCommuteConfig().cacheMinutes * 60_000;
}

function parseCommuteSkillText(text) {
  const result = {
    transitMin: null,
    carMin: null,
    transfers: null,
    fare: null,
    distKm: null,
    mapUrl: null,
    raw: text || '',
  };
  if (!text) return result;

  const bus = text.match(/대중교통:\s*(?:약\s*)?(\d+)\s*분/);
  const busNa = /대중교통:\s*조회\s*불가/.test(text);
  const car = text.match(/자차:\s*(?:약\s*)?(\d+)\s*분/);
  const xfer = text.match(/환승\s*(\d+)\s*회/);
  const fare = text.match(/요금\s*([\d,]+)\s*원/);
  const km = text.match(/\(([\d.]+)\s*km/i);
  const map = text.match(/지도:\s*(https?:\/\/\S+)/);

  if (bus) result.transitMin = parseInt(bus[1], 10);
  else if (busNa) result.transitMin = null;
  if (car) result.carMin = parseInt(car[1], 10);
  if (xfer) result.transfers = parseInt(xfer[1], 10);
  if (fare) result.fare = parseInt(fare[1].replace(/,/g, ''), 10);
  if (km) result.distKm = parseFloat(km[1]);
  if (map) result.mapUrl = map[1];

  return result;
}

function mergeCommuteData(base, patch) {
  const out = { ...base };
  for (const k of ['transitMin', 'carMin', 'transfers', 'fare', 'distKm', 'mapUrl', 'officeLabel', 'homeLabel', 'error', 'source']) {
    if (patch[k] !== undefined && patch[k] !== null) out[k] = patch[k];
  }
  return out;
}

async function proxyGeocode(query) {
  const { proxyBase } = getCommuteConfig();
  const res = await fetch(
    `${proxyBase}/v1/kakao-local/geocode?${new URLSearchParams({ q: query })}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const data = await res.json();
  const doc = data.documents?.[0];
  if (!doc?.x || !doc?.y) throw new Error('주소를 찾지 못했습니다');
  return {
    lng: parseFloat(doc.x),
    lat: parseFloat(doc.y),
    label: doc.place_name || doc.address_name || query,
  };
}

async function proxyDrivingMinutes(originLng, originLat, destLng, destLat) {
  const { proxyBase } = getCommuteConfig();
  const params = new URLSearchParams({
    origin: `${originLng},${originLat}`,
    destination: `${destLng},${destLat}`,
    priority: 'TIME',
  });
  const res = await fetch(`${proxyBase}/v1/kakao-mobility/directions?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`자차 경로 HTTP ${res.status}`);
  const data = await res.json();
  const summary = data.routes?.[0]?.summary;
  if (!summary?.duration) throw new Error('자차 경로 없음');
  return {
    carMin: Math.round(summary.duration / 60),
    distKm: summary.distance ? Math.round(summary.distance / 100) / 10 : null,
    toll: summary.fare?.toll ?? null,
  };
}

async function fetchDrivingCommuteDirect() {
  const { office } = getCommuteConfig();
  const home = getHomeAddress();
  const dest = await proxyGeocode(home);
  const driving = await proxyDrivingMinutes(office.lng, office.lat, dest.lng, dest.lat);
  const mapUrl =
    `https://map.kakao.com/?sName=${encodeURIComponent(office.label)}` +
    `&sX=${office.lng}&sY=${office.lat}` +
    `&eName=${encodeURIComponent(dest.label)}&eX=${dest.lng}&eY=${dest.lat}`;

  return mergeCommuteData({}, {
    officeLabel: office.label,
    homeLabel: dest.label,
    carMin: driving.carMin,
    distKm: driving.distKm,
    mapUrl,
    source: 'proxy',
  });
}

async function fetchCommuteViaHermes() {
  if (typeof getHermesChatConfig !== 'function') throw new Error('Hermes 미설정');
  const { baseUrl, apiKey, model } = getHermesChatConfig();
  if (!baseUrl || !apiKey) throw new Error('Hermes API 주소·키 필요');

  const { office } = getCommuteConfig();
  const home = getHomeAddress();
  const userContent =
    `출발:${office.lat},${office.lng}\n` +
    `도착:${home}\n` +
    `${office.label}에서 집까지 대중교통·자차 소요시간을 commute-time 스킬로 조회해줘.`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: COMMUTE_HERMES_SYSTEM },
        { role: 'user', content: userContent },
      ],
      stream: false,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `Hermes HTTP ${res.status}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  const parsed = parseCommuteSkillText(text);
  return mergeCommuteData(parsed, {
    officeLabel: office.label,
    homeLabel: home,
    source: 'hermes',
    raw: text,
  });
}

async function fetchCommuteTime({ force = false } = {}) {
  if (!isCommuteEnabled()) return null;

  const cached = loadCommuteCache();
  if (!force && cached && isCommuteCacheFresh(cached)) return cached;
  if (COMMUTE_FETCH_LOCK.running) return cached;

  COMMUTE_FETCH_LOCK.running = true;
  let result = cached ? { ...cached } : {};

  try {
    const directPromise = fetchDrivingCommuteDirect().catch((e) => {
      console.warn('자차 직접 조회 실패:', e);
      return null;
    });

    const hermesPromise =
      typeof isHermesConfigured === 'function' && isHermesConfigured()
        ? fetchCommuteViaHermes().catch((e) => {
            console.warn('Hermes commute-time 실패:', e);
            return { error: e.message || String(e) };
          })
        : Promise.resolve(null);

    const [direct, hermes] = await Promise.all([directPromise, hermesPromise]);

    if (direct) result = mergeCommuteData(result, direct);
    if (hermes) {
      if (hermes.error && !direct) result.error = hermes.error;
      else result = mergeCommuteData(result, hermes);
    }
    if (!direct && !hermes) {
      result.error = result.error || '소요시간을 가져오지 못했습니다';
    }

    saveCommuteCache(result);
    return result;
  } finally {
    COMMUTE_FETCH_LOCK.running = false;
    if (typeof renderCommuteCard === 'function') renderCommuteCard();
  }
}

function formatCommuteMinutes(min) {
  if (min == null || Number.isNaN(min)) return '—';
  return `약 ${min}분`;
}

function estimateHomeArrival(leaveTime, transitMin, carMin) {
  const minutes = transitMin ?? carMin;
  if (!leaveTime || minutes == null) return null;
  return addMinutes(leaveTime, minutes);
}

function getCommuteSummaryLine(leaveTime) {
  const cache = loadCommuteCache();
  if (!cache || (!cache.transitMin && !cache.carMin)) return '';

  const parts = [];
  if (cache.transitMin != null) parts.push(`🚌 ${formatCommuteMinutes(cache.transitMin)}`);
  if (cache.carMin != null) parts.push(`🚗 ${formatCommuteMinutes(cache.carMin)}`);

  let line = `집까지 ${parts.join(' · ')}`;
  const arrival = estimateHomeArrival(leaveTime, cache.transitMin, cache.carMin);
  if (arrival) line += ` · 도착 약 ${formatTime(arrival)}`;
  return line;
}

function renderCommuteCard() {
  const card = document.getElementById('commuteCard');
  const setup = document.getElementById('commuteSetup');
  if (!card) return;

  const record = typeof getTodayRecord === 'function' ? getTodayRecord() : null;
  const working = record?.checkIn && !record?.checkOut;
  const enabled = isCommuteEnabled();

  card.classList.toggle('hidden', !working);
  setup?.classList.toggle('hidden', enabled || !working);

  if (!working) return;

  const routeEl = document.getElementById('commuteRoute');
  const transitEl = document.getElementById('commuteTransit');
  const carEl = document.getElementById('commuteCar');
  const arrivalEl = document.getElementById('commuteArrival');
  const metaEl = document.getElementById('commuteMeta');
  const mapLink = document.getElementById('commuteMapLink');
  const btn = document.getElementById('btnCommuteRefresh');

  if (!enabled) {
    if (routeEl) routeEl.textContent = '집 주소를 설정해 주세요';
    return;
  }

  const cache = loadCommuteCache();
  const { office } = getCommuteConfig();
  const home = getHomeAddress();

  if (routeEl) {
    routeEl.textContent = `${cache?.officeLabel || office.label} → ${cache?.homeLabel || home}`;
  }

  const loading = COMMUTE_FETCH_LOCK.running;
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? '조회 중…' : '새로고침';
  }

  if (transitEl) {
    if (loading && cache?.transitMin == null) {
      transitEl.textContent = '🚌 조회 중…';
    } else if (cache?.transitMin != null) {
      const xfer = cache.transfers != null ? ` · 환승 ${cache.transfers}회` : '';
      const fare = cache.fare != null ? ` · ${cache.fare.toLocaleString()}원` : '';
      transitEl.textContent = `🚌 ${formatCommuteMinutes(cache.transitMin)}${xfer}${fare}`;
    } else if (typeof isHermesConfigured === 'function' && !isHermesConfigured()) {
      transitEl.textContent = '🚌 Hermes 연결 시 조회';
    } else {
      transitEl.textContent = '🚌 조회 불가';
    }
  }

  if (carEl) {
    if (loading && cache?.carMin == null) {
      carEl.textContent = '🚗 조회 중…';
    } else if (cache?.carMin != null) {
      const km = cache.distKm != null ? ` · ${cache.distKm}km` : '';
      carEl.textContent = `🚗 ${formatCommuteMinutes(cache.carMin)}${km}`;
    } else {
      carEl.textContent = '🚗 —';
    }
  }

  if (arrivalEl && record?.checkIn) {
    const leave = calcLeaveTime(record.checkIn);
    const arrival = estimateHomeArrival(leave, cache?.transitMin, cache?.carMin);
    arrivalEl.textContent = arrival
      ? `퇴근(${formatTime(leave)}) 후 집 도착 예상: ${formatTime(arrival)}`
      : '퇴근 시각 기준 집 도착 예상을 계산합니다';
  }

  if (metaEl) {
    if (cache?.fetchedAt && isCommuteCacheFresh(cache)) {
      const t = formatChatTimeCommute(cache.fetchedAt);
      metaEl.textContent = `${t} 기준 · commute-time`;
    } else if (cache?.error) {
      metaEl.textContent = cache.error;
    } else {
      metaEl.textContent = '';
    }
  }

  if (mapLink) {
    if (cache?.mapUrl) {
      mapLink.href = cache.mapUrl;
      mapLink.classList.remove('hidden');
    } else {
      mapLink.classList.add('hidden');
    }
  }
}

function formatChatTimeCommute(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function maybePrefetchCommute() {
  const settings = typeof loadSettings === 'function' ? loadSettings() : {};
  if (settings.commuteNotify === false || !isCommuteEnabled()) return;

  const record = typeof getTodayRecord === 'function' ? getTodayRecord() : null;
  if (!record?.checkIn || record.checkOut) return;

  const leaveTime = calcLeaveTime(record.checkIn);
  const now = new Date();
  const { prefetchMinutesBeforeLeave } = getCommuteConfig();
  const prefetchAt = addMinutes(leaveTime, -prefetchMinutesBeforeLeave);

  if (now < prefetchAt) return;

  const cache = loadCommuteCache();
  if (isCommuteCacheFresh(cache)) return;
  if (COMMUTE_FETCH_LOCK.running) return;

  fetchCommuteTime({ force: false });
}

function checkCommuteLeaveNotify() {
  const settings = typeof loadSettings === 'function' ? loadSettings() : {};
  if (settings.commuteNotify === false || !isCommuteEnabled()) return;

  const record = typeof getTodayRecord === 'function' ? getTodayRecord() : null;
  if (!record?.checkIn || record.checkOut) return;

  const leaveTime = calcLeaveTime(record.checkIn);
  const now = new Date();
  const key = `${todayKey()}-commute-30`;
  if (wasNotified(key)) return;

  const notifyAt = addMinutes(leaveTime, -30);
  if (now < notifyAt || now >= addMinutes(notifyAt, 3)) return;

  const line = getCommuteSummaryLine(leaveTime);
  if (!line) {
    fetchCommuteTime({ force: false }).then(() => {
      const refreshed = getCommuteSummaryLine(leaveTime);
      if (refreshed && !wasNotified(key)) {
        sendNotification('퇴근길 안내', refreshed, 'commute-reminder');
        markNotified(key);
      }
    });
    return;
  }

  sendNotification('퇴근길 안내', line, 'commute-reminder');
  markNotified(key);
}

function handleCommuteGoSettings() {
  if (typeof switchTab === 'function') switchTab('settings');
  document.getElementById('homeAddress')?.focus();
}

let commuteInited = false;

function initCommuteTime() {
  if (commuteInited) return;
  commuteInited = true;

  document.getElementById('btnCommuteRefresh')?.addEventListener('click', () => {
    fetchCommuteTime({ force: true });
  });
  document.getElementById('btnCommuteGoSettings')?.addEventListener('click', handleCommuteGoSettings);

  if (isCommuteEnabled()) {
    const cache = loadCommuteCache();
    if (!isCommuteCacheFresh(cache)) fetchCommuteTime({ force: false });
  }
}
