const STORAGE_KEY = 'attendance-records';
const SETTINGS_KEY = 'attendance-settings';
const NOTIFIED_KEY = 'attendance-notified';
const WIFI_SUGGEST_KEY = 'attendance-wifi-suggest';
const NETWORK_MORNING_STATE_KEY = 'attendance-network-morning-state';
const FIELD_MODE_PENDING_KEY = 'attendance-field-pending';

/** 8시간 근무 + 점심 1시간 (고정) */
const WORK_HOURS = 8;
const LUNCH_MINUTES = 60;
const DAY_SPAN_MINUTES = WORK_HOURS * 60 + LUNCH_MINUTES;

/** 배포 시 sw.js CACHE_NAME·index.html ?v= 와 함께 올려 주세요 */
const APP_BUILD = '75';
const APP_VERSION_KEY = 'attendance-app-version';

const DEFAULT_SETTINGS = {
  notifyBefore: '30,10,0',
  userName: '',
  sheetUrl: '',
  theme: 'system',
  fortuneNotify: true,
  lunchRouletteNotify: true,
  birthDate: '',
  hermesBaseUrl: '',
  hermesApiKey: '',
  hermesModel: 'hermes-agent',
  homeAddress: '',
  commuteNotify: true,
};

let tickInterval = null;
let deferredInstallPrompt = null;
let checkInInputFocused = false;
let checkInInputTouched = false;
let checkInTimeDirty = false;
let onCompanyNetwork = null;
let networkCheckAt = 0;
let morningPollInterval = null;
const NETWORK_CACHE_MS = 60_000;

// ── 회사 네트워크 ──────────────────────────────────────────

function getNetworkConfig() {
  return window.APP_CONFIG?.networkGuard || { enabled: false, allowedPublicIps: [] };
}

function isNetworkGuardActive() {
  const cfg = getNetworkConfig();
  const ips = normalizeAllowedIps(cfg.allowedPublicIps);
  return cfg.enabled && ips.length > 0;
}

