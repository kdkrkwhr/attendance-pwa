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

function getUserName() {
  return (loadSettings().userName || '').trim();
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
  const btnOut = document.getElementById('btnCheckOut');

  if (checkInInput && !checkInInputFocused) {
    checkInInput.value = hasCheckIn
      ? toTimeInputValue(parseISO(record.checkIn))
      : toTimeInputValue(now);
    checkInInput.disabled = !!record?.checkOut;
  }

  if (!hasCheckIn) {
    badge.textContent = '미출근';
    badge.className = 'badge';
    leaveEl.textContent = '—';
    if (checkInHint) checkInHint.textContent = '출근 시각 선택 후 등록';
    countdown.textContent = '지문 찍을 때 출근 시각도 맞춰주세요';
    countdown.className = 'countdown';
    btnIn.classList.remove('hidden');
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
    checkInHint.textContent = record.checkOut ? '퇴근 완료' : '탭해서 출근 시각 수정';
  }

  if (record.checkOut) {
    badge.textContent = '퇴근 완료';
    badge.className = 'badge done';
    const worked = calcWorkedMinutes(record.checkIn, record.checkOut);
    countdown.textContent = `실제 근무: ${formatDuration(calcNetWorkMinutes(record.checkIn, record.checkOut))} (체류 ${formatDuration(worked)})`;
    countdown.className = 'countdown';
    btnIn.classList.add('hidden');
    btnOut.classList.add('hidden');
    return;
  }

  badge.textContent = '근무 중';
  badge.className = 'badge working';
  btnIn.classList.add('hidden');
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
}

// ── 액션 ──────────────────────────────────────────

function handleCheckIn() {
  const existing = getTodayRecord();
  if (existing?.checkIn) return;

  if (!getUserName()) {
    alert('먼저 이름을 입력해주세요.');
    document.getElementById('userName')?.focus();
    return;
  }

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

function handleCheckInTimeChange() {
  const record = getTodayRecord();
  if (!record?.checkIn || record.checkOut) return;

  const input = document.getElementById('checkInInput');
  if (!input?.value) return;

  const newCheckIn = checkInISOFromTimeInput(input.value);
  if (newCheckIn === record.checkIn) return;

  saveTodayRecord({
    ...record,
    checkIn: newCheckIn,
  });
  clearTodayNotifications();

  render();
  const settings = loadSettings();
  if (settings.sheetUrl) {
    syncRecordToSheet(todayKey(), getTodayRecord()).catch(() => {});
  }
}

function handleCheckInTimePreview() {
  const record = getTodayRecord();
  if (record?.checkIn) return;

  const input = document.getElementById('checkInInput');
  const leaveEl = document.getElementById('leaveTime');
  if (!input?.value || !leaveEl) return;

  const preview = calcLeaveTime(checkInISOFromTimeInput(input.value));
  leaveEl.textContent = formatTime(preview);
}

function handleCheckOut() {
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

function handleBackupWeek() {
  const name = getUserName();
  if (!name) {
    alert('이름을 먼저 입력해주세요.');
    return;
  }
  const payload = {
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    weekStart: getWeekStartKey(),
    records: getWeekRecords(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `출퇴근_이번주_${name}_${getWeekStartKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function handleRestoreFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.records || typeof data.records !== 'object') {
        throw new Error('형식이 올바르지 않습니다');
      }

      const records = loadRecords();
      Object.assign(records, data.records);
      saveRecords(records);

      if (data.name) {
        const settings = loadSettings();
        settings.userName = data.name;
        saveSettings(settings);
      }

      alert(`복원 완료: ${Object.keys(data.records).length}일 기록`);
      render();
    } catch (err) {
      alert(`복원 실패: ${err.message}`);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
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
  document.getElementById('btnCheckOut').addEventListener('click', handleCheckOut);

  const checkInInput = document.getElementById('checkInInput');
  if (checkInInput) {
    checkInInput.addEventListener('focus', () => { checkInInputFocused = true; });
    checkInInput.addEventListener('blur', () => {
      checkInInputFocused = false;
      handleCheckInTimeChange();
      render();
    });
    checkInInput.addEventListener('input', handleCheckInTimePreview);
    checkInInput.addEventListener('change', () => {
      handleCheckInTimeChange();
      handleCheckInTimePreview();
      render();
    });
  }

  document.getElementById('btnResetToday').addEventListener('click', handleResetToday);
  document.getElementById('btnExport').addEventListener('click', handleExport);
  document.getElementById('btnBackupWeek').addEventListener('click', handleBackupWeek);
  document.getElementById('btnRestore').addEventListener('click', () => {
    document.getElementById('restoreFile').click();
  });
  document.getElementById('restoreFile').addEventListener('change', handleRestoreFile);
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
  tickInterval = setInterval(render, 30_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
}

init();
