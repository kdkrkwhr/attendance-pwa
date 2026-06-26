const STORAGE_KEY = 'attendance-records';
const SETTINGS_KEY = 'attendance-settings';
const NOTIFIED_KEY = 'attendance-notified';

/** 8시간 근무 + 점심 1시간 (고정) */
const WORK_HOURS = 8;
const LUNCH_MINUTES = 60;
const DAY_SPAN_MINUTES = WORK_HOURS * 60 + LUNCH_MINUTES;

const DEFAULT_SETTINGS = {
  notifyBefore: '30,10,0',
  userName: '',
  sheetUrl: '',
};

let tickInterval = null;
let deferredInstallPrompt = null;
let checkInInputFocused = false;
let checkInInputTouched = false;
let checkInTimeDirty = false;
let onCompanyNetwork = null;
let networkCheckAt = 0;
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
  const ok = await checkCompanyNetwork(true);
  updateNetworkStatusUI();
  setAttendanceButtonsEnabled(ok || !isNetworkGuardActive());

  if (!isNetworkGuardActive()) return true;

  if (!ok) {
    alert('회사 Wi-Fi에 연결된 후 출퇴근할 수 있습니다.');
    return false;
  }
  return true;
}

async function refreshNetworkGuard() {
  await checkCompanyNetwork(true);
  updateNetworkStatusUI();
  const canAttend = onCompanyNetwork || !isNetworkGuardActive();
  setAttendanceButtonsEnabled(canAttend);
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

function todayKey() {
  return formatDateKey(new Date());
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

function getDisplayName() {
  return (loadSettings().userName || '').trim();
}

function getUserName() {
  return getDisplayName() || '사원';
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
  };
}

async function syncRecordToSheet(dateKey, record) {
  const settings = loadSettings();
  const url = (settings.sheetUrl || '').trim();
  const name = getUserName();
  if (!url || !name) return { ok: false, skipped: true };

  const res = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(recordToSyncRow(dateKey, record)),
  });
  return res.json();
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

async function loadTeamWeek() {
  const settings = loadSettings();
  const url = (settings.sheetUrl || '').trim();
  const box = document.getElementById('teamWeekBox');
  const list = document.getElementById('teamWeekList');
  if (!url || !box || !list) return;

  try {
    const weekStart = getWeekStartKey();
    const res = await fetch(`${url}?weekStart=${weekStart}`, { mode: 'cors' });
    const data = await res.json();
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function sendNotification(title, body) {
  if (Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'NOTIFY', title, body });
  } else {
    new Notification(title, { body, icon: 'icon-192.png' });
  }
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
      sendNotification('퇴근 알림', `${formatTime(leaveTime)} 퇴근 · ${label}`);
      markNotified(key);
    }
  }
}

// ── UI 렌더 ──────────────────────────────────────────