function normalizeAllowedIps(value) {
  if (Array.isArray(value)) {
    return value.map((ip) => String(ip).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((ip) => ip.trim()).filter(Boolean);
  }
  return [];
}

async function fetchCurrentPublicIp() {
  const sources = [
    async () => {
      const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      const data = await res.json();
      return data.ip;
    },
    async () => {
      const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
      const text = await res.text();
      const line = text.split('\n').find((row) => row.startsWith('ip='));
      return line?.split('=')[1]?.trim();
    },
  ];

  let lastError;
  for (const source of sources) {
    try {
      const ip = await source();
      if (ip) return ip;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('IP 확인 실패');
}

async function checkCompanyNetwork(force = false) {
  if (!isNetworkGuardActive()) {
    onCompanyNetwork = true;
    return true;
  }

  const now = Date.now();
  if (!force && onCompanyNetwork !== null && now - networkCheckAt < NETWORK_CACHE_MS) {
    return onCompanyNetwork;
  }

  const allowed = normalizeAllowedIps(getNetworkConfig().allowedPublicIps);
  try {
    const currentIp = await fetchCurrentPublicIp();
    onCompanyNetwork = allowed.includes(currentIp);
    networkCheckAt = now;
    window.__lastPublicIp = currentIp;
    return onCompanyNetwork;
  } catch {
    onCompanyNetwork = false;
    networkCheckAt = now;
    return false;
  }
}

function updateNetworkStatusUI() {
  const el = document.getElementById('networkStatus');
  if (!el) return;

  if (isFieldWorkToday() && isNetworkGuardActive()) {
    el.textContent = '외근 모드 · 회사 Wi-Fi 제한 없음';
    el.className = 'network-banner field';
    return;
  }

  if (!isNetworkGuardActive()) {
    el.textContent = '회사 Wi-Fi 제한: 미설정 (config.js)';
    el.className = 'network-banner warn';
    return;
  }

  if (onCompanyNetwork === null) {
    el.textContent = '네트워크 확인 중…';
    el.className = 'network-banner';
    return;
  }

  if (onCompanyNetwork) {
    el.textContent = `회사 네트워크 연결됨 (${window.__lastPublicIp || '확인됨'})`;
    el.className = 'network-banner ok';
    return;
  }

  el.textContent = '회사 Wi-Fi에서만 출퇴근 가능';
  el.className = 'network-banner blocked';
}

function setAttendanceButtonsEnabled(enabled) {
  ['btnCheckIn', 'btnSaveCheckIn', 'btnCheckOut'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn && !btn.classList.contains('hidden')) {
      btn.disabled = !enabled;
    }
  });
}

async function requireCompanyNetwork() {
  if (isFieldWorkToday()) {
    updateNetworkStatusUI();
    setAttendanceButtonsEnabled(true);
    return true;
  }

  const ok = await checkCompanyNetwork(true);
  updateNetworkStatusUI();
  setAttendanceButtonsEnabled(ok || !isNetworkGuardActive());

  if (!isNetworkGuardActive()) return true;

  if (!ok) {
    alert('회사 Wi-Fi에 연결된 후 출퇴근할 수 있습니다.\n외근이면 「오늘 외근」을 켜 주세요.');
    return false;
  }
  return true;
}

async function refreshNetworkGuard() {
  const previous = onCompanyNetwork;
  await checkCompanyNetwork(true);
  updateNetworkStatusUI();
  const canAttend = onCompanyNetwork || !isNetworkGuardActive() || isFieldWorkToday();
  setAttendanceButtonsEnabled(canAttend);
  evaluateMorningNetworkCheckIn(previous, onCompanyNetwork);
  syncMorningNetworkPolling();
}

// ── 외근 모드 ──────────────────────────────────────────

function loadFieldModePending() {
  try {
    const pending = JSON.parse(localStorage.getItem(FIELD_MODE_PENDING_KEY) || 'null');
    if (!pending || pending.dayKey !== todayKey()) return null;
    return pending;
  } catch {
    return null;
  }
}

function saveFieldModePending(enabled) {
  if (enabled) {
    localStorage.setItem(FIELD_MODE_PENDING_KEY, JSON.stringify({
      dayKey: todayKey(),
      enabled: true,
    }));
  } else {
    localStorage.removeItem(FIELD_MODE_PENDING_KEY);
  }
}

function isFieldWorkToday() {
  const record = getTodayRecord();
  if (record?.fieldWork) return true;
  return !!loadFieldModePending()?.enabled;
}

function hideFieldMemoForm() {
  document.getElementById('fieldMemoBox')?.classList.add('hidden');
  document.getElementById('btnCheckOut')?.classList.remove('hidden');
  const input = document.getElementById('fieldMemoInput');
  if (input) input.value = '';
}

function showFieldMemoForm() {
  document.getElementById('fieldMemoBox')?.classList.remove('hidden');
  document.getElementById('btnCheckOut')?.classList.add('hidden');
  document.getElementById('fieldMemoInput')?.focus();
}

function handleFieldWorkToggle() {
  const toggle = document.getElementById('fieldWorkToggle');
  const enabled = !!toggle?.checked;
  const record = getTodayRecord();

  if (record?.checkOut) {
    if (toggle) toggle.checked = !!record.fieldWork;
    return;
  }

  if (record?.checkIn) {
    const updated = { ...record, fieldWork: enabled };
    if (!enabled) {
      delete updated.fieldMemo;
      hideFieldMemoForm();
    }
    saveTodayRecord(updated);
  } else {
    saveFieldModePending(enabled);
  }

  updateNetworkStatusUI();
  refreshNetworkGuard();
  renderToday();
}

async function completeCheckOut(record, fieldMemo = '') {
  if (!(await requireCompanyNetwork())) return;

  const updated = {
    ...record,
    checkOut: new Date().toISOString(),
  };

  if (record.fieldWork) {
    updated.fieldMemo = fieldMemo.trim();
  }

  saveTodayRecord(updated);
  hideFieldMemoForm();

  render();
  const settings = loadSettings();
  if (settings.sheetUrl) {
    syncRecordToSheet(todayKey(), getTodayRecord()).then((r) => {
      if (r.ok) setSyncStatus('팀 시트에 퇴근 저장됨', 'ok');
      loadTeamWeek();
    }).catch(() => {});
  }
}

async function handleFieldCheckOut() {
  const record = getTodayRecord();
  if (!record?.checkIn || record.checkOut) return;

  const memo = document.getElementById('fieldMemoInput')?.value?.trim() || '';
  if (!memo) {
    if (!confirm('외근 메모 없이 퇴근할까요?')) return;
  }

  await completeCheckOut(record, memo);
}

function handleFieldMemoCancel() {
  hideFieldMemoForm();
}

function getMorningDetectConfig() {
  return window.APP_CONFIG?.morningCheckInDetect || { enabled: false };
}

function isMorningCheckInWindow(now = new Date()) {
  const cfg = getMorningDetectConfig();
  if (!cfg.enabled) return false;
  const startHour = cfg.startHour ?? 8;
  const endHour = cfg.endHour ?? 10;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= startHour * 60 && mins < (endHour + 1) * 60;
}

function loadNetworkMorningState() {
  try {
    const state = JSON.parse(localStorage.getItem(NETWORK_MORNING_STATE_KEY) || '{}');
    if (state.dayKey !== todayKey()) {
      return {
        dayKey: todayKey(),
        wasOnCompany: null,
        suggested: false,
        dismissed: false,
        notified: false,
      };
    }
    return state;
  } catch {
    return {
      dayKey: todayKey(),
      wasOnCompany: null,
      suggested: false,
      dismissed: false,
      notified: false,
    };
  }
}

function saveNetworkMorningState(state) {
  localStorage.setItem(NETWORK_MORNING_STATE_KEY, JSON.stringify({
    ...state,
    dayKey: todayKey(),
  }));
}

function evaluateMorningNetworkCheckIn(wasOnCompany, isOnCompany) {
  const cfg = getMorningDetectConfig();
  if (!cfg.enabled || !isNetworkGuardActive() || !isMorningCheckInWindow()) return;
  if (isFieldWorkToday()) return;

  const record = getTodayRecord();
  if (record?.checkIn || record?.checkOut) return;

  const state = loadNetworkMorningState();
  if (state.dismissed) {
    saveNetworkMorningState({ ...state, wasOnCompany: isOnCompany });
    return;
  }

  const existing = loadWifiSuggestion();
  if (existing?.checkIn && formatDateKey(parseISO(existing.checkIn)) === todayKey()) {
    saveNetworkMorningState({ ...state, wasOnCompany: isOnCompany });
    return;
  }

  if (!isOnCompany) {
    saveNetworkMorningState({ ...state, wasOnCompany: false });
    return;
  }

  const referenceWasOff = wasOnCompany === false || state.wasOnCompany === false;
  const transitioned = referenceWasOff && isOnCompany === true;
  const firstDetectInWindow = !state.suggested && isOnCompany === true;

  if (transitioned || firstDetectInWindow) {
    const now = new Date();
    saveWifiSuggestion(now.toISOString(), 'network');
    saveNetworkMorningState({
      ...state,
      suggested: true,
      wasOnCompany: true,
    });
    maybeSendMorningCheckInNotification(now, state);
  } else {
    saveNetworkMorningState({ ...state, wasOnCompany: isOnCompany });
  }
}

function syncMorningNetworkPolling() {
  const cfg = getMorningDetectConfig();
  if (!cfg.enabled || !isMorningCheckInWindow()) {
    if (morningPollInterval) {
      clearInterval(morningPollInterval);
      morningPollInterval = null;
    }
    return;
  }

  if (morningPollInterval) return;

  const intervalMs = cfg.pollIntervalMs ?? 60_000;
  morningPollInterval = setInterval(async () => {
    if (!isMorningCheckInWindow()) {
      syncMorningNetworkPolling();
      return;
    }
    await refreshNetworkGuard();
    renderWifiSuggestion();
  }, intervalMs);
}

function calcNetWorkSoFar(checkInISO, endISO = new Date().toISOString()) {
  const elapsed = calcWorkedMinutes(checkInISO, endISO);
  return Math.min(WORK_HOURS * 60, Math.max(0, elapsed - LUNCH_MINUTES));
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    let isDark = theme === 'dark';
    if (theme === 'system' || !theme) {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    meta.content = isDark ? '#0f172a' : '#1a56db';
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tabPanel === tabName);
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelector('.app')?.classList.toggle('is-lunch-tab', tabName === 'lunch');
  document.querySelector('.app')?.classList.toggle('is-chat-tab', tabName === 'chat');
  if (tabName === 'fun') {
    renderFunDate();
    if (typeof renderFortune === 'function') renderFortune();
    if (typeof renderSaju === 'function') renderSaju();
  }
  if (tabName === 'lunch') {
    if (typeof initLunchMap === 'function') {
      initLunchMap().then(() => {
        if (typeof initUserLocation === 'function') initUserLocation();
      });
    }
    setTimeout(() => {
      if (typeof lunchMapInstance !== 'undefined' && lunchMapInstance) {
        lunchMapInstance.invalidateSize();
      }
    }, 200);
  }
  if (tabName === 'news') {
    if (typeof initNewsBrief === 'function') initNewsBrief();
  }
  if (tabName === 'chat') {
    if (typeof initHermesChat === 'function') initHermesChat();
    const afterChatRender = () => {
      requestAnimationFrame(() => {
        const listEl = document.getElementById('chatMessages');
        if (listEl) listEl.scrollTop = listEl.scrollHeight;
      });
    };
    if (typeof refreshHermesChatFromSheet === 'function') {
      refreshHermesChatFromSheet(true).then(afterChatRender);
    } else if (typeof renderHermesChat === 'function') {
      renderHermesChat();
      afterChatRender();
    }
  }
}

function renderProgress(record, previewCheckInISO = null) {
  const fill = document.getElementById('progressFill');
  const labelEl = document.getElementById('progressLabel');
  const valueEl = document.getElementById('progressValue');
  const metaEl = document.getElementById('progressMeta');
  if (!fill || !labelEl || !valueEl || !metaEl) return;

  const checkInISO = record?.checkIn || previewCheckInISO;
  if (!checkInISO) {
    labelEl.textContent = '남은 시간';
    valueEl.textContent = '—';
    fill.style.width = '0%';
    fill.className = 'progress-fill';
    metaEl.textContent = '출근 등록 후 표시됩니다';
    return;
  }

  const now = new Date();
  const checkIn = parseISO(checkInISO);
  const leaveTime = calcLeaveTime(checkInISO);
  const totalMs = Math.max(1, leaveTime - checkIn);

  if (record?.checkOut) {
    const net = calcNetWorkMinutes(record.checkIn, record.checkOut);
    labelEl.textContent = '오늘 근무';
    valueEl.textContent = `${(net / 60).toFixed(1)}h`;
    fill.style.width = '100%';
    fill.className = 'progress-fill done';
    metaEl.textContent = `순근무 ${formatDuration(net)} · 퇴근 완료`;
    return;
  }

  const elapsedMs = Math.max(0, now - checkIn);
  const remainingMs = Math.max(0, leaveTime - now);
  const pct = Math.min(100, Math.round((elapsedMs / totalMs) * 100));
  const netSoFar = calcNetWorkSoFar(checkInISO, now.toISOString());

  if (remainingMs > 0) {
    labelEl.textContent = '남은 시간';
    valueEl.textContent = formatDuration(Math.ceil(remainingMs / 60000));
    fill.className = `progress-fill${remainingMs <= 30 * 60000 ? ' urgent' : ''}`;
  } else {
    labelEl.textContent = '퇴근 가능';
    valueEl.textContent = '지금';
    fill.className = 'progress-fill ready';
  }

  fill.style.width = `${pct}%`;
  metaEl.textContent = `순근무 ${(netSoFar / 60).toFixed(1)}/${WORK_HOURS}h · 경과 ${(elapsedMs / 3600000).toFixed(1)}h`;
}

// ── Wi-Fi 출근 추정 (Android 앱 연동) ──────────────────────────────────────────

function loadWifiSuggestion() {
  try {
    return JSON.parse(localStorage.getItem(WIFI_SUGGEST_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveWifiSuggestion(checkInISO, source = 'android') {
  if (!checkInISO) return;
  localStorage.setItem(WIFI_SUGGEST_KEY, JSON.stringify({
    checkIn: checkInISO,
    source,
    savedAt: new Date().toISOString(),
  }));
}

function clearWifiSuggestion() {
  localStorage.removeItem(WIFI_SUGGEST_KEY);
}

function parseWifiCheckInParam(raw) {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep original */
  }

  let date = null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    date = new Date(value);
  } else if (/^\d{2}:\d{2}$/.test(value)) {
    const now = new Date();
    const [h, m] = value.split(':').map(Number);
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  if (formatDateKey(date) !== todayKey()) return null;
  return date.toISOString();
}

function consumeWifiDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const wifiCheckIn = params.get('wifiCheckIn');
  if (!wifiCheckIn) return;

  const iso = parseWifiCheckInParam(wifiCheckIn);
  if (iso) {
    saveWifiSuggestion(iso, params.get('wifiSource') || 'android');
  }

  params.delete('wifiCheckIn');
  params.delete('wifiSource');
  const qs = params.toString();
  const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  history.replaceState({}, '', cleanUrl);
}

function applyWifiSuggestionToInput(iso) {
  const input = document.getElementById('checkInInput');
  if (!input || !iso) return false;
  input.value = toTimeInputValue(parseISO(iso));
  checkInInputTouched = true;
  handleCheckInTimePreview();
  return true;
}

function renderWifiSuggestion() {
  const box = document.getElementById('wifiSuggestBox');
  const titleEl = document.getElementById('checkInSuggestTitle');
  const textEl = document.getElementById('wifiSuggestText');
  const btnApply = document.getElementById('btnWifiApply');
  const btnCheckIn = document.getElementById('btnWifiCheckIn');
  if (!box || !textEl) return;

  const suggest = loadWifiSuggestion();
  const record = getTodayRecord();

  if (!suggest?.checkIn || formatDateKey(parseISO(suggest.checkIn)) !== todayKey()) {
    box.classList.add('hidden');
    return;
  }

  if (record?.checkOut) {
    box.classList.add('hidden');
    return;
  }

  const timeLabel = formatTime(parseISO(suggest.checkIn));
  const source = suggest.source || 'android';
  const sourceTitle = {
    android: 'Wi-Fi 출근 추정',
    network: '회사 네트워크 출근 추정',
  };
  const sourceMessage = {
    android: `${timeLabel}에 회사 Wi-Fi 연결됨 · 출근 시각으로 적용할까요?`,
    network: `${timeLabel}에 회사 네트워크 감지됨 · 출근 시각으로 적용할까요?`,
  };

  if (titleEl) titleEl.textContent = sourceTitle[source] || '출근 추정';
  box.classList.remove('hidden');

  if (!record?.checkIn) {
    textEl.textContent = sourceMessage[source] || `${timeLabel} · 출근 시각으로 적용할까요?`;
    btnApply?.classList.remove('hidden');
    btnCheckIn?.classList.remove('hidden');
  } else {
    const current = formatTime(parseISO(record.checkIn));
    if (current === timeLabel) {
      box.classList.add('hidden');
      return;
    }
    textEl.textContent = `${sourceTitle[source] || '출근 추정'} ${timeLabel} · 현재 출근 ${current}`;
    btnApply?.classList.remove('hidden');
    btnCheckIn?.classList.add('hidden');
  }
}

async function handleWifiApply() {
  const suggest = loadWifiSuggestion();
  if (!suggest?.checkIn) return;

  applyWifiSuggestionToInput(suggest.checkIn);
  const record = getTodayRecord();
  const label = suggest.source === 'network' ? '네트워크 추정' : 'Wi-Fi 추정';

  if (record?.checkIn && !record.checkOut) {
    checkInTimeDirty = true;
    if (await applyCheckInTimeChange()) {
      setSyncStatus(`${label} 출근 시각으로 수정됨`, 'ok');
      clearWifiSuggestion();
    }
  } else {
    setSyncStatus(`출근 시각에 ${label}값을 적용했습니다`, 'ok');
  }

  render();
}

async function handleWifiCheckIn() {
  const suggest = loadWifiSuggestion();
  if (!suggest?.checkIn) return;

  applyWifiSuggestionToInput(suggest.checkIn);
  clearWifiSuggestion();
  await handleCheckIn();
}

function handleWifiDismiss() {
  const suggest = loadWifiSuggestion();
  if (suggest?.source === 'network') {
    const state = loadNetworkMorningState();
    saveNetworkMorningState({ ...state, dismissed: true });
  }
  clearWifiSuggestion();
  renderWifiSuggestion();
}

// ── PWA 설치 ──────────────────────────────────────────

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|Instagram|FBAN|FBAV|Line\//i.test(ua);
}

function updateInstallUI() {
  const card = document.getElementById('installCard');
  const btn = document.getElementById('btnInstall');
  const desc = document.getElementById('installDesc');

  if (!card) return;

  if (isStandalone()) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  if (isInAppBrowser()) {
    desc.textContent = '카톡·인스타 등 앱 안 브라우저에서는 설치가 안 됩니다. 주소를 복사해 Chrome 앱에서 여세요.';
    btn.classList.add('hidden');
    return;
  }

  if (deferredInstallPrompt) {
    desc.textContent = '아래 버튼을 누르면 바로 설치할 수 있어요.';
    btn.classList.remove('hidden');
  } else {
    desc.textContent = 'Chrome에서 「공유 → 홈 화면에 추가」로 설치하세요. (아래 안내 참고)';
    btn.classList.add('hidden');
  }
}

async function handleInstall() {
  if (!deferredInstallPrompt) {
    document.getElementById('installGuide')?.setAttribute('open', 'open');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallUI();
}

// ── 유틸 ──────────────────────────────────────────

function formatTime(date) {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  return `${ampm} ${h12}:${m}`;
}

function formatTimeShort(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function parseISO(iso) {
  return new Date(iso);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getWeekDates(baseDate = new Date()) {
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function toTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function checkInISOFromTimeInput(hhmm, dateKey = todayKey()) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(y, mo - 1, d, hours, minutes, 0, 0).toISOString();
}

function clearTodayNotifications() {
  const notified = loadNotified();
  Object.keys(notified).forEach((k) => {
    if (k.startsWith(todayKey())) delete notified[k];
  });
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
}

function calcNetWorkMinutes(checkInISO, checkOutISO) {
  return Math.max(0, calcWorkedMinutes(checkInISO, checkOutISO) - LUNCH_MINUTES);
}

function getUserName() {
  return (loadSettings().userName || '').trim() || '사원';
}

function getWeekStartKey(baseDate = new Date()) {
  return formatDateKey(getWeekDates(baseDate)[0]);
}

function getWeekRecords() {
  const records = loadRecords();
  const weekDates = getWeekDates();
  const week = {};
  weekDates.forEach((date) => {
    const key = formatDateKey(date);
    if (records[key]?.checkIn) week[key] = records[key];
  });
  return week;
}

function recordToSyncRow(dateKey, record) {
  const leave = calcLeaveTime(record.checkIn);
  let netHours = '';
  if (record.checkOut) {
    netHours = (calcNetWorkMinutes(record.checkIn, record.checkOut) / 60).toFixed(1);
  }
  return {
    name: getUserName(),
    date: dateKey,
    checkIn: formatTimeShort(parseISO(record.checkIn)),
    checkOut: record.checkOut ? formatTimeShort(parseISO(record.checkOut)) : '',
    leavePlanned: formatTimeShort(leave),
    netHours,
    fieldWork: record.fieldWork ? '외근' : '사무실',
    fieldMemo: record.fieldMemo || '',
  };
}

async function syncRecordToSheet(dateKey, record) {
  const settings = loadSettings();
  const url = (settings.sheetUrl || '').trim();
  const name = getUserName();
  if (!url || !name) return { ok: false, skipped: true };

  await postToSheet(url, recordToSyncRow(dateKey, record));
  return { ok: true };
}

async function syncWeekToSheet() {
  const settings = loadSettings();
  const url = (settings.sheetUrl || '').trim();
  const name = getUserName();

  if (!name) {
    setSyncStatus('이름을 먼저 입력해주세요.', 'err');
    return;
  }
  if (!url) {
    setSyncStatus('Google 시트 URL을 입력해주세요.', 'err');
    return;
  }

  setSyncStatus('저장 중…', '');
  const week = getWeekRecords();
  const keys = Object.keys(week);
  if (keys.length === 0) {
    setSyncStatus('이번 주 저장할 기록이 없습니다.', 'err');
    return;
  }

  try {
    for (const key of keys) {
      const result = await syncRecordToSheet(key, week[key]);
      if (!result.ok) throw new Error(result.error || '저장 실패');
    }
    setSyncStatus(`${name}님 이번 주 ${keys.length}건 저장 완료`, 'ok');
    await loadTeamWeek();
  } catch (e) {
    setSyncStatus(`저장 실패: ${e.message}`, 'err');
  }
}

function setSyncStatus(msg, type) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'sync-status' + (type ? ` ${type}` : '');
}

async function testSheetConnection() {
  const url = normalizeSheetUrl(loadSettings().sheetUrl || '');
  if (!url) {
    setSyncStatus('URL을 먼저 입력하세요.', 'err');
    return;
  }
  setSyncStatus('연결 테스트 중…', '');
  try {
    const res = await fetch(`${url}?action=chat&name=test&limit=1`, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await parseSheetResponse(res);
    if (!data.ok) throw new Error(data.error || '응답 오류');
    setSyncStatus('시트 연결 OK — AI채팅·출퇴근 저장 가능', 'ok');
  } catch (e) {
    setSyncStatus(`연결 실패: ${e.message}`, 'err');
  }
}

async function loadTeamWeek() {
  const settings = loadSettings();
  const url = (settings.sheetUrl || '').trim();
  const box = document.getElementById('teamWeekBox');
  const list = document.getElementById('teamWeekList');
  if (!url || !box || !list) return;

  try {
    const weekStart = getWeekStartKey();
    const res = await fetch(`${url}?weekStart=${weekStart}`, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await parseSheetResponse(res);
    if (!data.ok || !data.records?.length) {
      box.classList.add('hidden');
      return;
    }

    const byName = {};
    data.records.forEach((r) => {
      if (!byName[r.name]) byName[r.name] = { days: 0, hours: 0 };
      byName[r.name].days += 1;
      if (r.netHours != null && !Number.isNaN(r.netHours)) {
        byName[r.name].hours += Number(r.netHours);
      }
    });

    list.innerHTML = Object.entries(byName)
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([name, info]) => `
        <li class="team-item">
          <span class="name">${escapeHtml(name)}</span>
          <span class="detail">${info.days}일 · ${info.hours.toFixed(1)}h</span>
        </li>`).join('');
    box.classList.remove('hidden');
  } catch {
    box.classList.add('hidden');
  }
}

// ── 저장소 ──────────────────────────────────────────

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getTodayRecord() {
  return loadRecords()[todayKey()] || null;
}

function saveTodayRecord(record) {
  const records = loadRecords();
  records[todayKey()] = record;
  saveRecords(records);
}

// ── 계산 ──────────────────────────────────────────

function calcLeaveTime(checkInISO) {
  return addMinutes(parseISO(checkInISO), DAY_SPAN_MINUTES);
}

function calcWorkedMinutes(checkInISO, checkOutISO) {
  const start = parseISO(checkInISO);
  const end = parseISO(checkOutISO);
  return Math.max(0, Math.round((end - start) / 60000));
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

// ── 알림 ──────────────────────────────────────────

function loadNotified() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) || {};
  } catch {
    return {};
  }
}

function markNotified(key) {
  const notified = loadNotified();
  notified[key] = true;
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
}

function wasNotified(key) {
  return !!loadNotified()[key];
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('이 브라우저는 알림을 지원하지 않습니다.');
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    new Notification('출퇴근 체크', { body: '퇴근 알림이 설정되었습니다.' });
    return true;
  }
  return false;
}

function sendNotification(title, body, tag = 'leave-reminder', url = './') {
  if (Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'NOTIFY',
      title,
      body,
      tag,
      url,
    });
  } else {
    new Notification(title, { body, icon: 'icon-192.png', tag });
  }
}

