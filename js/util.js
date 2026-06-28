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
})();
