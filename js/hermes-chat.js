/**
 * Hermes OpenAI-compatible API 채팅 (설정 탭에서 URL·키 입력)
 */
const HERMES_CHAT_KEY = 'attendance-hermes-chat';
const HERMES_SYSTEM_PROMPT =
  '당신은 출퇴근 PWA 안의 간단한 AI 도우미입니다. 한국어로 짧고 명확하게 답하세요. ' +
  '사용자가 명시적으로 요청하지 않으면 터미널·파일 조작 등 도구는 사용하지 마세요. ' +
  '내 위치는 맛집 탭 지도에 표시되므로, 위치 문의 시 좌표를 채팅에 적지 말고 맛집 탭 📍 내 위치를 안내하세요.';

function getHermesChatConfig() {
  const settings = typeof loadSettings === 'function' ? loadSettings() : {};
  const cfg = window.APP_CONFIG?.hermesChat || {};
  const baseUrl = (settings.hermesBaseUrl || cfg.defaultBaseUrl || '').trim().replace(/\/$/, '');
  const apiKey = (settings.hermesApiKey || '').trim();
  const model = (settings.hermesModel || cfg.defaultModel || 'hermes-agent').trim();
  const timeoutMs = Number(cfg.requestTimeoutMs);
  const requestTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600_000;
  return {
    baseUrl,
    apiKey,
    model,
    requestTimeoutMs,
    systemPrompt: cfg.systemPrompt || HERMES_SYSTEM_PROMPT,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const ms = timeoutMs ?? getHermesChatConfig().requestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`응답 시간 초과 (${Math.round(ms / 1000)}초). Hermes가 아직 처리 중일 수 있어요.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function isHermesConfigured() {
  const { baseUrl, apiKey } = getHermesChatConfig();
  return Boolean(baseUrl && apiKey);
}

function loadChatMessages() {
  try {
    const raw = localStorage.getItem(HERMES_CHAT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveChatMessages(messages) {
  const trimmed = messages.slice(-80);
  localStorage.setItem(HERMES_CHAT_KEY, JSON.stringify(trimmed));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatChatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderHermesChat() {
  renderHermesChatFrom(loadChatMessages());
}

function renderHermesChatFrom(messages) {
  const listEl = document.getElementById('chatMessages');
  const emptyEl = document.getElementById('chatEmpty');
  const setupEl = document.getElementById('chatSetup');
  if (!listEl) return;

  const configured = isHermesConfigured();
  if (setupEl) setupEl.classList.toggle('hidden', configured);
  if (emptyEl) emptyEl.classList.toggle('hidden', !configured || messages.length > 0);
  if (!configured) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = messages
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const body = escapeHtml(m.content || '').replace(/\n/g, '<br>');
      const time = formatChatTime(m.at);
      return `<div class="chat-bubble chat-bubble-${role}" role="article">
        <p class="chat-bubble-text">${body}</p>
        ${time ? `<span class="chat-bubble-time">${time}</span>` : ''}
      </div>`;
    })
    .join('');

  requestAnimationFrame(() => {
    listEl.scrollTop = listEl.scrollHeight;
  });
}

function setChatStatus(text, kind) {
  const el = document.getElementById('chatStatus');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    el.textContent = '';
    el.className = 'chat-status hidden';
    return;
  }
  el.textContent = text;
  el.className = `chat-status chat-status-${kind || 'info'}`;
  el.classList.remove('hidden');
}

function setChatBusy(busy) {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('btnChatSend');
  if (form) form.classList.toggle('is-busy', busy);
  if (input) input.disabled = busy;
  if (btn) btn.disabled = busy;
}

let chatElapsedTimer = null;
let chatKeepaliveTimer = null;

function startChatElapsedTimer() {
  stopChatElapsedTimer();
  const start = Date.now();
  chatElapsedTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - start) / 1000);
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    setChatStatus(`응답 생성 중… ${m}:${s}`, 'info');
  }, 1000);
}

function stopChatElapsedTimer() {
  if (chatElapsedTimer) {
    clearInterval(chatElapsedTimer);
    chatElapsedTimer = null;
  }
}

/** ponytail: ngrok/CF idle cut ~100–300s; 45s health ping during long chat */
function startChatKeepalive() {
  stopChatKeepalive();
  const { baseUrl } = getHermesChatConfig();
  if (!baseUrl) return;
  const root = baseUrl.replace(/\/v1\/?$/, '');
  chatKeepaliveTimer = setInterval(() => {
    fetch(`${root}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
  }, 45_000);
}