function renderToday() {
  const record = getTodayRecord();
  const now = new Date();
  const hasCheckIn = !!(record?.checkIn);

  document.getElementById('todayDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${DAY_NAMES[now.getDay()]})`;

  const badge = document.getElementById('statusBadge');
  const checkInInput = document.getElementById('checkInInput');
  const checkInHint = document.getElementById('checkInHint');
  const leaveEl = document.getElementById('leaveTime');
  const countdown = document.getElementById('countdown');
  const btnIn = document.getElementById('btnCheckIn');
  const btnSave = document.getElementById('btnSaveCheckIn');
  const btnOut = document.getElementById('btnCheckOut');

  if (checkInInput && !checkInInputFocused) {
    if (hasCheckIn) {
      checkInInput.value = toTimeInputValue(parseISO(record.checkIn));
      checkInInput.disabled = false;
    } else if (!checkInInputTouched) {
      checkInInput.value = toTimeInputValue(now);
      checkInInput.disabled = false;
    }
  }

  if (!hasCheckIn) {
    badge.textContent = '미출근';
    badge.className = 'badge';
    leaveEl.textContent = '—';
    if (checkInHint) checkInHint.textContent = '① 출근 시각 선택 → ② 출근 등록 (이름 없으면 사원)';
    countdown.textContent = '출근 시각은 등록 후에도 바꿀 수 있어요';
    countdown.className = 'countdown';
    btnIn.classList.remove('hidden');
    btnSave?.classList.add('hidden');
    btnOut.classList.add('hidden');

    if (checkInInput?.value) {
      const preview = calcLeaveTime(checkInISOFromTimeInput(checkInInput.value));
      leaveEl.textContent = formatTime(preview);
    }
    return;
  }

  const checkIn = parseISO(record.checkIn);
  const leaveTime = calcLeaveTime(record.checkIn);
  leaveEl.textContent = formatTime(leaveTime);
  if (checkInHint) {
    checkInHint.textContent = record.checkOut
      ? '퇴근 완료 · 출근 시각을 바꾸려면 아래 저장 버튼'
      : '출근 시각 바꾼 뒤 「출근 시각 저장」을 눌러주세요';
  }

  if (record.checkOut) {
    badge.textContent = '퇴근 완료';
    badge.className = 'badge done';
    const worked = calcWorkedMinutes(record.checkIn, record.checkOut);
    countdown.textContent = `실제 근무: ${formatDuration(calcNetWorkMinutes(record.checkIn, record.checkOut))} (체류 ${formatDuration(worked)})`;
    countdown.className = 'countdown';
    btnIn.classList.add('hidden');
    btnSave?.classList.toggle('hidden', !checkInTimeDirty);
    btnOut.classList.add('hidden');
    return;
  }

  badge.textContent = '근무 중';
  badge.className = 'badge working';
  btnIn.classList.add('hidden');
  btnSave?.classList.toggle('hidden', !checkInTimeDirty);
  btnOut.classList.remove('hidden');

  const diffMs = leaveTime - now;
  if (diffMs > 0) {
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    countdown.textContent = `퇴근까지 ${h > 0 ? `${h}시간 ` : ''}${m}분 · ${formatTime(checkIn)} 출근`;
    countdown.className = h === 0 && m <= 30 ? 'countdown urgent' : 'countdown';
  } else {
    const over = Math.abs(diffMs);
    const m = Math.floor(over / 60000);
    countdown.textContent = m < 5 ? '퇴근 가능합니다!' : `퇴근 가능 (${m}분 경과)`;
    countdown.className = 'countdown ready';
  }
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

    return `<li class="week-item ${isToday ? 'today' : ''}">
      <span class="day">${dayLabel}</span>
      <span class="times">${timesText}</span>
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
  if (nameEl) nameEl.value = settings.userName || '';
  if (sheetEl) sheetEl.value = settings.sheetUrl || '';
}

function render() {
  renderToday();
  renderWeek();
  renderSettings();
  checkAndNotify();
  loadTeamWeek();
  updateNetworkStatusUI();
  if (isNetworkGuardActive() && onCompanyNetwork === false) {
    setAttendanceButtonsEnabled(false);
  }
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
  });
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
  const preview = calcLeaveTime(checkInISOFromTimeInput(input.value));
  leaveEl.textContent = formatTime(preview);

  const record = getTodayRecord();
  if (record?.checkIn) {
    markCheckInTimeDirty();
  }
}

async function handleCheckOut() {
  if (!(await requireCompanyNetwork())) return;

  const record = getTodayRecord();
  if (!record?.checkIn || record.checkOut) return;

  saveTodayRecord({
    ...record,
    checkOut: new Date().toISOString(),
  });

  render();
  const settings = loadSettings();
  if (settings.sheetUrl) {
    syncRecordToSheet(todayKey(), getTodayRecord()).then((r) => {
      if (r.ok) setSyncStatus('팀 시트에 퇴근 저장됨', 'ok');
      loadTeamWeek();
    }).catch(() => {});
  }
}

function handleResetToday() {
  if (!confirm('오늘 기록을 삭제할까요?')) return;
  const records = loadRecords();
  delete records[todayKey()];
  saveRecords(records);
  checkInInputTouched = false;
  checkInTimeDirty = false;

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
  const rows = [['이름', '날짜', '출근', '퇴근', '퇴근예정', '순근무(분)']];

  Object.keys(records).sort().forEach((key) => {
    const r = records[key];
    if (!r.checkIn) return;
    const leave = calcLeaveTime(r.checkIn);
    const netWork = r.checkOut ? calcNetWorkMinutes(r.checkIn, r.checkOut) : '';
    rows.push([
      r.userName || name,
      key,
      formatTimeShort(parseISO(r.checkIn)),
      r.checkOut ? formatTimeShort(parseISO(r.checkOut)) : '',
      formatTimeShort(leave),
      netWork,
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
  const settings = {
    ...loadSettings(),
    notifyBefore: document.getElementById('notifyBefore').value,
    userName: (document.getElementById('userName')?.value || '').trim(),
    sheetUrl: (document.getElementById('sheetUrl')?.value || '').trim(),
  };
  saveSettings(settings);

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

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('SW 등록 실패:', e);
  }
}

// ── 초기화 ──────────────────────────────────────────

function init() {
  registerSW();

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
  document.getElementById('btnNotifyPermission').addEventListener('click', requestNotificationPermission);

  ['notifyBefore', 'userName', 'sheetUrl'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', handleSettingsChange);
    if (el.tagName === 'INPUT') el.addEventListener('blur', handleSettingsChange);
  });

  render();
  updateInstallUI();
  refreshNetworkGuard();
  tickInterval = setInterval(render, 30_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshNetworkGuard();
      render();
    }
  });
}

init();
