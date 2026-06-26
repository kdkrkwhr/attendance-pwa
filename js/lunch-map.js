/**
 * Fun 탭 — 점심 맛집 지도 (Leaflet + OpenStreetMap, API 키 없음)
 * 데이터: data/restaurants.json
 */
const LUNCH_MAP_DATA_URL = './data/restaurants.json';
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

function normalizeRestaurantData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const places = Array.isArray(raw.places) ? raw.places : Array.isArray(raw) ? raw : [];
  const office = raw.office && Number.isFinite(raw.office.lat) && Number.isFinite(raw.office.lng)
    ? raw.office
    : null;

  const normalized = places
    .map((place, index) => {
      const lat = Number(place.lat ?? place.latitude);
      const lng = Number(place.lng ?? place.longitude ?? place.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: String(place.id || `place-${index}`),
        name: String(place.name || '이름 없음'),
        category: String(place.category || '기타'),
        lat,
        lng,
        tags: Array.isArray(place.tags) ? place.tags : [],
        memo: String(place.memo || place.note || ''),
        price: String(place.price || ''),
      };
    })
    .filter(Boolean);

  return { office, places: normalized };
}

async function loadLunchMapData() {
  if (lunchMapData) return lunchMapData;
  const res = await fetch(LUNCH_MAP_DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`맛집 데이터를 불러오지 못했습니다 (${res.status})`);
  const raw = await res.json();
  lunchMapData = normalizeRestaurantData(raw);
  if (!lunchMapData?.places?.length) {
    throw new Error('표시할 맛집 좌표가 없습니다. data/restaurants.json 을 확인해 주세요.');
  }
  return lunchMapData;
}

function buildPopupHtml(place) {
  const tags = place.tags.length
    ? `<p class="lunch-map-popup-tags">${place.tags.map((t) => `#${t}`).join(' ')}</p>`
    : '';
  const memo = place.memo ? `<p class="lunch-map-popup-memo">${place.memo}</p>` : '';
  const price = place.price ? `<p class="lunch-map-popup-price">${place.price}</p>` : '';
  return `
    <div class="lunch-map-popup">
      <strong>${place.name}</strong>
      <span class="lunch-map-popup-cat">${place.category}</span>
      ${price}
      ${memo}
      ${tags}
    </div>
  `;
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

function renderLunchList(data) {
  const listEl = document.getElementById('lunchList');
  if (!listEl) return;

  const categories = [...new Set(data.places.map((p) => p.category))];
  const filterEl = document.getElementById('lunchCategoryFilter');
  if (filterEl && filterEl.options.length <= 1) {
    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      filterEl.appendChild(opt);
    });
  }

  const selected = filterEl?.value || 'all';
  const filtered = selected === 'all'
    ? data.places
    : data.places.filter((p) => p.category === selected);

  listEl.innerHTML = filtered.map((place) => `
    <button type="button" class="lunch-list-item" data-place-id="${place.id}">
      <span class="lunch-list-name">${place.name}</span>
      <span class="lunch-list-meta">${place.category}${place.price ? ` · ${place.price}` : ''}</span>
      ${place.memo ? `<span class="lunch-list-memo">${place.memo}</span>` : ''}
    </button>
  `).join('');

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
    lunchMapData = null;
    lunchMapReady = false;
    initLunchMap(true);
  });
}

bindLunchMapControls();