function stopChatKeepalive() {
  if (chatKeepaliveTimer) {
    clearInterval(chatKeepaliveTimer);
    chatKeepaliveTimer = null;
  }
}

function parseSseChatDelta(line) {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    return json?.choices?.[0]?.delta?.content
      || json?.choices?.[0]?.message?.content
      || '';
  } catch {
    return null;
  }
}

async function readStreamingChatReply(res, onPartial) {
  if (!res.body) throw new Error('스트리밍 응답 본문이 없습니다.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const delta = parseSseChatDelta(line.trim());
      if (!delta) continue;
      fullText += delta;
      onPartial(fullText);
    }
  }

  return fullText.trim();
}

function setHermesTestStatus(text, kind) {
  const el = document.getElementById('hermesTestStatus');
  if (!el) return;
  el.textContent = text || '';
  const cls = kind === 'ok' ? 'ok' : kind === 'error' ? 'err' : '';
  el.className = cls ? `sync-status ${cls}` : 'sync-status';
}

function getHermesConnectionHint(baseUrl) {
  const pageHttps = window.location.protocol === 'https:';
  const apiHttp = /^http:\/\//i.test(baseUrl || '');
  const apiLocal = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(baseUrl || '');
  const onGithubPages = /\.github\.io$/i.test(window.location.hostname);

  if (pageHttps && apiHttp) {
    return 'HTTPS 페이지에서는 http:// API를 브라우저가 차단합니다(혼합 콘텐츠). API 주소를 https:// 터널 URL/v1 로 바꾸세요.';
  }
  if (onGithubPages && apiLocal) {
    return 'GitHub Pages에서는 PC의 127.0.0.1에 연결할 수 없습니다. PC에서 터널을 켜고 https://xxxx/v1 주소를 넣으세요.';
  }
  if (apiLocal) {
    return 'PC에서 hermes gateway가 실행 중인지 확인하세요. 주소: http://127.0.0.1:8642/v1';
  }
  return 'gateway·터널이 켜져 있는지, API 주소 끝에 /v1 이 있는지 확인하세요.';
}

async function testHermesConnection() {
  const { baseUrl, apiKey } = getHermesChatConfig();
  if (!baseUrl || !apiKey) {
    const msg = 'API 주소와 키를 입력해 주세요.';
    setChatStatus(msg, 'error');
    setHermesTestStatus(msg, 'error');
    return false;
  }

  setHermesTestStatus('연결 확인 중…', '');
  const root = baseUrl.replace(/\/v1\/?$/, '');
  const { requestTimeoutMs } = getHermesChatConfig();
  try {
    const healthRes = await fetchWithTimeout(`${root}/health`, { method: 'GET', cache: 'no-store' }, 30_000);
    if (!healthRes.ok) throw new Error(`health HTTP ${healthRes.status}`);

    const modelsRes = await fetchWithTimeout(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    }, 30_000);
    if (!modelsRes.ok) throw new Error(`인증 실패 (HTTP ${modelsRes.status}). API 키를 확인하세요.`);

    setChatStatus('Hermes 연결 성공', 'ok');
    setHermesTestStatus('연결 성공', 'ok');
    if (typeof renderHermesChat === 'function') renderHermesChat();
    return true;
  } catch (e) {
    const hint = getHermesConnectionHint(baseUrl);
    const msg = `연결 실패: ${e.message || e}. ${hint}`;
    setChatStatus(msg, 'error');
    setHermesTestStatus(msg, 'error');
    return false;
  }
}