function maybeSendMorningCheckInNotification(detectedAt, state) {
  if (state.notified) return;

  const timeLabel = formatTime(detectedAt);
  sendNotification(
    '출근 체크',
    `${timeLabel} 회사 네트워크 감지 · 출근 등록해 주세요`,
    'checkin-reminder',
  );

  saveNetworkMorningState({
    ...loadNetworkMorningState(),
    notified: true,
  });
}

function checkAndNotify() {
  const record = getTodayRecord();
  if (!record || !record.checkIn || record.checkOut) return;

  const leaveTime = calcLeaveTime(record.checkIn);
  const settings = loadSettings();
  const now = new Date();
  const offsets = settings.notifyBefore.split(',').map(Number);

  for (const min of offsets) {
    const notifyAt = addMinutes(leaveTime, -min);
    const key = `${todayKey()}-${min}`;

    if (now >= notifyAt && now < addMinutes(notifyAt, 2) && !wasNotified(key)) {
      const label = min === 0 ? '지금 퇴근하세요!' : `퇴근 ${min}분 전입니다`;
      let body = `${formatTime(leaveTime)} 퇴근 · ${label}`;
      if (settings.commuteNotify !== false && typeof getCommuteSummaryLine === 'function') {
        const commute = getCommuteSummaryLine(leaveTime);
        if (commute) body += `\n${commute}`;
      }
      sendNotification('퇴근 알림', body);
      markNotified(key);
    }
  }

  if (typeof checkCommuteLeaveNotify === 'function') checkCommuteLeaveNotify();
}

