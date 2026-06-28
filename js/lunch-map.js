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

function createEmojiIcon(emoji, className) {
  return L.divIcon({
    className: `lunch-map-pin ${className}`,
    html: `<span class="lunch-map-pin-emoji">${emoji}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 28],
    popupAnchor: [0, -24],
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
    className: 'lunch-map-pin-user-wrap',
    html: `
      <div class="user-pin" role="img" aria-label="내 위치">
        <span class="user-pin-ring" aria-hidden="true"></span>
        <span class="user-pin-dot" aria-hidden="true"></span>
        <span class="user-pin-label">내 위치</span>
      </div>
    `,
    iconSize: [96, 68],
    iconAnchor: [48, 50],
    popupAnchor: [0, -44],
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

function getFilteredLunchPlaces() {
  if (!lunchMapData) return [];
  const filterEl = document.getElementById('lunchCategoryFilter');
  const selected = filterEl?.value || 'all';
  return selected === 'all'
    ? lunchMapData.places
    : lunchMapData.places.filter((p) => p.category === selected);
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

function showRouletteResult(place) {
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
  filterEl.innerHTML = '<option value="all">전체</option>';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
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

  const filterEl = document.getElementById('lunchCategoryFilter');
  const selected = filterEl?.value || 'all';
  const filtered = selected === 'all'
    ? data.places
    : data.places.filter((p) => p.category === selected);

  listEl.innerHTML = filtered.map((place) => {
    const rating = formatRatingLabel(place.rating, place.ratingSource);
    const metaParts = [place.category];
    if (place.price) metaParts.push(place.price);
    if (rating) metaParts.push(rating);
    const memo = place.signatureMenu || place.memo;
    return `
    <button type="button" class="lunch-list-item${place.id === lunchRouletteWinnerId ? ' lunch-list-item-picked' : ''}" data-place-id="${place.id}">
      <span class="lunch-list-name">${place.name}</span>
      <span class="lunch-list-meta">${metaParts.join(' · ')}</span>
      ${memo ? `<span class="lunch-list-memo">${memo}</span>` : ''}
    </button>
  `;
  }).join('');

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

  const boundsPoints = [];
  if (data.office) boundsPoints.push([data.office.lat, data.office.lng]);
  data.places.forEach((p) => boundsPoints.push([p.displayLat ?? p.lat, p.displayLng ?? p.lng]));
  const userLoc = typeof getStoredUserLocation === 'function' ? getStoredUserLocation() : null;
  if (userLoc) boundsPoints.push([userLoc.lat, userLoc.lng]);
  if (boundsPoints.length > 1) {
    lunchMapInstance.fitBounds(boundsPoints, { padding: [28, 28], maxZoom: 17 });
  }
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

    if (!lunchMapInstance) {
      lunchMapInstance = L.map(mapEl, {
        scrollWheelZoom: true,
        zoomControl: true,
      }).setView(center, zoom);

      L.tileLayer(OSM_TILE_URL, {
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION,
      }).addTo(lunchMapInstance);
    } else {
      lunchMapInstance.setView(center, zoom);
    }

    updateLunchMapDesc(data);
    renderLunchMapMarkers(data);
    renderLunchList(data);
    lunchMapReady = true;
    hideLunchMapStatus();

    requestAnimationFrame(() => {
      lunchMapInstance?.invalidateSize();
      if (data.places.length > 0) {
        const boundsPoints = data.places.map((p) => [p.displayLat ?? p.lat, p.displayLng ?? p.lng]);
        if (data.office) boundsPoints.push([data.office.lat, data.office.lng]);
        if (boundsPoints.length > 1) {
          lunchMapInstance.fitBounds(boundsPoints, { padding: [28, 28], maxZoom: 17 });
        }
      }
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
  hideRouletteResult();
  setRouletteDisplay('버튼을 눌러 오늘 점심을 정해요');
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
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab === 'lunch' && typeof switchTab === 'function') {
    switchTab('lunch');
    params.delete('tab');
    const qs = params.toString();
    const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    history.replaceState({}, '', cleanUrl);
  }
}