async function sendHermesChatMessage(userText) {
  const text = (userText || '').trim();
  if (!text) return;

  const { baseUrl, apiKey, model, systemPrompt, requestTimeoutMs } = getHermesChatConfig();
  if (!baseUrl || !apiKey) {
    setChatStatus('설정에서 Hermes API 주소와 키를 입력해 주세요.', 'error');
    return;
  }

  const messages = loadChatMessages();
  const userMsg = { role: 'user', content: text, at: new Date().toISOString() };
  messages.push(userMsg);
  saveChatMessages(messages);
  renderHermesChat();
  setChatBusy(true);
  startChatElapsedTimer();
  startChatKeepalive();

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(({ role, content }) => ({ role, content })),
  ];

  const requestBody = {
    model,
    messages: apiMessages,
    stream: true,
  };

  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, requestTimeoutMs);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = data?.error?.message || data?.message || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const contentType = res.headers.get('content-type') || '';
    let reply = '';

    if (contentType.includes('text/event-stream') && res.body) {
      messages.push({ role: 'assistant', content: '…', at: new Date().toISOString() });
      reply = await readStreamingChatReply(res, (partial) => {
        messages[messages.length - 1].content = partial || '…';
        renderHermesChatFrom(messages);
      });
    } else {
      const data = await res.json().catch(() => ({}));
      reply = data?.choices?.[0]?.message?.content?.trim() || '';
      messages.push({ role: 'assistant', content: reply || '(빈 응답)', at: new Date().toISOString() });
      saveChatMessages(messages);
    }

    reply = reply || '(빈 응답)';
    if (contentType.includes('text/event-stream') && res.body) {
      messages[messages.length - 1] = { role: 'assistant', content: reply, at: new Date().toISOString() };
      saveChatMessages(messages);
    }
    setChatStatus('', '');
  } catch (e) {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && (!last.content || last.content === '…')) {
      messages.pop();
      saveChatMessages(messages);
    }
    const isAbort = e?.name === 'AbortError' || /시간 초과|timeout/i.test(String(e.message));
    const hint = isAbort
      ? ' 터널·프록시 idle 타임아웃(약 100~300초)일 수 있어요. 화면 켜두고 다시 시도해 보세요.'
      : '';
    setChatStatus(`전송 실패: ${e.message || e}${hint}`, 'error');
  } finally {
    stopChatElapsedTimer();
    stopChatKeepalive();
    setChatBusy(false);
    renderHermesChat();
  }
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  if (!input || input.disabled) return;
  const text = input.value;
  input.value = '';
  input.style.height = 'auto';
  sendHermesChatMessage(text);
}

function handleChatClear() {
  if (!confirm('대화 기록을 모두 지울까요?')) return;
  localStorage.removeItem(HERMES_CHAT_KEY);
  renderHermesChat();
  setChatStatus('', '');
}

function handleChatGoSettings() {
  if (typeof switchTab === 'function') switchTab('settings');
  document.getElementById('hermesBaseUrl')?.focus();
}

function consumeChatDeepLink() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'chat') {
    if (typeof switchTab === 'function') switchTab('chat');
  }

  const url = (params.get('hermes_url') || '').trim();
  const key = (params.get('hermes_key') || '').trim();
  if (!url && !key) return;
  if (typeof loadSettings !== 'function' || typeof saveSettings !== 'function') return;

  const settings = loadSettings();
  let changed = false;
  if (url) {
    settings.hermesBaseUrl = url.replace(/\/$/, '');
    changed = true;
  }
  if (key) {
    settings.hermesApiKey = key;
    changed = true;
  }
  if (changed) {
    saveSettings(settings);
    params.delete('hermes_url');
    params.delete('hermes_key');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
    if (typeof renderSettings === 'function') renderSettings();
    if (typeof renderHermesChat === 'function') renderHermesChat();
  }
}

function seedHermesDevDefaults() {
  if (typeof loadSettings !== 'function' || typeof saveSettings !== 'function') return;
  const cfg = window.APP_CONFIG?.hermesChat?.devDefaults;
  if (!cfg) return;
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return;

  const settings = loadSettings();
  let changed = false;
  if (!settings.hermesBaseUrl && cfg.baseUrl) {
    settings.hermesBaseUrl = cfg.baseUrl;
    changed = true;
  }
  if (!settings.hermesApiKey && cfg.apiKey) {
    settings.hermesApiKey = cfg.apiKey;
    changed = true;
  }
  if (changed) saveSettings(settings);
}

let hermesChatInited = false;
let chatViewportBound = false;

function bindChatViewport() {
  if (chatViewportBound || !window.visualViewport) return;
  const stage = document.querySelector('.chat-stage');
  if (!stage) return;
  chatViewportBound = true;

  const sync = () => {
    const vv = window.visualViewport;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    stage.style.setProperty('--chat-kb-offset', `${kb}px`);
  };

  window.visualViewport.addEventListener('resize', sync);
  window.visualViewport.addEventListener('scroll', sync);
  sync();
}

function initHermesChat() {
  if (hermesChatInited) return;
  hermesChatInited = true;

  bindChatViewport();
  seedHermesDevDefaults();

  document.getElementById('chatForm')?.addEventListener('submit', handleChatSubmit);
  document.getElementById('btnChatClear')?.addEventListener('click', handleChatClear);
  document.getElementById('btnChatGoSettings')?.addEventListener('click', handleChatGoSettings);
  document.getElementById('btnHermesTest')?.addEventListener('click', testHermesConnection);

  const input = document.getElementById('chatInput');
  if (input) {
    const autosize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
    };
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSubmit(e);
      }
    });
  }
}