// ── UI 렌더 ──────────────────────────────────────────

function formatTodayLabel(now = new Date()) {
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${DAY_NAMES[now.getDay()]})`;
}

function renderFunDate() {
  const el = document.getElementById('funTodayDate');
  if (el) el.textContent = formatTodayLabel();
}

function renderToday() {
  const record = getTodayRecord();
  const now = new Date();
  const hasCheckIn = !!(record?.checkIn);
  const fieldWork = isFieldWorkToday();
  const todayCard = document.getElementById('todayCard');
  const fieldBadge = document.getElementById('fieldWorkBadge');
  const fieldToggle = document.getElementById('fieldWorkToggle');
  const fieldMemoDisplay = document.getElementById('fieldMemoDisplay');
  const fieldMemoText = document.getElementById('fieldMemoText');

  document.getElementById('todayDate').textContent = formatTodayLabel(now);

  todayCard?.classList.toggle('card-field-work', fieldWork);
  fieldBadge?.classList.toggle('hidden', !fieldWork);
  if (fieldToggle) {
    fieldToggle.checked = fieldWork;
    fieldToggle.disabled = !!record?.checkOut;
  }

  if (record?.checkOut && record.fieldWork && record.fieldMemo) {
    fieldMemoDisplay?.classList.remove('hidden');
    if (fieldMemoText) fieldMemoText.textContent = record.fieldMemo;
  } else {
    fieldMemoDisplay?.classList.add('hidden');
  }

  if (!record?.checkOut) {
    hideFieldMemoForm();
  }

  const badge = document.getElementById('statusBadge');
  const checkInInput = document.getElementById('checkInInput');
  const leaveEl = document.getElementById('leaveTime');
  const btnIn = document.getElementById('btnCheckIn');
  const btnSave = document.getElementById('btnSaveCheckIn');
  const btnOut = document.getElementById('btnCheckOut');

  let previewISO = null;
  if (checkInInput && !checkInInputFocused) {
    if (hasCheckIn) {
      checkInInput.value = toTimeInputValue(parseISO(record.checkIn));
      checkInInput.disabled = false;
    } else if (!checkInInputTouched) {
      checkInInput.value = toTimeInputValue(now);
      checkInInput.disabled = false;
    }
  }

  if (checkInInput?.value) {
    previewISO = hasCheckIn ? record.checkIn : checkInISOFromTimeInput(checkInInput.value);
  }

  if (!hasCheckIn) {
    badge.textContent = fieldWork ? '외근 예정' : '미출근';
    badge.className = fieldWork ? 'badge badge-field' : 'badge';
    leaveEl.textContent = previewISO ? formatTime(calcLeaveTime(previewISO)) : '—';
    btnIn.classList.remove('hidden');
    btnSave?.classList.add('hidden');
    btnOut.classList.add('hidden');
    renderProgress(null, previewISO);
    if (typeof renderCommuteCard === 'function') renderCommuteCard();
    return;
  }

  const leaveTime = calcLeaveTime(record.checkIn);
  leaveEl.textContent = formatTime(leaveTime);

  if (record.checkOut) {
    badge.textContent = record.fieldWork ? '외근 완료' : '퇴근 완료';
    badge.className = record.fieldWork ? 'badge badge-field done' : 'badge done';
    btnIn.classList.add('hidden');
    btnSave?.classList.toggle('hidden', !checkInTimeDirty);
    btnOut.classList.add('hidden');
    renderProgress(record);
    if (typeof renderCommuteCard === 'function') renderCommuteCard();
    return;
  }

  badge.textContent = fieldWork ? '외근 중' : '근무 중';
  badge.className = fieldWork ? 'badge badge-field working' : 'badge working';
  btnIn.classList.add('hidden');
  btnSave?.classList.toggle('hidden', !checkInTimeDirty);
  btnOut.classList.remove('hidden');
  renderProgress(record);
  if (typeof renderCommuteCard === 'function') renderCommuteCard();
}

function renderWeek() {
  const records = loadRecords();
  const weekDates = getWeekDates();
  const list = document.getElementById('weekList');
  const summary = document.getElementById('weekSummary');
  const weekTitle = document.getElementById('weekTitle');
  const name = getUserName();

  if (weekTitle) {
    weekTitle.textContent = name ? `${name}님 이번 주` : '이번 주';
  }

  let totalWorkMinutes = 0;
  let workDays = 0;

  list.innerHTML = weekDates.map((date) => {
    const key = formatDateKey(date);
    const record = records[key];
    const isToday = key === todayKey();
    const dayLabel = `${DAY_NAMES[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;

    if (!record || !record.checkIn) {
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      return `<li class="week-item ${isToday ? 'today' : ''} ${isWeekend ? 'off' : ''}">
        <span class="day">${dayLabel}</span>
        <span class="times">—</span>
        <span class="hours">—</span>
      </li>`;
    }

    const checkIn = formatTimeShort(parseISO(record.checkIn));
    let timesText = `${checkIn} ~`;
    let hoursText = '—';

    if (record.checkOut) {
      const checkOut = formatTimeShort(parseISO(record.checkOut));
      const netWork = calcNetWorkMinutes(record.checkIn, record.checkOut);
      totalWorkMinutes += netWork;
      workDays++;
      timesText = `${checkIn} ~ ${checkOut}`;
      hoursText = `${(netWork / 60).toFixed(1)}h`;
    } else if (isToday) {
      const leave = formatTimeShort(calcLeaveTime(record.checkIn));
      timesText = `${checkIn} ~ ${leave}`;
      hoursText = '진행';
    }

    return `<li class="week-item ${isToday ? 'today' : ''} ${record.fieldWork ? 'field-work' : ''}">
      <span class="day">${dayLabel}${record.fieldWork ? '<span class="week-field-tag">외근</span>' : ''}</span>
      <span class="times">${timesText}${record.fieldMemo ? `<span class="week-memo">${escapeHtml(record.fieldMemo)}</span>` : ''}</span>
      <span class="hours">${hoursText}</span>
    </li>`;
  }).join('');

  const totalH = (totalWorkMinutes / 60).toFixed(1);
  summary.textContent = workDays > 0 ? `누적 ${totalH}시간 (${workDays}일)` : '';
}

