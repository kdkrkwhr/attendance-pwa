/**
 * Fun 탭 — 점심 맛집 지도 (Leaflet + OpenStreetMap, API 키 없음)
 * 데이터: data/dmc_restaurants.json
 */
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const LUNCH_RADIUS_M = 400;
const LUNCH_SKIP_CAT = /편의점|카페|커피|베이커리|디저트/i;

let lunchMapInstance = null;
let lunchMapMarkers = [];
let lunchMapData = null;
let lunchMapReady = false;
let lunchMapLoading = false;
let lunchRouletteSpinning = false;
let lunchRouletteWinnerId = null;
let lunchOfficeCircle = null;
let lunchUserMarker = null;
let lunchUserCircle = null;
let lunchMapInitialViewDone = false;
let lunchWeatherMarker = null;
let lunchWeatherData = null;

const LUNCH_USER_ZOOM = 17;
const LUNCH_FAVORITES_KEY = 'attendance-lunch-favorites';
const LUNCH_ROULETTE_DAY_KEY = 'attendance-lunch-roulette-day';
const LUNCH_DIARY_KEY = 'attendance-lunch-diary';
const LUNCH_DIARY_HISTORY_KEY = 'attendance-lunch-diary-history';
const LUNCH_DIARY_HISTORY_MAX = 30;

function loadLunchDiaryText() {
  try {
    const raw = JSON.parse(localStorage.getItem(LUNCH_DIARY_KEY) || 'null');
    if (raw?.date === todayKey() && raw.text) return String(raw.text);
  } catch {}
  return '';
}

