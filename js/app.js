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
const APP_BUILD = '128';
const APP_VERSION_KEY = 'attendance-app-version';
const FEATURE_CHANGELOG_LIMIT = 5;
const BACKUP_KEYS = [
  SETTINGS_KEY,
  STORAGE_KEY,
  'attendance-news-pins',
  'attendance-lunch-favorites',
  'attendance-lunch-diary',
];

const DEFAULT_SETTINGS = {
  notifyBefore: '30,10,0',
  userName: '',
  targetCheckIn: '',
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
// ponytail: IP API 일시 실패 시 직전 OK 캐시 신뢰 (회사망에서 ipify 막히는 경우)
const NETWORK_STALE_OK_MS = 30 * 60_000;

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

function canAttendNow() {
  if (!isNetworkGuardActive() || isFieldWorkToday()) return true;
  // ponytail: null(확인 중/실패)이면 버튼 잠그지 않음 — 클릭 시 requireCompanyNetwork가 재검증
  if (onCompanyNetwork === null) return true;
  return onCompanyNetwork === true;
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
    if (onCompanyNetwork === true && now - networkCheckAt < NETWORK_STALE_OK_MS) {
      return true;
    }
    onCompanyNetwork = null;
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
    el.textContent = networkCheckAt > 0
      ? '네트워크 확인 실패 · 탭해서 재시도'
      : '네트워크 확인 중…';
    el.className = networkCheckAt > 0 ? 'network-banner warn' : 'network-banner';
    el.style.cursor = networkCheckAt > 0 ? 'pointer' : '';
    return;
  }

  el.style.cursor = '';

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
  setAttendanceButtonsEnabled(canAttendNow());

  if (!isNetworkGuardActive()) return true;

  if (!ok) {
    const hint = networkCheckAt > 0 && onCompanyNetwork === null
      ? '네트워크(IP) 확인에 실패했습니다. 상단 배너를 눌러 재시도하거나 잠시 후 다시 시도해 주세요.'
      : '회사 Wi-Fi에 연결된 후 출퇴근할 수 있습니다.';
    alert(`${hint}\n외근이면 「오늘 외근」을 켜 주세요.`);
    return false;
  }
  return true;
}