function renderSettings() {
  const settings = loadSettings();
  document.getElementById('notifyBefore').value = settings.notifyBefore;
  const nameEl = document.getElementById('userName');
  const sheetEl = document.getElementById('sheetUrl');
  const themeEl = document.getElementById('themeMode');
  if (nameEl) nameEl.value = settings.userName || '';
  if (sheetEl) sheetEl.value = settings.sheetUrl || '';
  if (themeEl) themeEl.value = settings.theme || 'system';
  const fortuneNotifyEl = document.getElementById('fortuneNotify');
  if (fortuneNotifyEl) fortuneNotifyEl.checked = settings.fortuneNotify !== false;
  const lunchRouletteNotifyEl = document.getElementById('lunchRouletteNotify');
  if (lunchRouletteNotifyEl) lunchRouletteNotifyEl.checked = settings.lunchRouletteNotify !== false;
  const birthDateEl = document.getElementById('birthDate');
  if (birthDateEl) birthDateEl.value = settings.birthDate || '';
  const hermesBaseUrlEl = document.getElementById('hermesBaseUrl');
  if (hermesBaseUrlEl) hermesBaseUrlEl.value = settings.hermesBaseUrl || '';
  const hermesApiKeyEl = document.getElementById('hermesApiKey');
  if (hermesApiKeyEl) hermesApiKeyEl.value = settings.hermesApiKey || '';
  const hermesModelEl = document.getElementById('hermesModel');
  if (hermesModelEl) hermesModelEl.value = settings.hermesModel || 'hermes-agent';
  const homeAddressEl = document.getElementById('homeAddress');
  if (homeAddressEl) homeAddressEl.value = settings.homeAddress || '';
  const commuteNotifyEl = document.getElementById('commuteNotify');
  if (commuteNotifyEl) commuteNotifyEl.checked = settings.commuteNotify !== false;
  applyTheme(settings.theme || 'system');
}

