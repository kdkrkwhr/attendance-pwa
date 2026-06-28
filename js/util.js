/** ponytail: shared helpers — load before other app scripts */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayKey(date = new Date()) {
  return formatDateKey(date);
}

async function loadDailyJson(folder) {
  const date = todayKey();
  const q = window.APP_VERSION ? `?v=${encodeURIComponent(window.APP_VERSION)}` : '';
  for (const name of [`${date}.json`, 'latest.json']) {
    try {
      const res = await fetch(`./data/${folder}/${name}${q}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.date === date || name === 'latest.json') return data;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** script.google.com exec URL — bare deployment ID도 허용 */
function normalizeSheetUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '');
  const id = s.match(/macros\/s\/([^/?#]+)/)?.[1] || (/^AKfycb[\w-]+$/i.test(s) ? s : '');
  if (id) return `https://script.google.com/macros/s/${id}/exec`;
  return s;
}

async function parseSheetResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (/accounts\.google\.com|ServiceLogin|Sign in|로그인/i.test(text)) {
      throw new Error('GAS가 로그인 요구 중 — "Google계정 사용자" 말고 "모든 사용자(익명)"로 재배포');
    }
    throw new Error('시트 응답 오류 (URL·배포 확인)');
  }
}

/** ponytail: GAS POST redirect lacks CORS headers — no-cors fire-and-forget */
async function postToSheet(url, body) {
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
}

function consumeTabDeepLink(tab) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') !== tab) return;
  if (typeof switchTab === 'function') switchTab(tab);
  params.delete('tab');
  const qs = params.toString();
  history.replaceState({}, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

(function utilSelfCheck() {
  if (todayKey(new Date(2026, 5, 28)) !== '2026-06-28') throw new Error('todayKey');
  if (escapeHtml('<a&">') !== '&lt;a&amp;&quot;&gt;') throw new Error('escapeHtml');
  const id = 'AKfycby6c6G5E_test';
  if (!normalizeSheetUrl(id).endsWith(`${id}/exec`)) throw new Error('normalizeSheetUrl');
})();
