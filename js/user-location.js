/**
 * 현재 위치 (Geolocation + sessionStorage) — 맛집 지도에 표시
 */
const USER_LOC_KEY = 'attendance-user-location';
const USER_LOC_MAX_AGE_MS = 30 * 60_000;

let userLocPending = false;
let userLocationInited = false;

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
  const coordsEl = document.getElementById('lunchLocationCoords');
  const btn = document.getElementById('btnLunchLocation');

  if (state === 'loading') {
    if (coordsEl) {
      coordsEl.textContent = '위치 확인 중…';
      coordsEl.classList.remove('hidden');
    }
    if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
    return;
  }
  if (state === 'error') {
    if (coordsEl) {
      coordsEl.textContent = data?.message || '위치를 가져오지 못했습니다';
      coordsEl.classList.remove('hidden');
    }
    if (btn) { btn.disabled = false; btn.textContent = '📍 내 위치'; }
    return;
  }
  if (state === 'ok' && data) {
    if (coordsEl) {
      coordsEl.textContent = formatCoords(data.lat, data.lng, data.accuracy);
      coordsEl.classList.remove('hidden');
    }
    if (btn) { btn.disabled = false; btn.textContent = '📍 내 위치'; }
  }
}

function notifyUserLocationUpdated(data) {
  if (typeof renderLunchUserLocation === 'function') renderLunchUserLocation(data);
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
        notifyUserLocationUpdated(data);
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
  if (!document.getElementById('btnLunchLocation')) return;

  bindUserLocationControls();

  if (!forceRefresh) {
    const fromUrl = consumeUserLocationFromUrl();
    if (fromUrl) {
      setLocationUI('ok', fromUrl);
      notifyUserLocationUpdated(fromUrl);
      return;
    }
    const stored = loadStoredUserLocation();
    if (stored) {
      setLocationUI('ok', stored);
      notifyUserLocationUpdated(stored);
      return;
    }
  }

  requestUserLocation();
}

function bindUserLocationControls() {
  if (userLocationInited) return;
  userLocationInited = true;
  document.getElementById('btnLunchLocation')?.addEventListener('click', () => {
    const stored = getStoredUserLocation();
    if (stored && typeof focusLunchUserLocation === 'function') {
      focusLunchUserLocation();
      return;
    }
    requestUserLocation().then((data) => {
      if (data && typeof focusLunchUserLocation === 'function') focusLunchUserLocation();
    });
  });
}

function consumeUserLocationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('user_lat'));
  const lng = parseFloat(params.get('user_lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const data = { lat, lng, accuracy: null };
  saveStoredUserLocation(data);
  params.delete('user_lat');
  params.delete('user_lng');
  const qs = params.toString();
  const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', cleanUrl);
  return data;
}