function render() {
  renderToday();
  renderFunDate();
  renderSettings();
  renderAppVersion();
  renderWifiSuggestion();
  if (typeof renderFortune === 'function') renderFortune();
  if (typeof renderSaju === 'function') renderSaju();
  checkAndNotify();
  if (typeof checkFortuneNotify === 'function') checkFortuneNotify();
  if (typeof checkLunchRouletteNotify === 'function') checkLunchRouletteNotify();
  if (typeof maybePrefetchCommute === 'function') maybePrefetchCommute();
  if (typeof initWeatherBrief === 'function') initWeatherBrief();
  if (typeof initNewsBrief === 'function') initNewsBrief();
  updateNetworkStatusUI();
  const canAttend = onCompanyNetwork || !isNetworkGuardActive() || isFieldWorkToday();
  setAttendanceButtonsEnabled(canAttend);
}

// ── 액션 ──────────────────────────────────────────

async function handleCheckIn() {
  if (!(await requireCompanyNetwork())) return;

  const existing = getTodayRecord();
  if (existing?.checkIn) return;

  const input = document.getElementById('checkInInput');
  if (!input?.value) {
    alert('출근 시각을 선택해주세요.');
    return;
  }

  const settings = loadSettings();
  saveTodayRecord({
    checkIn: checkInISOFromTimeInput(input.value),
    userName: getUserName(),
    fieldWork: isFieldWorkToday(),
  });
  saveFieldModePending(false);
  clearWifiSuggestion();
  checkInInputTouched = false;
  checkInTimeDirty = false;

  if (Notification.permission === 'default') {
    requestNotificationPermission();
  }

  render();
  if (settings.sheetUrl) {
    syncRecordToSheet(todayKey(), getTodayRecord()).then((r) => {
      if (r.ok) setSyncStatus('팀 시트에 출근 저장됨', 'ok');
    }).catch(() => {});
  }
}