async function refreshNetworkGuard() {
  const previous = onCompanyNetwork;
  await checkCompanyNetwork(true);
  updateNetworkStatusUI();
  setAttendanceButtonsEnabled(canAttendNow());
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
  setAttendanceButtonsEnabled(canAttendNow());
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
    switchFunSubTab(loadFunSubTab(), false);
    renderFunDate();
    if (typeof renderFortune === 'function') renderFortune();
    if (typeof renderSaju === 'function') renderSaju();
    if (typeof renderColorOfDay === 'function') renderColorOfDay();
    if (typeof renderLuckyNumber === 'function') renderLuckyNumber();
    if (typeof renderStretchHint === 'function') renderStretchHint();
    if (typeof renderBalanceGame === 'function') renderBalanceGame();
    if (typeof renderTypingHint === 'function') renderTypingHint();
    if (typeof renderReactionHint === 'function') renderReactionHint();
    if (typeof renderGuessHint === 'function') renderGuessHint();
    if (typeof renderDiceHint === 'function') renderDiceHint();
    if (typeof renderSlotHint === 'function') renderSlotHint();
    if (typeof renderTapHint === 'function') renderTapHint();
    if (typeof renderGameDailyLocks === 'function') renderGameDailyLocks();
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

function getTargetCheckInHint(checkInISO) {
  const target = (loadSettings().targetCheckIn || '').trim();
  if (!target || !/^\d{2}:\d{2}$/.test(target) || !checkInISO) return null;

  const checkIn = parseISO(checkInISO);
  const [th, tm] = target.split(':').map(Number);
  const targetAt = new Date(checkIn);
  targetAt.setHours(th, tm, 0, 0);

  const diffMin = Math.round((checkIn - targetAt) / 60000);
  if (diffMin === 0) return `목표 ${target} 정각 출근`;
  if (diffMin > 0) return `${diffMin}분 지각 (목표 ${target})`;
  return `${Math.abs(diffMin)}분 일찍 (목표 ${target})`;
}

function getNextLeaveNotifyHint(leaveTime, now = new Date()) {
  const offsets = loadSettings().notifyBefore.split(',').map(Number).filter((n) => !Number.isNaN(n));
  let next = null;
  for (const min of offsets) {
    const notifyAt = addMinutes(leaveTime, -min);
    if (notifyAt <= now) continue;
    if (!next || notifyAt < next.at) {
      next = { at: notifyAt, min };
    }
  }
  if (!next) return null;
  const label = next.min === 0 ? '정각' : `${next.min}분 전`;
  return `다음 알림 ${formatTime(next.at)} (${label})`;
}

function renderProgress(record, previewCheckInISO = null) {
  const fill = document.getElementById('progressFill');
  const labelEl = document.getElementById('progressLabel');
  const valueEl = document.getElementById('progressValue');
  const metaEl = document.getElementById('progressMeta');
  if (!fill || !labelEl || !valueEl || !metaEl) return;

  const checkInISO = record?.checkIn || previewCheckInISO;
  if (!checkInISO) {
    const target = (loadSettings().targetCheckIn || '').trim();
    if (target && /^\d{2}:\d{2}$/.test(target)) {
      const now = new Date();
      const [th, tm] = target.split(':').map(Number);
      const targetAt = new Date(now);
      targetAt.setHours(th, tm, 0, 0);
      const diffMs = targetAt - now;
      fill.style.width = diffMs > 0 ? '0%' : '100%';
      if (diffMs > 0) {
        labelEl.textContent = '목표 출근까지';
        valueEl.textContent = formatDuration(Math.ceil(diffMs / 60000));
        fill.className = 'progress-fill';
        metaEl.textContent = `목표 ${target} · 출근 등록 전`;
      } else {
        const lateMin = Math.ceil(-diffMs / 60000);
        labelEl.textContent = '목표 출근';
        valueEl.textContent = `+${formatDuration(lateMin)}`;
        fill.className = 'progress-fill overtime';
        metaEl.textContent = `${lateMin}분 지각 (목표 ${target})`;
      }
      return;
    }
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
    const targetHint = getTargetCheckInHint(record.checkIn);
    const doneBase = `순근무 ${formatDuration(net)} · 퇴근 완료`;
    metaEl.textContent = targetHint ? `${doneBase} · ${targetHint}` : doneBase;
    return;
  }

  const elapsedMs = Math.max(0, now - checkIn);
  const remainingMs = Math.max(0, leaveTime - now);
  const pct = Math.min(100, Math.round((elapsedMs / totalMs) * 100));
  const netSoFar = calcNetWorkSoFar(checkInISO, now.toISOString());

  let overtimeHint = '';
  if (remainingMs > 0) {
    labelEl.textContent = '남은 시간';
    valueEl.textContent = formatDuration(Math.ceil(remainingMs / 60000));
    fill.className = `progress-fill${remainingMs <= 30 * 60000 ? ' urgent' : ''}`;
  } else {
    const overtimeMin = Math.ceil((now - leaveTime) / 60000);
    if (overtimeMin > 0) {
      labelEl.textContent = '초과근무';
      valueEl.textContent = `+${formatDuration(overtimeMin)}`;
      fill.className = 'progress-fill overtime';
      overtimeHint = '퇴근 체크를 눌러 주세요';
    } else {
      labelEl.textContent = '퇴근 가능';
      valueEl.textContent = '지금';
      fill.className = 'progress-fill ready';
    }
  }

  fill.style.width = `${pct}%`;
  const notifyHint = remainingMs > 0 ? getNextLeaveNotifyHint(leaveTime, now) : '';
  const targetHint = getTargetCheckInHint(checkInISO);
  const base = `순근무 ${(netSoFar / 60).toFixed(1)}/${WORK_HOURS}h · 경과 ${(elapsedMs / 3600000).toFixed(1)}h`;
  const parts = [base, targetHint, notifyHint, overtimeHint].filter(Boolean);
  metaEl.textContent = parts.join(' · ');
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

// 연속 출근일: 오늘부터(미출근이면 어제부터) 평일을 거슬러 올라가며 출근 기록이 끊기면 중단
function calcCheckInStreak(records = loadRecords(), now = new Date()) {
  const day = new Date(now);
  if (!records[todayKey(day)]?.checkIn) day.setDate(day.getDate() - 1);

  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      if (!records[todayKey(day)]?.checkIn) break;
      streak += 1;
    }
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

// 역대 최장 연속 출근일: 기록 전체를 훑어 평일 연속(주말 skip) 최대 구간을 찾음
function calcBestStreak(records = loadRecords()) {
  const dates = Object.keys(records)
    .filter((k) => records[k]?.checkIn)
    .map((k) => parseISO(`${k}T00:00:00`))
    .filter((d) => d.getDay() !== 0 && d.getDay() !== 6)
    .sort((a, b) => a - b);

  let best = 0;
  let current = 0;
  let prevKey = null;
  for (const d of dates) {
    const expectedPrevKey = todayKey(prevWeekday(d));
    current = prevKey === expectedPrevKey ? current + 1 : 1;
    best = Math.max(best, current);
    prevKey = todayKey(d);
  }
  return best;
}

function prevWeekday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - (d.getDay() === 1 ? 3 : 1));
  return d;
}