function loadLunchDiaryHistory() {
  try {
    return JSON.parse(localStorage.getItem(LUNCH_DIARY_HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveLunchDiaryHistory(history) {
  localStorage.setItem(LUNCH_DIARY_HISTORY_KEY, JSON.stringify(history));
}

function saveLunchDiary(text) {
  const t = String(text || '').trim();
  if (!t) {
    localStorage.removeItem(LUNCH_DIARY_KEY);
    if (typeof renderLunchSummary === 'function') renderLunchSummary();
    renderLunchDiaryHistory();
    return;
  }
  localStorage.setItem(LUNCH_DIARY_KEY, JSON.stringify({ date: todayKey(), text: t }));
  if (typeof renderLunchSummary === 'function') renderLunchSummary();

  // push to history archive
  const history = loadLunchDiaryHistory();
  const today = todayKey();
  const existingIdx = history.findIndex(e => e.date === today);
  if (existingIdx >= 0) {
    history[existingIdx] = { date: today, text: t };
  } else {
    history.push({ date: today, text: t });
  }
  // keep only newest N
  history.sort((a, b) => (a.date < b.date ? 1 : -1));
  if (history.length > LUNCH_DIARY_HISTORY_MAX) history.length = LUNCH_DIARY_HISTORY_MAX;
  saveLunchDiaryHistory(history);
  renderLunchDiaryHistory();
  updateLunchDiaryStats();
}

function renderLunchDiaryHistory() {
  const list = document.getElementById('lunchDiaryHistoryList');
  const container = document.getElementById('lunchDiaryHistory');
  if (!list || !container) return;

  const history = loadLunchDiaryHistory().filter(e => e.date !== todayKey()).slice(0, 7);
  if (!history.length) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  list.innerHTML = history.map(e => {
    const dateStr = e.date.replace(/^\d{4}-/, '').replace(/-/g, '/');
    return `<li class="lunch-diary-history-item"><span class="lunch-diary-history-date">${dateStr}</span><span class="lunch-diary-history-text">${escapeHtml(e.text)}</span></li>`;
  }).join('');
  updateLunchDiaryStats();
}

function updateLunchDiaryStats() {
  const container = document.getElementById('lunchDiaryStats');
  const textEl = document.getElementById('lunchDiaryStatsText');
  if (!container || !textEl) return;

  const history = loadLunchDiaryHistory();
  const today = todayKey();
  // include today's entry if exists
  const todayEntry = history.find(e => e.date === today);
  const allEntries = todayEntry ? history : history.concat(todayEntry ? [todayEntry] : []);

  // get this week's Monday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayKey = formatDateKey(monday);

  const weekEntries = allEntries.filter(e => e.date >= mondayKey && e.date <= today);
  if (!weekEntries.length) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const count = weekEntries.length;

  // find most frequent place
  const freq = {};
  weekEntries.forEach(e => {
    const t = e.text.trim();
    if (t) freq[t] = (freq[t] || 0) + 1;
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  let topText = '';
  if (sorted.length && sorted[0][1] > 1) {
    topText = ` · 가장 많이: ${escapeHtml(sorted[0][0])} (${sorted[0][1]}회)`;
  }

  textEl.textContent = `이번 주 ${count}회 식사 기록${topText}`;
}

function initLunchDiaryHistory() {
  const container = document.getElementById('lunchDiaryHistory');
  if (!container || container.dataset.bound) return;
  container.dataset.bound = '1';
  renderLunchDiaryHistory();
}

function setLunchDiaryFromRoulette(placeName) {
  const input = document.getElementById('lunchDiaryInput');
  if (!input || input.value.trim()) return;
  input.value = placeName;
  saveLunchDiary(placeName);
}

function initLunchDiary() {
  const input = document.getElementById('lunchDiaryInput');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.value = loadLunchDiaryText();
  const persist = () => saveLunchDiary(input.value);
  input.addEventListener('change', persist);
  input.addEventListener('blur', persist);
}

function loadLunchFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(LUNCH_FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveLunchFavorites(favs) {
  localStorage.setItem(LUNCH_FAVORITES_KEY, JSON.stringify([...favs]));
}

function toggleLunchFavorite(placeId) {
  const favs = loadLunchFavorites();
  if (favs.has(placeId)) favs.delete(placeId);
  else favs.add(placeId);
  saveLunchFavorites(favs);
}

function getLunchMapConfig() {
  return window.APP_CONFIG?.lunchMap || {};
}

function getLunchRadiusM(data) {
  const metaR = Number(data?.meta?.radius_m);
  if (Number.isFinite(metaR) && metaR > 0) return metaR;
  const cfgR = Number(getLunchMapConfig().radiusM);
  if (Number.isFinite(cfgR) && cfgR > 0) return cfgR;
  return LUNCH_RADIUS_M;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlambda / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function isFoodPlace(place) {
  const cat = String(place?.category || '');
  return cat && !LUNCH_SKIP_CAT.test(cat);
}

function filterPlacesByOfficeRadius(places, office, radiusM) {
  if (!office || !Number.isFinite(radiusM)) return places.filter(isFoodPlace);
  return places
    .filter(isFoodPlace)
    .map((place) => {
      const dist = haversineM(office.lat, office.lng, place.lat, place.lng);
      return { ...place, distance_m: Math.round(dist * 10) / 10 };
    })
    .filter((place) => place.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m);
}

/** ponytail: same-block POIs get display offset so pins don't stack; true lat/lng kept for distance */
function spreadMapDisplayCoords(places, minSepM = 30) {
  const placed = [];
  const golden = 2.399963;

  return places.map((place, index) => {
    let lat = place.lat;
    let lng = place.lng;

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const crowded = placed.some((p) => haversineM(lat, lng, p.lat, p.lng) < minSepM);
      if (!crowded) break;
      const angle = (index * golden + attempt * 0.85) % (Math.PI * 2);
      const radius = minSepM * (0.55 + attempt * 0.28);
      const metersPerLat = 111320;
      const metersPerLng = 111320 * Math.cos((place.lat * Math.PI) / 180);
      lat = place.lat + (Math.cos(angle) * radius) / metersPerLat;
      lng = place.lng + (Math.sin(angle) * radius) / metersPerLng;
    }

    placed.push({ lat, lng });
    return { ...place, displayLat: lat, displayLng: lng };
  });
}

function getLunchMapDataUrl() {
  return getLunchMapConfig().dataUrl || './data/dmc_restaurants.json';
}

function fixLeafletIconPaths() {
  if (typeof L === 'undefined') return;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: './vendor/leaflet/images/marker-icon-2x.png',
    iconUrl: './vendor/leaflet/images/marker-icon.png',
    shadowUrl: './vendor/leaflet/images/marker-shadow.png',
  });
}

const PLACE_CAT_EMOJI = [
  [/국밥|찌개|탕|국수|면|라멘|우동|쌀국수|분식|김밥|떡볶/i, '🍜'],
  [/한식|정식|백반|고기|구이|삼겹|갈비|족발|보쌈/i, '🍱'],
  [/일식|초밥|돈까스/i, '🍣'],
  [/중식|짜장|짬뽕|마라/i, '🥟'],
  [/양식|피자|파스타|버거|스테이크/i, '🍕'],
  [/치킨|닭/i, '🍗'],
];

function getPlaceEmoji(category) {
  const cat = String(category || '');
  for (const [re, emoji] of PLACE_CAT_EMOJI) {
    if (re.test(cat)) return emoji;
  }
  return '🍽️';
}

function escapePinLabel(text) {
  return String(text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function createPlacePinIcon(place) {
  const emoji = getPlaceEmoji(place.category);
  const hue = Math.abs([...String(place.id)].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  const label = escapePinLabel(place.name);
  return L.divIcon({
    className: 'lunch-map-pin-place-wrap',
    html: `
      <div class="place-pin" style="--pin-hue:${hue}" role="img" aria-label="${label}">
        <span class="place-pin-glow" aria-hidden="true"></span>
        <span class="place-pin-head"><span class="place-pin-emoji">${emoji}</span></span>
        <span class="place-pin-stem" aria-hidden="true"></span>
      </div>
    `,
    iconSize: [48, 58],
    iconAnchor: [24, 52],
    popupAnchor: [0, -48],
  });
}

function getOfficeShortName(name) {
  const n = String(name || 'DMC첨단산업센터');
  const idx = n.indexOf('(');
  return idx > 0 ? n.slice(0, idx).trim() : n;
}

function createUserLocationIcon() {
  return L.divIcon({
    className: 'lunch-map-pin lunch-map-pin-user',
    html: `
      <div class="user-face-pin" role="img" aria-label="내 위치">
        <span class="user-face-pin-glow" aria-hidden="true"></span>
        <span class="user-face-pin-head" aria-hidden="true">
          <span class="user-face-pin-hair"></span>
          <span class="user-face-pin-eye user-face-pin-eye-left"></span>
          <span class="user-face-pin-eye user-face-pin-eye-right"></span>
          <span class="user-face-pin-blush user-face-pin-blush-left"></span>
          <span class="user-face-pin-blush user-face-pin-blush-right"></span>
          <span class="user-face-pin-smile"></span>
        </span>
        <span class="user-face-pin-pointer" aria-hidden="true"></span>
      </div>
    `,
    iconSize: [52, 60],
    iconAnchor: [26, 54],
    popupAnchor: [0, -48],
  });
}

function createOfficePinIcon(label) {
  const safeLabel = label.replace(/</g, '&lt;');
  return L.divIcon({
    className: 'lunch-map-pin-office-wrap',
    html: `
      <div class="office-pin" role="img" aria-label="${safeLabel}">
        <span class="office-pin-ring" aria-hidden="true"></span>
        <span class="office-pin-ring office-pin-ring-delay" aria-hidden="true"></span>
        <span class="office-pin-core"><span class="office-pin-icon-inner">🏢</span></span>
        <span class="office-pin-label">${safeLabel}</span>
      </div>
    `,
    iconSize: [128, 76],
    iconAnchor: [64, 58],
    popupAnchor: [0, -52],
  });
}

function formatPriceLabel(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (s.includes('원')) return s;
  if (/^\d+-\d+$/.test(s)) {
    const [min, max] = s.split('-').map((n) => Number(n).toLocaleString('ko-KR'));
    return `${min}~${max}원`;
  }
  return s;
}

function formatRatingLabel(rating, source) {
  if (rating == null || Number.isNaN(Number(rating))) return '';
  const src = source && source !== 'none' ? ` · ${source}` : '';
  return `★ ${rating}${src}`;
}

function normalizePlace(place, index, idPrefix = 'place') {
  const lat = Number(place.lat ?? place.latitude);
  const lng = Number(place.lng ?? place.longitude ?? place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const signature = place.signature_menu || place.signatureMenu || '';
  const price = formatPriceLabel(place.avg_price || place.price || '');
  const rating = place.rating == null ? null : Number(place.rating);
  const ratingSource = place.rating_source || place.ratingSource || '';

  return {
    id: String(place.id || `${idPrefix}-${index}`),
    name: String(place.name || '이름 없음'),
    category: String(place.category || '기타'),
    lat,
    lng,
    memo: String(place.memo || place.note || signature || ''),
    signatureMenu: String(signature),
    price,
    rating: Number.isFinite(rating) ? rating : null,
    ratingSource: String(ratingSource),
    address: String(place.address || ''),
    phone: String(place.phone || ''),
  };
}

function normalizeRestaurantData(raw) {
  if (!raw || typeof raw !== 'object') return null;

  let office = null;
  let meta = null;
  let sourcePlaces = [];

  if (Array.isArray(raw.restaurants)) {
    meta = raw.meta || null;
    sourcePlaces = raw.restaurants;
    if (meta && Number.isFinite(Number(meta.anchor_lat)) && Number.isFinite(Number(meta.anchor_lng))) {
      office = {
        name: meta.anchor || 'DMC첨단산업센터',
        lat: Number(meta.anchor_lat),
        lng: Number(meta.anchor_lng),
      };
    }
  } else {
    sourcePlaces = Array.isArray(raw.places) ? raw.places : Array.isArray(raw) ? raw : [];
    if (raw.office && Number.isFinite(raw.office.lat) && Number.isFinite(raw.office.lng)) {
      office = raw.office;
    }
  }

  const places = spreadMapDisplayCoords(
    filterPlacesByOfficeRadius(
      sourcePlaces.map((place, index) => normalizePlace(place, index, 'dmc')).filter(Boolean),
      office,
      getLunchRadiusM({ meta }),
    ),
  );

  return { office, places, meta };
}

async function loadLunchMapData() {
  if (lunchMapData) return lunchMapData;
  const res = await fetch(getLunchMapDataUrl(), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`맛집 데이터를 불러오지 못했습니다 (${res.status})`);
  const raw = await res.json();
  lunchMapData = normalizeRestaurantData(raw);
  if (!lunchMapData?.places?.length) {
    throw new Error('표시할 맛집 좌표가 없습니다. data/dmc_restaurants.json 을 확인해 주세요.');
  }
  return lunchMapData;
}

function buildPopupHtml(place) {
  const rating = formatRatingLabel(place.rating, place.ratingSource);
  const ratingHtml = rating ? `<p class="lunch-map-popup-rating">${rating}</p>` : '';
  const memo = place.signatureMenu
    ? `<p class="lunch-map-popup-memo">대표: ${place.signatureMenu}</p>`
    : place.memo
      ? `<p class="lunch-map-popup-memo">${place.memo}</p>`
      : '';
  const price = place.price ? `<p class="lunch-map-popup-price">${place.price}</p>` : '';
  const address = place.address ? `<p class="lunch-map-popup-address">${place.address}</p>` : '';
  return `
    <div class="lunch-map-popup">
      <strong>${place.name}</strong>
      <span class="lunch-map-popup-cat">${place.category}</span>
      ${ratingHtml}
      ${price}
      ${memo}
      ${address}
    </div>
  `;
}

function updateLunchMapDesc(data) {
  const descEl = document.getElementById('lunchMapDesc');
  if (!descEl) return;
  const anchor = data.meta?.anchor || data.office?.name || 'DMC';
  const radius = getLunchRadiusM(data);
  descEl.textContent = `${anchor} · ${data.places.length}곳 · ${radius}m`;
}

function getMapCenter(data) {
  if (data.office) return [data.office.lat, data.office.lng];
  const cfg = getLunchMapConfig();
  if (Array.isArray(cfg.defaultCenter) && cfg.defaultCenter.length === 2) {
    return cfg.defaultCenter;
  }
  const first = data.places[0];
  return [first.lat, first.lng];
}


function createWeatherPinIcon(emoji, tempLabel) {
  const safeTemp = escapePinLabel(tempLabel || '');
  return L.divIcon({
    className: 'lunch-map-pin-weather-wrap',
    html: `
      <div class="weather-pin" role="img" aria-label="회사 날씨">
        <span class="weather-pin-glow" aria-hidden="true"></span>
        <span class="weather-pin-bubble"><span class="weather-pin-emoji">${emoji}</span></span>
        ${safeTemp ? `<span class="weather-pin-temp">${safeTemp}</span>` : ''}
        <span class="weather-pin-tail" aria-hidden="true"></span>
      </div>
    `,
    iconSize: [56, 68],
    iconAnchor: [28, 62],
    popupAnchor: [0, -56],
  });
}

function buildWeatherPopupHtml(data, period) {
  const emoji = weatherEmojiFromPeriod(period);
  const temp = formatWeatherTempLabel(data, period);
  const sky = period?.sky ? `<p class="lunch-map-popup-memo">${period.sky}${period.pty && period.pty !== '없음' ? ` · ${period.pty}` : ''}</p>` : '';
  const pop = period?.pop != null && period.pop > 0 ? `<p class="lunch-map-popup-memo">강수확률 ${period.pop}%</p>` : '';
  return `
    <div class="lunch-map-popup lunch-map-popup-weather">
      <strong>${emoji} ${data.location || '회사'} 날씨</strong>
      ${temp ? `<p class="lunch-map-popup-price">${temp}</p>` : ''}
      ${sky}
      ${pop}
      ${data.summary ? `<p class="lunch-map-popup-memo">${data.summary}</p>` : ''}
    </div>
  `;
}

function renderLunchWeatherChip(data, period) {
  const chip = document.getElementById('lunchWeatherChip');
  const iconEl = document.getElementById('lunchWeatherIcon');
  const tempEl = document.getElementById('lunchWeatherTemp');
  const textEl = document.getElementById('lunchWeatherText');
  if (!chip || !data?.summary) {
    chip?.classList.add('hidden');
    return;
  }
  const emoji = weatherEmojiFromPeriod(period);
  const temp = formatWeatherTempLabel(data, period);
  if (iconEl) iconEl.textContent = emoji;
  if (tempEl) tempEl.textContent = temp;
  if (textEl) {
    const bits = [period?.sky, period?.pty && period.pty !== '없음' ? period.pty : ''].filter(Boolean);
    textEl.textContent = bits.length ? bits.join(' · ') : data.summary.slice(0, 36);
  }
  chip.classList.remove('hidden');
}

let lunchRainRaf = 0;

function stopLunchRainAnim(el) {
  if (lunchRainRaf) {
    cancelAnimationFrame(lunchRainRaf);
    lunchRainRaf = 0;
  }
  el?._rainResizeObs?.disconnect();
  delete el?._rainResizeObs;
  const canvas = el?.querySelector('canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function startLunchRainAnim(el) {
  stopLunchRainAnim(el);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let canvas = el.querySelector('canvas.lunch-map-rain-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'lunch-map-rain-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  const drops = [];
  const wind = -2.2;

  function rainDropCount(w, h) {
    return Math.min(140, Math.max(55, Math.floor((w * h) / 6500)));
  }

  function spawnDrop(w, h, randomY) {
    const heavy = Math.random() < 0.22;
    return {
      x: Math.random() * (w + 40) - 20,
      y: randomY ? Math.random() * h : -(8 + Math.random() * 24),
      len: heavy ? 14 + Math.random() * 18 : 6 + Math.random() * 12,
      speed: heavy ? 18 + Math.random() * 14 : 10 + Math.random() * 12,
      opacity: heavy ? 0.38 + Math.random() * 0.38 : 0.2 + Math.random() * 0.28,
      width: heavy ? 1.1 + Math.random() * 0.5 : 0.55 + Math.random() * 0.35,
    };
  }

  function resize() {
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = rainDropCount(w, h);
    while (drops.length < target) drops.push(spawnDrop(w, h, true));
    drops.length = target;
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  el._rainResizeObs = ro;

  let lastTs = 0;
  function tick(ts) {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) {
      lunchRainRaf = requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(40, ts - lastTs || 16) / 16;
    lastTs = ts;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const d of drops) {
      d.y += d.speed * dt;
      d.x += wind * dt;
      ctx.strokeStyle = `rgba(210, 232, 255, ${d.opacity})`;
      ctx.lineWidth = d.width;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + wind * 1.6, d.y + d.len);
      ctx.stroke();
      if (d.y - d.len > h + 12) Object.assign(d, spawnDrop(w, h, false));
    }
    lunchRainRaf = requestAnimationFrame(tick);
  }
  lunchRainRaf = requestAnimationFrame(tick);
}

function updateLunchMapRainEffect(data) {
  const el = document.getElementById('lunchMapRain');
  if (!el) return;
  const show = typeof shouldShowMapRain === 'function' && shouldShowMapRain(data);
  el.classList.toggle('hidden', !show);
  el.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) startLunchRainAnim(el);
  else stopLunchRainAnim(el);
}

function renderLunchWeatherMarker(data) {
  if (!lunchMapInstance || !data) return;
  if (lunchWeatherMarker) {
    lunchWeatherMarker.remove();
    lunchWeatherMarker = null;
  }
  const lat = Number(data.lat ?? lunchMapData?.office?.lat);
  const lng = Number(data.lng ?? lunchMapData?.office?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const period = getWeatherPeriodNow(data);
  const emoji = weatherEmojiFromPeriod(period);
  const temp = formatWeatherTempLabel(data, period);
  lunchWeatherMarker = L.marker([lat + 0.00055, lng + 0.00045], {
    icon: createWeatherPinIcon(emoji, temp),
    zIndexOffset: 2800,
  }).addTo(lunchMapInstance);
  lunchWeatherMarker.isWeather = true;
  lunchWeatherMarker.bindPopup(buildWeatherPopupHtml(data, period));
}

async function initLunchMapWeather() {
  if (typeof loadTodayWeather !== 'function') return;
  try {
    lunchWeatherData = await loadTodayWeather();
    if (!lunchWeatherData) return;
    const period = getWeatherPeriodNow(lunchWeatherData);
    renderLunchWeatherChip(lunchWeatherData, period);
    renderLunchWeatherMarker(lunchWeatherData);
    updateLunchMapRainEffect(lunchWeatherData);
  } catch (err) {
    console.warn('lunch weather:', err);
  }
}

function clearLunchMapMarkers() {
  lunchMapMarkers.forEach((marker) => marker.remove());
  lunchMapMarkers = [];
  if (lunchOfficeCircle) {
    lunchOfficeCircle.remove();
    lunchOfficeCircle = null;
  }
  if (lunchUserMarker) {
    lunchUserMarker.remove();
    lunchUserMarker = null;
  }
  if (lunchUserCircle) {
    lunchUserCircle.remove();
    lunchUserCircle = null;
  }
  if (lunchWeatherMarker) {
    lunchWeatherMarker.remove();
    lunchWeatherMarker = null;
  }
}

function zoomMapToUserLocation(loc, animate = true) {
  if (!lunchMapInstance || !loc) return;
  lunchMapInstance.setView([loc.lat, loc.lng], LUNCH_USER_ZOOM, { animate });
  lunchMapInitialViewDone = true;
}

function applyLunchMapFallbackView() {
  if (!lunchMapInstance || lunchMapInitialViewDone || !lunchMapData) return;
  lunchMapInitialViewDone = true;
  if (lunchMapData.office) {
    lunchMapInstance.setView([lunchMapData.office.lat, lunchMapData.office.lng], 16, { animate: false });
    return;
  }
  const boundsPoints = lunchMapData.places.map((p) => [p.displayLat ?? p.lat, p.displayLng ?? p.lng]);
  if (boundsPoints.length > 1) {
    lunchMapInstance.fitBounds(boundsPoints, { padding: [28, 28], maxZoom: LUNCH_USER_ZOOM });
  }
}

function applyInitialLunchMapView(data) {
  if (!lunchMapInstance || lunchMapInitialViewDone) return;
  const userLoc = typeof getStoredUserLocation === 'function' ? getStoredUserLocation() : null;
  if (userLoc) zoomMapToUserLocation(userLoc, false);
}

function renderLunchUserLocation(data) {
  if (!lunchMapInstance) return;
  const loc = data || (typeof getStoredUserLocation === 'function' ? getStoredUserLocation() : null);
  if (!loc) return;

  if (lunchUserMarker) lunchUserMarker.remove();
  if (lunchUserCircle) lunchUserCircle.remove();

  lunchUserMarker = L.marker([loc.lat, loc.lng], {
    icon: createUserLocationIcon(),
    zIndexOffset: 3000,
  }).addTo(lunchMapInstance);
  lunchUserMarker.isUser = true;
  lunchUserMarker.bindPopup('<div class="lunch-map-popup"><strong>내 위치</strong></div>');

  const accuracy = Number(loc.accuracy);
  if (accuracy > 0) {
    lunchUserCircle = L.circle([loc.lat, loc.lng], {
      radius: accuracy,
      color: '#16a34a',
      fillColor: '#22c55e',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(lunchMapInstance);
  }

  if (!lunchMapInitialViewDone) zoomMapToUserLocation(loc, false);
}

function focusLunchUserLocation() {
  if (!lunchMapInstance) return;
  const loc = typeof getStoredUserLocation === 'function' ? getStoredUserLocation() : null;
  if (!loc) {
    if (typeof requestUserLocation === 'function') requestUserLocation();
    return;
  }
  renderLunchUserLocation(loc);
  lunchMapInstance.setView([loc.lat, loc.lng], Math.max(lunchMapInstance.getZoom(), 17), { animate: true });
  lunchUserMarker?.openPopup();
}

function highlightLunchListItem(placeId) {
  document.querySelectorAll('.lunch-list-item').forEach((el) => {
    el.classList.toggle('lunch-list-item-picked', el.dataset.placeId === placeId);
  });
}

function formatLunchDistance(m) {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function getFilteredLunchPlaces() {
  if (!lunchMapData) return [];
  const filterEl = document.getElementById('lunchCategoryFilter');
  const selected = filterEl?.value || 'all';
  const searchEl = document.getElementById('lunchNameFilter');
  const query = (searchEl?.value || '').trim().toLowerCase();
  const favs = loadLunchFavorites();
  let places = lunchMapData.places;
  if (selected === 'favorites') {
    places = places.filter((p) => favs.has(p.id));
  } else if (selected !== 'all') {
    places = places.filter((p) => p.category === selected);
  }
  if (query) {
    places = places.filter((p) => p.name.toLowerCase().includes(query));
  }
  return [...places].sort((a, b) => {
    const af = favs.has(a.id) ? 0 : 1;
    const bf = favs.has(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    const da = a.distance_m ?? Infinity;
    const db = b.distance_m ?? Infinity;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, 'ko');
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRouletteDisplay(text, spinning = false) {
  const displayEl = document.getElementById('lunchRouletteDisplay');
  const wheelEl = document.getElementById('lunchRouletteWheel');
  if (displayEl) displayEl.textContent = text;
  wheelEl?.classList.toggle('lunch-roulette-wheel-spinning', spinning);
}

function saveLunchRouletteToday(placeId) {
  if (!placeId) return;
  localStorage.setItem(LUNCH_ROULETTE_DAY_KEY, JSON.stringify({ date: todayKey(), placeId }));
}

function tryRestoreLunchRouletteToday() {
  if (!lunchMapData?.places?.length) return false;
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(LUNCH_ROULETTE_DAY_KEY) || 'null');
  } catch {
    return false;
  }
  if (saved?.date !== todayKey() || !saved.placeId) return false;
  const place = lunchMapData.places.find((p) => p.id === saved.placeId);
  if (!place) return false;
  setRouletteDisplay(place.name, false);
  showRouletteResult(place, false);
  return true;
}

function showRouletteResult(place, persist = true) {
  const resultEl = document.getElementById('lunchRouletteResult');
  const nameEl = document.getElementById('lunchRouletteResultName');
  const metaEl = document.getElementById('lunchRouletteResultMeta');
  if (!resultEl || !place) return;

  lunchRouletteWinnerId = place.id;
  if (nameEl) nameEl.textContent = place.name;
  if (metaEl) {
    const parts = [place.category];
    if (place.signatureMenu) parts.push(place.signatureMenu);
    if (place.price) parts.push(place.price);
    metaEl.textContent = parts.join(' · ');
  }
  resultEl.classList.remove('hidden');
  if (persist) {
    saveLunchRouletteToday(place.id);
    setLunchDiaryFromRoulette(place.name);
  }
}

function hideRouletteResult() {
  document.getElementById('lunchRouletteResult')?.classList.add('hidden');
  lunchRouletteWinnerId = null;
}

async function spinLunchRoulette() {
  if (lunchRouletteSpinning) return;
  if (!lunchMapData) {
    await initLunchMap();
    if (!lunchMapData) return;
  }

  const pool = getFilteredLunchPlaces();
  if (!pool.length) {
    setRouletteDisplay('선택된 카테고리에 맛집이 없어요');
    return;
  }

  const btn = document.getElementById('btnLunchRoulette');
  lunchRouletteSpinning = true;
  if (btn) btn.disabled = true;
  hideRouletteResult();
  setRouletteDisplay('돌아가는 중…', true);

  const winner = pool[Math.floor(Math.random() * pool.length)];
  const totalSteps = 22 + Math.floor(Math.random() * 12);

  for (let i = 0; i < totalSteps; i += 1) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setRouletteDisplay(pick.name, true);
    await sleep(70 + i * 6);
  }

  setRouletteDisplay(winner.name, false);
  showRouletteResult(winner);
  highlightLunchListItem(winner.id);
  focusLunchPlace(winner.id);

  lunchRouletteSpinning = false;
  if (btn) btn.disabled = false;
}

function focusLunchPlace(placeId) {
  if (!lunchMapInstance || !lunchMapData) return;
  const place = lunchMapData.places.find((p) => p.id === placeId);
  if (!place) return;
  const lat = place.displayLat ?? place.lat;
  const lng = place.displayLng ?? place.lng;
  lunchMapInstance.setView([lat, lng], Math.max(lunchMapInstance.getZoom(), 17), { animate: true });
  const marker = lunchMapMarkers.find((m) => m.placeId === placeId);
  marker?.openPopup();
  highlightLunchListItem(placeId);
  document.querySelector(`.lunch-list-item[data-place-id="${placeId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function populateCategoryFilter(places) {
  const filterEl = document.getElementById('lunchCategoryFilter');
  if (!filterEl) return;
  const selected = filterEl.value;
  const categories = [...new Set(places.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'ko'));
  const favs = loadLunchFavorites();
  const favCount = [...new Set(places.filter((p) => favs.has(p.id)).map((p) => p.category))].length;
  const totalCount = places.length;
  filterEl.innerHTML = `<option value="all">전체 (${totalCount})</option><option value="favorites">⭐ 찜 (${favCount})</option>`;
  categories.forEach((cat) => {
    const cnt = places.filter((p) => p.category === cat).length;
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = `${cat} (${cnt})`;
    filterEl.appendChild(opt);
  });
  if ([...filterEl.options].some((opt) => opt.value === selected)) {
    filterEl.value = selected;
  }
}

function renderLunchList(data) {
  const listEl = document.getElementById('lunchList');
  if (!listEl) return;

  populateCategoryFilter(data.places);
  const filtered = getFilteredLunchPlaces();

  const favs = loadLunchFavorites();
  const headingEl = document.getElementById('lunchListHeading');
  if (headingEl) {
    const total = data.places?.length || 0;
    const favCount = favs.size;
    headingEl.textContent = favCount > 0 ? `주변 맛집 ${total}곳 · 찜 ${favCount}` : `주변 맛집 ${total}곳`;
  }
  listEl.innerHTML = filtered.map((place) => {
    const rating = formatRatingLabel(place.rating, place.ratingSource);
    const dist = formatLunchDistance(place.distance_m);
    const metaParts = [];
    if (dist) metaParts.push(`📍 ${dist}`);
    metaParts.push(place.category);
    if (place.price) metaParts.push(place.price);
    if (rating) metaParts.push(rating);
    const memo = place.signatureMenu || place.memo;
    const isFav = favs.has(place.id);
	const kakaoUrl = `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
	return `
	<div class="lunch-list-item-wrap">
		<button type="button" class="lunch-fav-btn${isFav ? ' is-fav' : ''}" data-fav-id="${place.id}" aria-label="${isFav ? '찜 해제' : '찜'}">${isFav ? '★' : '☆'}</button>
          <button type="button" class="lunch-list-item${place.id === lunchRouletteWinnerId ? ' lunch-list-item-picked' : ''}" data-place-id="${place.id}">
			<span class="lunch-list-name">${place.name}</span>
			<span class="lunch-list-meta">${metaParts.join(' · ')}</span>
			${memo ? `<span class="lunch-list-memo">${memo}</span>` : ''}
		</button>
		<a href="${kakaoUrl}" target="_blank" rel="noopener noreferrer" class="lunch-dir-btn" title="카카오맵 길찾기" aria-label="카카오맵 길찾기">🗺️</a>
	</div>
	`;
  }).join('');

  listEl.querySelectorAll('.lunch-fav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLunchFavorite(btn.dataset.favId);
      if (lunchMapData) renderLunchList(lunchMapData);
    });
  });
  listEl.querySelectorAll('.lunch-list-item').forEach((btn) => {
    btn.addEventListener('click', () => focusLunchPlace(btn.dataset.placeId));
  });
}

function renderLunchMapMarkers(data) {
  if (!lunchMapInstance) return;
  clearLunchMapMarkers();

  if (data.office) {
    const officeLabel = getOfficeShortName(data.office.name);
    lunchOfficeCircle = L.circle([data.office.lat, data.office.lng], {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      radius: getLunchRadiusM(data),
      weight: 2,
      dashArray: '6 4',
    }).addTo(lunchMapInstance);

    const officeMarker = L.marker([data.office.lat, data.office.lng], {
      icon: createOfficePinIcon(officeLabel),
      zIndexOffset: 2500,
    }).addTo(lunchMapInstance);
    officeMarker.bindPopup(`
      <div class="lunch-map-popup lunch-map-popup-office">
        <strong>${officeLabel}</strong>
        <p class="lunch-map-popup-memo">📍 우리 회사 (기준점)</p>
        ${data.meta?.anchor?.includes('(') ? `<p class="lunch-map-popup-address">${data.meta.anchor.match(/\(([^)]+)\)/)?.[1] || ''}</p>` : ''}
      </div>
    `);
    officeMarker.isOffice = true;
    lunchMapMarkers.push(officeMarker);
  }

  data.places.forEach((place) => {
    const lat = place.displayLat ?? place.lat;
    const lng = place.displayLng ?? place.lng;
    const marker = L.marker([lat, lng], {
      icon: createPlacePinIcon(place),
      zIndexOffset: 500,
    }).addTo(lunchMapInstance);
    marker.placeId = place.id;
    marker.bindPopup(buildPopupHtml(place));
    marker.on('click', () => {
      document.querySelector(`.lunch-list-item[data-place-id="${place.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    lunchMapMarkers.push(marker);
  });

  renderLunchUserLocation();
  applyInitialLunchMapView(data);
}

function setLunchMapStatus(message, isError = false) {
  const el = document.getElementById('lunchMapStatus');
  const retryBtn = document.getElementById('btnLunchMapRetry');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('lunch-map-status-error', isError);
  el.classList.remove('hidden');
  retryBtn?.classList.toggle('hidden', !isError);
}

function hideLunchMapStatus() {
  document.getElementById('lunchMapStatus')?.classList.add('hidden');
  document.getElementById('btnLunchMapRetry')?.classList.add('hidden');
}

async function initLunchMap(force = false) {
  if (typeof L === 'undefined') {
    setLunchMapStatus('지도 라이브러리를 불러오지 못했습니다.', true);
    return;
  }

  if (lunchMapReady && !force) {
    requestAnimationFrame(() => lunchMapInstance?.invalidateSize());
    return;
  }
  if (lunchMapLoading) return;

  const mapEl = document.getElementById('lunchMap');
  if (!mapEl) return;

  lunchMapLoading = true;
  setLunchMapStatus('맛집 지도 불러오는 중…');

  try {
    fixLeafletIconPaths();
    if (force) lunchMapData = null;
    const data = await loadLunchMapData();
    const cfg = getLunchMapConfig();
    const zoom = Number(cfg.defaultZoom) || 16;
    const center = getMapCenter(data);

    let bootUserLoc = typeof getStoredUserLocation === 'function' ? getStoredUserLocation() : null;
    if (!bootUserLoc && typeof requestUserLocation === 'function') {
      bootUserLoc = await requestUserLocation();
    }
    const initialCenter = bootUserLoc ? [bootUserLoc.lat, bootUserLoc.lng] : center;
    const initialZoom = bootUserLoc ? LUNCH_USER_ZOOM : zoom;
    if (bootUserLoc) lunchMapInitialViewDone = true;

    if (!lunchMapInstance) {
      lunchMapInstance = L.map(mapEl, {
        scrollWheelZoom: true,
        zoomControl: true,
      }).setView(initialCenter, initialZoom);

      L.tileLayer(OSM_TILE_URL, {
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION,
      }).addTo(lunchMapInstance);
    } else {
      lunchMapInstance.setView(initialCenter, initialZoom);
    }

    updateLunchMapDesc(data);
    renderLunchMapMarkers(data);
    renderLunchList(data);
    tryRestoreLunchRouletteToday();
    lunchMapReady = true;
    hideLunchMapStatus();
    initLunchMapWeather();

    requestAnimationFrame(() => {
      lunchMapInstance?.invalidateSize();
      applyInitialLunchMapView(data);
    });
  } catch (err) {
    console.warn('lunch map:', err);
    setLunchMapStatus(err.message || '지도를 표시할 수 없습니다.', true);
  } finally {
    lunchMapLoading = false;
  }
}

function handleLunchCategoryFilter() {
  if (!lunchMapData) return;
  if (!tryRestoreLunchRouletteToday()) {
    setRouletteDisplay('버튼을 눌러 오늘 점심을 정해요');
  }
  renderLunchList(lunchMapData);
}

function focusLunchOffice() {
  if (!lunchMapInstance || !lunchMapData?.office) return;
  const { lat, lng, name } = lunchMapData.office;
  lunchMapInstance.setView([lat, lng], 17, { animate: true });
  const officeMarker = lunchMapMarkers.find((m) => m.isOffice);
  officeMarker?.openPopup();
}

function bindLunchSheetControls() {
  const sheet = document.getElementById('lunchFloatBottom');
  const handle = document.getElementById('lunchSheetHandle');
  if (!sheet || !handle) return;

  const updateSheetAria = () => {
    const expanded = !sheet.classList.contains('is-collapsed');
    handle.setAttribute('aria-expanded', String(expanded));
    handle.setAttribute('aria-label', expanded ? '맛집 패널 접기' : '맛집 패널 펼치기');
  };

  const setSheetCollapsed = (collapsed) => {
    sheet.classList.toggle('is-collapsed', collapsed);
    updateSheetAria();
    requestAnimationFrame(() => lunchMapInstance?.invalidateSize());
  };

  let dragStartY = null;
  let dragMoved = false;

  const finishDrag = (clientY) => {
    if (dragStartY == null) return;
    const delta = clientY - dragStartY;
    if (!dragMoved) {
      setSheetCollapsed(!sheet.classList.contains('is-collapsed'));
    } else if (delta > 40) {
      setSheetCollapsed(true);
    } else if (delta < -40) {
      setSheetCollapsed(false);
    }
    dragStartY = null;
    dragMoved = false;
  };

  handle.addEventListener('pointerdown', (e) => {
    dragStartY = e.clientY;
    dragMoved = false;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (dragStartY == null) return;
    if (Math.abs(e.clientY - dragStartY) > 8) dragMoved = true;
  });

  handle.addEventListener('pointerup', (e) => finishDrag(e.clientY));
  handle.addEventListener('pointercancel', (e) => finishDrag(e.clientY));

  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSheetCollapsed(!sheet.classList.contains('is-collapsed'));
    }
  });

  updateSheetAria();
}

function bindLunchMapControls() {
  document.getElementById('lunchCategoryFilter')?.addEventListener('change', handleLunchCategoryFilter);
  document.getElementById('lunchNameFilter')?.addEventListener('input', handleLunchCategoryFilter);
  document.getElementById('btnLunchRoulette')?.addEventListener('click', spinLunchRoulette);
  document.getElementById('btnLunchRouletteMap')?.addEventListener('click', () => {
    if (lunchRouletteWinnerId) focusLunchPlace(lunchRouletteWinnerId);
  });
  document.getElementById('btnLunchFocusOffice')?.addEventListener('click', focusLunchOffice);
  document.getElementById('btnLunchMapRetry')?.addEventListener('click', () => {
    lunchMapReady = false;
    initLunchMap(true);
  });
}

bindLunchMapControls();
bindLunchSheetControls();
initLunchDiary();
initLunchDiaryHistory();

const LUNCH_ROULETTE_NOTIFY_HOUR = 11;
const LUNCH_ROULETTE_NOTIFY_MINUTE = 20;
const LUNCH_ROULETTE_NOTIFY_WINDOW_MIN = 5;

function checkLunchRouletteNotify() {
  const settings = typeof loadSettings === 'function' ? loadSettings() : {};
  if (settings.lunchRouletteNotify === false) return;

  const now = new Date();
  if (now.getHours() !== LUNCH_ROULETTE_NOTIFY_HOUR) return;
  const minute = now.getMinutes();
  if (minute < LUNCH_ROULETTE_NOTIFY_MINUTE || minute >= LUNCH_ROULETTE_NOTIFY_MINUTE + LUNCH_ROULETTE_NOTIFY_WINDOW_MIN) {
    return;
  }

  const key = `${todayKey()}-lunch-roulette-11-20`;
  if (typeof wasNotified === 'function' && wasNotified(key)) return;

  if (typeof markNotified === 'function') markNotified(key);
  if (typeof sendNotification === 'function') {
    sendNotification(
      '🎰 점심 룰렛',
      '11시 30분 점심! 오늘 뭐 먹을지 룰렛을 돌려보세요',
      'lunch-roulette-reminder',
      './?tab=lunch',
    );
  }
}

function consumeLunchDeepLink() {
  consumeTabDeepLink('lunch');
}