async function applyCheckInTimeChange() {
  if (!(await requireCompanyNetwork())) return false;

  const record = getTodayRecord();
  if (!record?.checkIn) return false;

  const input = document.getElementById('checkInInput');
  if (!input?.value) return false;

  const newCheckIn = checkInISOFromTimeInput(input.value);
  if (newCheckIn === record.checkIn) {
    checkInTimeDirty = false;
    return false;
  }

  const updated = { ...record, checkIn: newCheckIn };
  if (record.checkOut) {
    const worked = calcWorkedMinutes(newCheckIn, record.checkOut);
    if (worked < 0) {
      alert('출근 시각이 퇴근 시각보다 늦을 수 없습니다.');
      return false;
    }
  }

  saveTodayRecord(updated);
  clearTodayNotifications();
  checkInTimeDirty = false;

  render();
  const settings = loadSettings();
  if (settings.sheetUrl) {
    syncRecordToSheet(todayKey(), getTodayRecord()).catch(() => {});
  }
  return true;
}

function markCheckInTimeDirty() {
  const record = getTodayRecord();
  if (!record?.checkIn) return;

  const input = document.getElementById('checkInInput');
  if (!input?.value) return;

  const newCheckIn = checkInISOFromTimeInput(input.value);
  checkInTimeDirty = newCheckIn !== record.checkIn;

  const btnSave = document.getElementById('btnSaveCheckIn');
  btnSave?.classList.toggle('hidden', !checkInTimeDirty);
}

function handleCheckInTimePreview() {
  const input = document.getElementById('checkInInput');
  const leaveEl = document.getElementById('leaveTime');
  if (!input?.value || !leaveEl) return;

  checkInInputTouched = true;
  const previewISO = checkInISOFromTimeInput(input.value);
  leaveEl.textContent = formatTime(calcLeaveTime(previewISO));

  const record = getTodayRecord();
  if (record?.checkIn) {
    markCheckInTimeDirty();
    renderProgress(record);
  } else {
    renderProgress(null, previewISO);
  }
}

async function handleCheckOut() {
  const record = getTodayRecord();
  if (!record?.checkIn || record.checkOut) return;

  if (record.fieldWork) {
    showFieldMemoForm();
    return;
  }

  if (!(await requireCompanyNetwork())) return;
  await completeCheckOut(record);
}

function handleResetToday() {
  if (!confirm('오늘 기록을 삭제할까요?')) return;
  const records = loadRecords();
  delete records[todayKey()];
  saveRecords(records);
  checkInInputTouched = false;
  checkInTimeDirty = false;
  saveFieldModePending(false);

  const notified = loadNotified();
  Object.keys(notified).forEach((k) => {
    if (k.startsWith(todayKey())) delete notified[k];
  });
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));

  render();
}

