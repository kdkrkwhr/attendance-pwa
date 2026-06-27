/**
 * AI 채팅 — 현재 위치 (Geolocation + Leaflet 미니 지도)
 */
const USER_LOC_KEY = 'attendance-user-location';
const USER_LOC_MAX_AGE_MS = 30 * 60_000;

let userLocMap = null;
let userLocMarker = null;
let userLocCircle = null;
let userLocPending = false;
let userLocationInited = false;

function fixUserLocLeafletIcons() {
  if (typeof L === 'undefined') return;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: './vendor/leaflet/images/marker-icon-2x.png',
    iconUrl: './vendor/leaflet/images/marker-icon.png',
    shadowUrl: './vendor/leaflet/images/marker-shadow.png',
  });
}

function loadStoredUserLocation() {
  try {
    const raw = sessionStorage.getItem(USER_LOC_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;
    if (data.at && Date.now() - new Date(data.at).getTime() > USER_LOC_MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveStoredUserLocation(data) {
  sessionStorage.setItem(USER_LOC_KEY, JSON.stringify({
    ...data,
    at: new Date().toISOString(),
  }));
}

function getStoredUserLocation() {
  return loadStoredUserLocation();
}

function formatCoords(lat, lng, accuracy) {
  const acc = accuracy != null ? ` · ±${Math.round(accuracy)}m` : '';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}${acc}`;
}

function setLocationUI(state, data) {
  const coordsEl = document.getElementById('chatLocationCoords');
  const card = document.getElementById('chatLocationCard');
  const btn = document.getElementById('btnChatLocation');
  card?.classList.remove('hidden');

  if (state === 'loading') {
    if (coordsEl) coordsEl.textContent = '위치 확인 중…';
    if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
    return;
  }
  if (state === 'error') {
    if (coordsEl) coordsEl.textContent = data?.message || '위치를 가져오지 못했습니다';
    if (btn) { btn.disabled = false; btn.textContent = '다시 시도'; }
    return;
  }
  if (state === 'ok' && data) {
    if (coordsEl) coordsEl.textContent = formatCoords(data.lat, data.lng, data.accuracy);
    if (btn) { btn.disabled = false; btn.textContent = '새로고침'; }
  }
}

function createUserPinIcon() {
  return L.divIcon({
    className: 'chat-loc-pin',
    html: '<span class="chat-loc-pin-dot" aria-hidden="true"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function updateUserLocationMap(lat, lng, accuracy) {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('chatLocationMap');
  if (!mapEl) return;

  fixUserLocLeafletIcons();

  if (!userLocMap) {
    userLocMap = L.map(mapEl, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(userLocMap);
  }

  if (userLocMarker) userLocMarker.remove();
  if (userLocCircle) userLocCircle.remove();

  userLocMarker = L.marker([lat, lng], { icon: createUserPinIcon(), zIndexOffset: 1000 }).addTo(userLocMap);
  userLocMarker.bindPopup('현재 위치');

  if (accuracy > 0) {
    userLocCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1,
    }).addTo(userLocMap);
  }

  const pad = Math.max(accuracy || 80, 80);
  userLocMap.fitBounds(
    [[lat - pad / 111320, lng - pad / (111320 * Math.cos((lat * Math.PI) / 180))],
      [lat + pad / 111320, lng + pad / (111320 * Math.cos((lat * Math.PI) / 180))]],
    { maxZoom: 17, padding: [16, 16] },
  );

  requestAnimationFrame(() => userLocMap?.invalidateSize());
}

function geolocationErrorMessage(code) {
  if (code === 1) return '위치 권한이 거부됐습니다. 브라우저 설정에서 허용해 주세요.';
  if (code === 2) return '위치를 확인할 수 없습니다.';
  if (code === 3) return '위치 요청 시간이 초과됐습니다.';
  return '위치 오류';
}

function requestUserLocation() {
  if (userLocPending) return Promise.resolve(getStoredUserLocation());
  if (!navigator.geolocation) {
    setLocationUI('error', { message: '이 기기는 위치 서비스를 지원하지 않습니다.' });
    return Promise.resolve(null);
  }

  userLocPending = true;
  setLocationUI('loading');

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const data = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        saveStoredUserLocation(data);
        setLocationUI('ok', data);
        updateUserLocationMap(data.lat, data.lng, data.accuracy);
        userLocPending = false;
        resolve(data);
      },
      (err) => {
        setLocationUI('error', { message: geolocationErrorMessage(err?.code) });
        userLocPending = false;
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

function initUserLocation(forceRefresh = false) {
  if (!document.getElementById('chatLocationMap')) return;

  bindUserLocationControls();

  if (!forceRefresh) {
    const stored = loadStoredUserLocation();
    if (stored) {
      setLocationUI('ok', stored);
      updateUserLocationMap(stored.lat, stored.lng, stored.accuracy);
      return;
    }
  }

  requestUserLocation();
}

function bindUserLocationControls() {
  if (userLocationInited) return;
  userLocationInited = true;
  document.getElementById('btnChatLocation')?.addEventListener('click', () => {
    requestUserLocation();
  });
}

function appendLocationToChatMessage(text) {
  const loc = getStoredUserLocation();
  if (!loc) return text;
  return `${text}\n\n출발:${loc.lat},${loc.lng}`;
}