function saveTodayRecord(record) {
  try {
    const records = loadRecords();
    records[todayKey()] = record;
    saveRecords(records);
  } catch (e) {
    alert('출퇴근 기록 저장 실패 — 브라우저 저장 공간을 비우거나 캐시를 지운 뒤 다시 시도해 주세요.');
    throw e;
  }
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

const FUN_SUBTAB_KEY = 'attendance-fun-subtab';
const FUN_SUBTAB_META = {
  fortune: { emoji: '🔮', title: '운세' },
  game: { emoji: '🎮', title: '미니게임' },
};

function switchFunSubTab(panelName, persist = true) {
  const name = panelName === 'game' ? 'game' : 'fortune';
  document.querySelectorAll('.fun-subtab').forEach((btn) => {
    const active = btn.dataset.funPanel === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.fun-panel').forEach((panel) => {
    const active = panel.dataset.funPanel === name;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  const meta = FUN_SUBTAB_META[name];
  const emojiEl = document.getElementById('funHeroEmoji');
  const titleEl = document.getElementById('funHeroTitle');
  if (emojiEl) emojiEl.textContent = meta.emoji;
  if (titleEl) titleEl.textContent = meta.title;
  if (persist) {
    try { localStorage.setItem(FUN_SUBTAB_KEY, name); } catch (e) {}
  }
  if (name === 'game' && typeof renderGameDailyLocks === 'function') renderGameDailyLocks();
}

function loadFunSubTab() {
  try {
    const saved = localStorage.getItem(FUN_SUBTAB_KEY);
    if (saved === 'game' || saved === 'fortune') return saved;
  } catch (e) {}
  return 'fortune';
}

// 이번 주 출근 현황 점: 평일 5칸, 출근 기록 있으면 채움, 오늘 칸은 테두리 표시
function renderWeekStrip() {
  const dotsEl = document.getElementById('weekStripDots');
  const textEl = document.getElementById('weekStripText');
  if (!dotsEl || !textEl) return;

  const records = loadRecords();
  const weekdays = getWeekDates().filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  const todayK = todayKey();

  let done = 0;
  let weekNetMin = 0;
  const checkInMins = [];
  const now = new Date();
  dotsEl.innerHTML = weekdays.map((date) => {
    const key = formatDateKey(date);
    const rec = records[key];
    const checked = !!rec?.checkIn;
    if (checked) {
      done += 1;
      const ci = parseISO(rec.checkIn);
      checkInMins.push(ci.getHours() * 60 + ci.getMinutes());
      if (rec.checkOut) weekNetMin += calcNetWorkMinutes(rec.checkIn, rec.checkOut);
      else if (key === todayK) weekNetMin += calcNetWorkMinutes(rec.checkIn, now.toISOString());
    }
    const cls = ['week-strip-dot'];
    if (checked) cls.push('done');
    if (key === todayK) cls.push('today');
    return `<span class="${cls.join(' ')}" title="${DAY_NAMES[date.getDay()]}요일${checked ? ' 출근' : ''}"></span>`;
  }).join('');

  const hoursPart = weekNetMin > 0 ? ` · ${(weekNetMin / 60).toFixed(1)}h 순근무` : '';
  let avgPart = '';
  if (checkInMins.length > 0) {
    const avg = Math.round(checkInMins.reduce((a, b) => a + b, 0) / checkInMins.length);
    avgPart = ` · 평균 ${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')} 출근`;
  }
  textEl.textContent = `이번 주 ${done}/${weekdays.length}일 출근${hoursPart}${avgPart}`;
}

// 이번 주 평일별 순근무 시간 히트맵 (8h 기준 막대 높이)
function renderWeekHeatmap() {
  const el = document.getElementById('weekHeatmap');
  if (!el) return;

  const records = loadRecords();
  const weekdays = getWeekDates().filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  const todayK = todayKey();
  const now = new Date();
  const targetH = WORK_HOURS;

  el.innerHTML = weekdays.map((date) => {
    const key = formatDateKey(date);
    const rec = records[key];
    const day = DAY_NAMES[date.getDay()];
    let hours = null;

    if (rec?.checkIn) {
      if (rec.checkOut) {
        hours = calcNetWorkMinutes(rec.checkIn, rec.checkOut) / 60;
      } else if (key === todayK) {
        hours = calcNetWorkMinutes(rec.checkIn, now.toISOString()) / 60;
      }
    }

    const pct = hours != null ? Math.min(100, Math.round((hours / targetH) * 100)) : 4;
    const cls = ['week-heatmap-col'];
    if (key === todayK) cls.push('today');
    if (hours == null) cls.push('empty');
    const title = hours != null ? `${day} ${hours.toFixed(1)}h 순근무` : `${day} 미출근`;

    return `<div class="${cls.join(' ')}" title="${title}">
      <div class="week-heatmap-bar" style="height:${pct}%"></div>
      <span class="week-heatmap-label">${day}</span>
    </div>`;
  }).join('');
}

function getPreviousWeekdayKey(from = new Date()) {
  const d = new Date(from);
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return formatDateKey(d);
}

// 전 평일(월요일이면 금요일) 출퇴근·순근무 한 줄
function renderYesterdaySummary() {
  const el = document.getElementById('yesterdaySummaryText');
  if (!el) return;

  const rec = loadRecords()[getPreviousWeekdayKey()];
  if (!rec?.checkIn) {
    el.textContent = '';
    return;
  }

  const inT = formatTime(rec.checkIn);
  if (rec.checkOut) {
    const net = calcNetWorkMinutes(rec.checkIn, rec.checkOut);
    el.textContent = `어제 ${inT} 출근 · ${formatTime(rec.checkOut)} 퇴근 (${formatDuration(net)})`;
  } else {
    el.textContent = `어제 ${inT} 출근 · 미퇴근`;
  }
}

function countElapsedWeekdaysInMonth(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  let n = 0;
  for (let d = 1; d <= now.getDate(); d++) {
    const dow = new Date(y, m, d).getDay();
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return n;
}

// 이번 달 출근일수·평균 순근무 시간 요약
function renderMonthSummary() {
  const el = document.getElementById('monthSummaryText');
  if (!el) return;

  const now = new Date();
  const records = loadRecords();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let days = 0;
  let totalNet = 0;
  let completed = 0;
  for (const [key, rec] of Object.entries(records)) {
    if (!key.startsWith(prefix) || !rec?.checkIn) continue;
    days += 1;
    if (rec.checkOut) {
      totalNet += calcNetWorkMinutes(rec.checkIn, rec.checkOut);
      completed += 1;
    }
  }

  const elapsed = countElapsedWeekdaysInMonth(now);
  if (elapsed === 0) {
    el.textContent = '';
    return;
  }

  const rate = Math.round((days / elapsed) * 100);
  const avg = completed > 0 ? (totalNet / completed / 60).toFixed(1) : null;
  const base = `이번 달 ${days}/${elapsed} 평일 출근 (${rate}%)`;
  el.textContent = avg ? `${base} · 평균 순근무 ${avg}h` : base;
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

  const streakBadge = document.getElementById('streakBadge');
  if (streakBadge) {
    const streak = calcCheckInStreak();
    const isBest = streak >= 2 && streak >= calcBestStreak();
    streakBadge.textContent = isBest ? `🏆 ${streak}일 연속 (최고 기록)` : `🔥 ${streak}일 연속`;
    streakBadge.classList.toggle('hidden', streak < 2);
  }

  renderWeekStrip();
  renderWeekHeatmap();
  renderMonthSummary();
  renderYesterdaySummary();

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

function renderSettings() {
  const settings = loadSettings();
  document.getElementById('notifyBefore').value = settings.notifyBefore;
  const nameEl = document.getElementById('userName');
  const sheetEl = document.getElementById('sheetUrl');
  const themeEl = document.getElementById('themeMode');
  if (nameEl) nameEl.value = settings.userName || '';
  const targetCheckInEl = document.getElementById('targetCheckIn');
  if (targetCheckInEl) targetCheckInEl.value = settings.targetCheckIn || '';
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
  if (typeof renderColorOfDay === 'function') renderColorOfDay();
  if (typeof renderLuckyNumber === 'function') renderLuckyNumber();
  if (typeof renderStretchHint === 'function') renderStretchHint();
  if (typeof renderBalanceGame === 'function') renderBalanceGame();
  if (typeof renderTypingHint === 'function') renderTypingHint();
  if (typeof renderReactionHint === 'function') renderReactionHint();
  if (typeof renderGuessHint === 'function') renderGuessHint();
  if (typeof renderDiceHint === 'function') renderDiceHint();
  if (typeof renderSlotHint === 'function') renderSlotHint();
  if (typeof renderTapHint === 'function') renderTapHint();
  if (typeof renderGameDailyLocks === 'function') renderGameDailyLocks();
  checkAndNotify();
  if (typeof checkFortuneNotify === 'function') checkFortuneNotify();
  if (typeof checkLunchRouletteNotify === 'function') checkLunchRouletteNotify();
  if (typeof maybePrefetchCommute === 'function') maybePrefetchCommute();
  if (typeof initWeatherBrief === 'function') initWeatherBrief();
  if (typeof initNewsBrief === 'function') initNewsBrief();
  updateNetworkStatusUI();
  setAttendanceButtonsEnabled(canAttendNow());
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
  try {
    saveTodayRecord({
      checkIn: checkInISOFromTimeInput(input.value),
      userName: getUserName(),
      fieldWork: isFieldWorkToday(),
    });
  } catch {
    return;
  }
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

function handleBackupData() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) data[key] = JSON.parse(raw);
    } catch (e) {}
  }
  const payload = {
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `출퇴근백업_${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setSyncStatus('백업 파일을 저장했습니다.', 'ok');
}

async function afterBackupRestore() {
  render();
  renderSettings();
  if (typeof renderHermesChat === 'function') renderHermesChat();
  if (typeof renderCommuteCard === 'function') renderCommuteCard();
  if (typeof initNewsBrief === 'function') await initNewsBrief();
  if (typeof initLunchMap === 'function') initLunchMap(true);
}

function handleRestoreFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(reader.result);
      if (!payload?.data || typeof payload.data !== 'object') throw new Error('백업 형식이 아닙니다');
      const entries = Object.entries(payload.data).filter(([key]) => BACKUP_KEYS.includes(key));
      if (!entries.length) throw new Error('복원할 항목이 없습니다');
      if (!confirm(`백업 ${entries.length}개 항목을 복원할까요? 현재 데이터를 덮어씁니다.`)) return;
      for (const [key, value] of entries) {
        localStorage.setItem(key, JSON.stringify(value));
      }
      await afterBackupRestore();
      setSyncStatus('백업 복원 완료', 'ok');
    } catch (e) {
      setSyncStatus(`백업 복원 실패: ${e.message || '알 수 없음'}`, 'err');
    }
    const input = document.getElementById('backupFileInput');
    if (input) input.value = '';
  };
  reader.readAsText(file);
}

function handleSettingsChange() {
  const theme = document.getElementById('themeMode')?.value || 'system';
  const prev = loadSettings();
  const settings = {
    ...prev,
    notifyBefore: document.getElementById('notifyBefore').value,
    userName: (document.getElementById('userName')?.value || '').trim(),
    targetCheckIn: (document.getElementById('targetCheckIn')?.value || '').trim(),
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
    renderProgress(record);
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

    const pollUpdate = () => {
      reg.update();
      checkForRemoteUpdate();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pollUpdate();
    });
    setInterval(pollUpdate, 5 * 60 * 1000);
  } catch (e) {
    console.warn('SW 등록 실패:', e);
  }
}

async function fetchRemoteBuild() {
  try {
    const res = await fetch(`./js/app.js?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const m = (await res.text()).match(/APP_BUILD\s*=\s*['"](\d+)['"]/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function reloadToLatestBuild(build) {
  await purgeAppCaches();
  localStorage.setItem(APP_VERSION_KEY, build);
  window.location.reload();
}

async function checkForRemoteUpdate() {
  const remote = await fetchRemoteBuild();
  if (!remote || remote === APP_BUILD) return false;
  await reloadToLatestBuild(remote);
  return true;
}

async function syncAppVersion() {
  if (await checkForRemoteUpdate()) return;

  const stored = localStorage.getItem(APP_VERSION_KEY);
  if (stored && stored !== APP_BUILD) {
    await reloadToLatestBuild(APP_BUILD);
    return;
  }
  localStorage.setItem(APP_VERSION_KEY, APP_BUILD);
}

function renderAppVersion() {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = `앱 버전 ${APP_BUILD}`;
}

/** 설정 탭 기능 안내: (vNN) 항목만 최근 N개 표시 */
function renderFeatureChangelog() {
  const list = document.getElementById('featureNotesList');
  if (!list) return;

  const versioned = [...list.querySelectorAll('li')]
    .map((li) => {
      const m = li.textContent.match(/\(v(\d+)\)/);
      return m ? { li, v: +m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.v - b.v);
  if (!versioned.length) return;

  const recent = versioned.slice(-FEATURE_CHANGELOG_LIMIT);
  list.replaceChildren();
  recent.forEach(({ li }) => list.appendChild(li));
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
  document.getElementById('btnCheckIn')?.addEventListener('click', handleCheckIn);
  document.getElementById('networkStatus')?.addEventListener('click', () => {
    refreshNetworkGuard().then(() => render());
  });
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
  document.getElementById('btnBackupData')?.addEventListener('click', handleBackupData);
  document.getElementById('btnRestoreData')?.addEventListener('click', () => {
    document.getElementById('backupFileInput')?.click();
  });
  document.getElementById('backupFileInput')?.addEventListener('change', (e) => {
    handleRestoreFile(e.target.files?.[0]);
  });
  document.getElementById('btnSyncSheet').addEventListener('click', syncWeekToSheet);
  document.getElementById('btnTestSheet')?.addEventListener('click', testSheetConnection);
  document.getElementById('btnNotifyPermission').addEventListener('click', requestNotificationPermission);
  document.getElementById('btnClearCache')?.addEventListener('click', hardRefreshApp);
  document.getElementById('btnWifiApply')?.addEventListener('click', handleWifiApply);
  document.getElementById('btnWifiCheckIn')?.addEventListener('click', handleWifiCheckIn);
  document.getElementById('btnWifiDismiss')?.addEventListener('click', handleWifiDismiss);
  document.getElementById('btnDrawFortune')?.addEventListener('click', handleDrawFortune);
  document.getElementById('btnCoinFlip')?.addEventListener('click', () => {
    if (typeof flipCoin === 'function') flipCoin();
  });
  document.getElementById('btnDiceRoll')?.addEventListener('click', () => {
    if (typeof rollDice === 'function') rollDice();
  });
  document.getElementById('btnSlotSpin')?.addEventListener('click', () => {
    if (typeof spinSlot === 'function') spinSlot();
  });
  document.getElementById('btnTapStart')?.addEventListener('click', () => {
    if (typeof startTapChallenge === 'function') startTapChallenge();
  });
  document.getElementById('btnTapHit')?.addEventListener('click', () => {
    if (typeof handleTapHit === 'function') handleTapHit();
  });
  document.getElementById('btnTapAgain')?.addEventListener('click', () => {
    if (typeof resetTapToIdle === 'function') resetTapToIdle();
  });
  document.getElementById('btnSlotAgain')?.addEventListener('click', () => {
    if (typeof resetSlot === 'function') resetSlot();
  });
  document.getElementById('btnDiceAgain')?.addEventListener('click', () => {
    if (typeof resetDice === 'function') resetDice();
  });
  document.getElementById('btnCoinAgain')?.addEventListener('click', () => {
    if (typeof resetCoin === 'function') resetCoin();
  });
  document.querySelectorAll('.btn-rps').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof playRps === 'function') playRps(btn.dataset.rps);
    });
  });
  document.getElementById('btnRpsAgain')?.addEventListener('click', () => {
    if (typeof resetRps === 'function') resetRps();
  });
  document.getElementById('btnStretchStart')?.addEventListener('click', () => {
    if (typeof startStretch === 'function') startStretch();
  });
  document.getElementById('btnStretchCancel')?.addEventListener('click', () => {
    if (typeof cancelStretch === 'function') cancelStretch();
  });
  document.getElementById('btnStretchAgain')?.addEventListener('click', () => {
    if (typeof resetStretchToIdle === 'function') resetStretchToIdle();
  });
  document.getElementById('balanceOptionA')?.addEventListener('click', () => {
    if (typeof pickBalance === 'function') pickBalance('a');
  });
  document.getElementById('balanceOptionB')?.addEventListener('click', () => {
    if (typeof pickBalance === 'function') pickBalance('b');
  });
  document.getElementById('btnBalanceAgain')?.addEventListener('click', () => {
    if (typeof renderBalanceGame === 'function') renderBalanceGame();
  });
  document.getElementById('btnTypingStart')?.addEventListener('click', () => {
    if (typeof startTypingTest === 'function') startTypingTest();
  });
  document.getElementById('typingInput')?.addEventListener('input', (e) => {
    if (typeof handleTypingInput === 'function') handleTypingInput(e.target.value);
  });
  document.getElementById('btnTypingCancel')?.addEventListener('click', () => {
    if (typeof cancelTypingTest === 'function') cancelTypingTest();
  });
  document.getElementById('btnTypingAgain')?.addEventListener('click', () => {
    if (typeof resetTypingToIdle === 'function') resetTypingToIdle();
  });
  document.getElementById('btnReactionStart')?.addEventListener('click', () => {
    if (typeof startReactionTest === 'function') startReactionTest();
  });
  document.getElementById('reactionPlay')?.addEventListener('click', () => {
    if (typeof handleReactionTap === 'function') handleReactionTap();
  });
  document.getElementById('btnReactionAgain')?.addEventListener('click', () => {
    if (typeof resetReactionToIdle === 'function') resetReactionToIdle();
  });
  document.getElementById('btnGuessStart')?.addEventListener('click', () => {
    if (typeof startGuessGame === 'function') startGuessGame();
  });
  document.getElementById('btnGuessSubmit')?.addEventListener('click', () => {
    if (typeof submitGuess === 'function') submitGuess();
  });
  document.getElementById('guessInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && typeof submitGuess === 'function') submitGuess();
  });
  document.getElementById('btnGuessGiveUp')?.addEventListener('click', () => {
    if (typeof giveUpGuessGame === 'function') giveUpGuessGame();
  });
  document.getElementById('btnGuessAgain')?.addEventListener('click', () => {
    if (typeof resetGuessToIdle === 'function') resetGuessToIdle();
  });
  document.getElementById('btnRevealQuote')?.addEventListener('click', handleRevealQuote);
  document.getElementById('btnRevealSaju')?.addEventListener('click', handleRevealSaju);
  document.getElementById('btnSajuGoSettings')?.addEventListener('click', handleSajuGoSettings);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('.fun-subtab').forEach((btn) => {
    btn.addEventListener('click', () => switchFunSubTab(btn.dataset.funPanel));
  });
  switchFunSubTab(loadFunSubTab(), false);

  ['notifyBefore', 'userName', 'targetCheckIn', 'birthDate', 'sheetUrl', 'themeMode', 'fortuneNotify', 'lunchRouletteNotify', 'hermesBaseUrl', 'hermesApiKey', 'hermesModel', 'homeAddress', 'commuteNotify'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', handleSettingsChange);
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.addEventListener('blur', handleSettingsChange);
  });

  applyTheme(loadSettings().theme || 'system');

  renderFeatureChangelog();
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
