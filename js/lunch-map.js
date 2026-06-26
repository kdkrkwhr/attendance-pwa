/**
 * Fun 탭 — 점심 맛집 지도 (Leaflet + OpenStreetMap, API 키 없음)
 * 데이터: data/dmc_restaurants.json
 */
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

let lunchMapInstance = null;
let lunchMapMarkers = [];
let lunchMapData = null;
let lunchMapReady = false;
let lunchMapLoading = false;

function getLunchMapConfig() {
  return window.APP_CONFIG?.lunchMap || {};
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
        name: meta.anchor || 'DMC첨단타워',
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

  const places = sourcePlaces
    .map((place, index) => normalizePlace(place, index, 'dmc'))
    .filter(Boolean);

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
  descEl.textContent = `${anchor} · ${data.places.length}곳`;
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
}

function focusLunchPlace(placeId) {
  if (!lunchMapInstance || !lunchMapData) return;
  const place = lunchMapData.places.find((p) => p.id === placeId);
  if (!place) return;
  lunchMapInstance.setView([place.lat, place.lng], Math.max(lunchMapInstance.getZoom(), 17), { animate: true });
  const marker = lunchMapMarkers.find((m) => m.placeId === placeId);
  marker?.openPopup();
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
    <button type="button" class="lunch-list-item" data-place-id="${place.id}">
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
    const officeMarker = L.marker([data.office.lat, data.office.lng], {
      icon: createEmojiIcon('🏢', 'lunch-map-pin-office'),
      zIndexOffset: 1000,
    }).addTo(lunchMapInstance);
    officeMarker.bindPopup(`<strong>${data.office.name || '회사'}</strong>`);
    lunchMapMarkers.push(officeMarker);
  }

  data.places.forEach((place) => {
    const marker = L.marker([place.lat, place.lng], {
      icon: createEmojiIcon('🍽️', 'lunch-map-pin-place'),
    }).addTo(lunchMapInstance);
    marker.placeId = place.id;
    marker.bindPopup(buildPopupHtml(place));
    marker.on('click', () => {
      document.querySelector(`.lunch-list-item[data-place-id="${place.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    lunchMapMarkers.push(marker);
  });

  const boundsPoints = [];
  if (data.office) boundsPoints.push([data.office.lat, data.office.lng]);
  data.places.forEach((p) => boundsPoints.push([p.lat, p.lng]));
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
    lunchMapInstance?.invalidateSize();
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
        const boundsPoints = data.places.map((p) => [p.lat, p.lng]);
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
  renderLunchList(lunchMapData);
}

function bindLunchMapControls() {
  document.getElementById('lunchCategoryFilter')?.addEventListener('change', handleLunchCategoryFilter);
  document.getElementById('btnLunchMapRetry')?.addEventListener('click', () => {
    lunchMapReady = false;
    initLunchMap(true);
  });
}

bindLunchMapControls();