function handleExport() {
  const records = loadRecords();
  const name = getUserName();
  const rows = [['이름', '날짜', '근무유형', '출근', '퇴근', '퇴근예정', '순근무(분)', '외근메모']];

  Object.keys(records).sort().forEach((key) => {
    const r = records[key];
    if (!r.checkIn) return;
    const leave = calcLeaveTime(r.checkIn);
    const netWork = r.checkOut ? calcNetWorkMinutes(r.checkIn, r.checkOut) : '';
    rows.push([
      r.userName || name,
      key,
      r.fieldWork ? '외근' : '사무실',
      formatTimeShort(parseISO(r.checkIn)),
      r.checkOut ? formatTimeShort(parseISO(r.checkOut)) : '',
      formatTimeShort(leave),
      netWork,
      r.fieldMemo || '',
    ]);
  });

  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `출퇴근기록_${name || 'unknown'}_${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function handleSettingsChange() {
  const theme = document.getElementById('themeMode')?.value || 'system';
  const prev = loadSettings();
  const settings = {
    ...prev,
    notifyBefore: document.getElementById('notifyBefore').value,
    userName: (document.getElementById('userName')?.value || '').trim(),
    sheetUrl: normalizeSheetUrl(document.getElementById('sheetUrl')?.value || ''),
    theme,
    fortuneNotify: document.getElementById('fortuneNotify')?.checked !== false,
    lunchRouletteNotify: document.getElementById('lunchRouletteNotify')?.checked !== false,
    birthDate: (document.getElementById('birthDate')?.value || '').trim(),
    hermesBaseUrl: (document.getElementById('hermesBaseUrl')?.value || '').trim().replace(/\/$/, ''),
    hermesApiKey: (document.getElementById('hermesApiKey')?.value || '').trim(),
    hermesModel: (document.getElementById('hermesModel')?.value || 'hermes-agent').trim() || 'hermes-agent',
    homeAddress: (document.getElementById('homeAddress')?.value || '').trim(),
    commuteNotify: document.getElementById('commuteNotify')?.checked !== false,
  };
  if (prev.homeAddress !== settings.homeAddress) {
    localStorage.removeItem('attendance-commute-cache');
    if (settings.homeAddress && typeof fetchCommuteTime === 'function') {
      fetchCommuteTime({ force: true });
    }
  }
  saveSettings(settings);
  applyTheme(theme);

  const sheetEl = document.getElementById('sheetUrl');
  if (sheetEl && sheetEl.value !== settings.sheetUrl) sheetEl.value = settings.sheetUrl;
  if (sheetEl || document.getElementById('userName')) {
    setSyncStatus('설정 저장됨', 'ok');
  }

  if (typeof renderHermesChat === 'function') renderHermesChat();
  if (typeof renderCommuteCard === 'function') renderCommuteCard();

  const record = getTodayRecord();
  if (record?.checkIn && !record.checkOut) {
    saveTodayRecord({
      ...record,
      userName: settings.userName,
    });
  }

  render();
}

// ── Service Worker ──────────────────────────────────────────

async function purgeAppCaches() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

async function hardRefreshApp() {
  if (!confirm('앱 캐시를 모두 지우고 최신 버전을 다시 받습니다. 계속할까요?')) return;

  try {
    await purgeAppCaches();
  } catch (e) {
    console.warn('캐시 삭제 실패:', e);
  }

  localStorage.removeItem(APP_VERSION_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set('nocache', String(Date.now()));
  window.location.replace(url.toString());
}

let swRefreshing = false;

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register(`./sw.js?build=${APP_BUILD}`, {
      updateViaCache: 'none',
      scope: './',
    });

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });

    await reg.update();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });
  } catch (e) {
    console.warn('SW 등록 실패:', e);
  }
}

async function syncAppVersion() {
  const stored = localStorage.getItem(APP_VERSION_KEY);
  if (stored && stored !== APP_BUILD) {
    await purgeAppCaches();
    localStorage.setItem(APP_VERSION_KEY, APP_BUILD);
    window.location.reload();
    return;
  }
  localStorage.setItem(APP_VERSION_KEY, APP_BUILD);
}

function renderAppVersion() {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = `앱 버전 ${APP_BUILD}`;
}

// ── 초기화 ──────────────────────────────────────────

function init() {
  window.APP_VERSION = APP_BUILD;
  consumeWifiDeepLink();
  if (typeof consumeFunDeepLink === 'function') consumeFunDeepLink();
  if (typeof consumeLunchDeepLink === 'function') consumeLunchDeepLink();
  if (typeof consumeChatDeepLink === 'function') consumeChatDeepLink();
  if (typeof initHermesChat === 'function') initHermesChat();
  if (typeof initCommuteTime === 'function') initCommuteTime();
  syncAppVersion().then(() => registerSW());

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallUI();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallUI();
  });

  document.getElementById('btnInstall')?.addEventListener('click', handleInstall);
  document.getElementById('btnCheckIn').addEventListener('click', handleCheckIn);
  document.getElementById('btnSaveCheckIn')?.addEventListener('click', async () => {
    if (await applyCheckInTimeChange()) {
      setSyncStatus('출근 시각이 저장되었습니다.', 'ok');
    }
  });
  document.getElementById('btnCheckOut').addEventListener('click', handleCheckOut);
  document.getElementById('fieldWorkToggle')?.addEventListener('change', handleFieldWorkToggle);
  document.getElementById('btnFieldCheckOut')?.addEventListener('click', handleFieldCheckOut);
  document.getElementById('btnFieldMemoCancel')?.addEventListener('click', handleFieldMemoCancel);

  const checkInInput = document.getElementById('checkInInput');
  if (checkInInput) {
    checkInInput.addEventListener('focus', () => { checkInInputFocused = true; });
    checkInInput.addEventListener('blur', () => { checkInInputFocused = false; });
    checkInInput.addEventListener('input', handleCheckInTimePreview);
    checkInInput.addEventListener('change', async () => {
      handleCheckInTimePreview();
      const record = getTodayRecord();
      if (record?.checkIn && !record.checkOut) {
        await applyCheckInTimeChange();
      }
    });
  }

  document.getElementById('btnResetToday').addEventListener('click', handleResetToday);
  document.getElementById('btnExport').addEventListener('click', handleExport);
  document.getElementById('btnSyncSheet').addEventListener('click', syncWeekToSheet);
  document.getElementById('btnTestSheet')?.addEventListener('click', testSheetConnection);
  document.getElementById('btnNotifyPermission').addEventListener('click', requestNotificationPermission);
  document.getElementById('btnClearCache')?.addEventListener('click', hardRefreshApp);
  document.getElementById('btnWifiApply')?.addEventListener('click', handleWifiApply);
  document.getElementById('btnWifiCheckIn')?.addEventListener('click', handleWifiCheckIn);
  document.getElementById('btnWifiDismiss')?.addEventListener('click', handleWifiDismiss);
  document.getElementById('btnDrawFortune')?.addEventListener('click', handleDrawFortune);
  document.getElementById('btnRevealQuote')?.addEventListener('click', handleRevealQuote);
  document.getElementById('btnRevealSaju')?.addEventListener('click', handleRevealSaju);
  document.getElementById('btnSajuGoSettings')?.addEventListener('click', handleSajuGoSettings);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  ['notifyBefore', 'userName', 'birthDate', 'sheetUrl', 'themeMode', 'fortuneNotify', 'lunchRouletteNotify', 'hermesBaseUrl', 'hermesApiKey', 'hermesModel', 'homeAddress', 'commuteNotify'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', handleSettingsChange);
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.addEventListener('blur', handleSettingsChange);
  });

  applyTheme(loadSettings().theme || 'system');

  render();
  updateInstallUI();
  refreshNetworkGuard();
  if (typeof syncChatFromSheet === 'function') syncChatFromSheet(true);
  tickInterval = setInterval(render, 30_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshNetworkGuard().then(() => render());
      if (typeof refreshHermesChatFromSheet === 'function' && document.querySelector('.app.is-chat-tab')) {
        refreshHermesChatFromSheet(true).finally(() => {
          if (typeof resumePendingHermesRun === 'function') resumePendingHermesRun();
        });
      } else if (typeof syncChatFromSheet === 'function') {
        syncChatFromSheet(true);
        if (typeof resumePendingHermesRun === 'function') resumePendingHermesRun();
      }
    }
  });

  window.addEventListener('online', () => {
    refreshNetworkGuard().then(() => render());
  });
}

init();
