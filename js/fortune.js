/**
 * Fun 탭 — 오늘의 운세 (하루 1회)
 */
const FORTUNE_STORAGE_KEY = 'attendance-fortune';
const FORTUNE_NOTIFY_HOUR = 10;

const FORTUNE_GRADES = {
  great: { label: '대길', emoji: '🌟', color: '#f59e0b' },
  good: { label: '길', emoji: '✨', color: '#8b5cf6' },
  normal: { label: '소길', emoji: '🍀', color: '#10b981' },
  chill: { label: '평온', emoji: '☁️', color: '#60a5fa' },
};

const FORTUNES = [
  { grade: 'great', text: '오늘은 아이디어가 샘솟는 날! 회의에서 한마디가 통할 거예요.', lucky: '커피', avoid: '애매한 답변' },
  { grade: 'great', text: '동료가 도와줄 운이 가득해요. 협업이 술술 풀립니다.', lucky: '칭찬 한마디', avoid: '혼자 끙끙' },
  { grade: 'good', text: '점심 메뉴 고민 끝! 우연히 맛집을 발견할지도.', lucky: '새 메뉴', avoid: '같은 메뉴만' },
  { grade: 'good', text: '오후에 집중력이 올라가요. 어려운 일은 2시 이후에!', lucky: '이어폰', avoid: '잦은 알림' },
  { grade: 'normal', text: '차분히 가면 충분한 하루. 급할수록 천천히.', lucky: '물 자주', avoid: '성급한 결정' },
  { grade: 'chill', text: '오늘은 휴식도 실력입니다. 잠깐의 산책이 행운을 불러요.', lucky: '창가 자리', avoid: '과로' },
  { grade: 'great', text: '퇴근이 예정보다 수월할 확률 UP! 일정을 잘 밀어붙이세요.', lucky: '체크리스트', avoid: '미루기' },
  { grade: 'good', text: '메일 한 통이 좋은 소식을 가져올 수 있어요.', lucky: '정리된 서명', avoid: '늦은 답장' },
  { grade: 'normal', text: '작은 실수는 웃어넘기면 오히려 인연이 됩니다.', lucky: '유머', avoid: '지나친 완벽주의' },
  { grade: 'good', text: '오늘은 듣는 쪽이 이기는 날. 상대 말을 끝까지 들어보세요.', lucky: '메모', avoid: '말 끊기' },
  { grade: 'great', text: '외근·야외 일정이 있다면 날씨도 도와줄 거예요!', lucky: '우산 챙기기', avoid: '과한 짐' },
  { grade: 'chill', text: '커피 한 잔의 여유가 오후를 살려줍니다.', lucky: '라떼', avoid: '과한 카페인' },
  { grade: 'good', text: '숨겨둔 파일을 찾는 행운! 검색 한 번 더 해보세요.', lucky: '키워드 검색', avoid: '폴더 뒤지기' },
  { grade: 'normal', text: '오늘은 기본기가 빛나는 날. 꼼꼼함이 칭찬받아요.', lucky: '더블 체크', avoid: '대충 넘기기' },
  { grade: 'great', text: '새로운 도구나 단축키를 배우기 좋은 날이에요.', lucky: '단축키', avoid: '옛날 방식 고집' },
  { grade: 'good', text: '점심 후 졸림을 이기면 오후 운이 열려요.', lucky: '가벼운 산책', avoid: '과식' },
  { grade: 'chill', text: '무리하지 않아도 할 일은 다 됩니다. 믿고 가요.', lucky: '짧은 휴식', avoid: '죄책감' },
  { grade: 'normal', text: '차분한 톤이 설득력을 높여요. 부드럽게 말해보세요.', lucky: '미소', avoid: '날카로운 표현' },
  { grade: 'good', text: '오래 미뤄둔 작은 일 하나만 해도 뿌듯한 하루!', lucky: '5분 타이머', avoid: '완벽 대기' },
  { grade: 'great', text: '팀 분위기 메이커가 되는 날! 밝은 인사가 행운의 시작.', lucky: '안녕하세요', avoid: '무표정' },
  { grade: 'good', text: '의자 한 번만 바꿔 앉아도 집중력이 달라져요.', lucky: '자세 교정', avoid: '구부정' },
  { grade: 'normal', text: '예상 밖의 칭찬이 들어올 수 있어요. 겸손하게!', lucky: '감사 인사', avoid: '겸손 없는 반응' },
  { grade: 'chill', text: '오늘은 느긋한 점심이 최고의 투자입니다.', lucky: '천천히 식사', avoid: '웁스 퇴근' },
  { grade: 'great', text: '문서 작성 운 최고! 초안부터 쓰면 금방 끝나요.', lucky: '빈 화면', avoid: '무한 수정' },
  { grade: 'good', text: '동료와 커피챗 한 잔이 힌트를 줄지도 몰라요.', lucky: '복도 마주침', avoid: '혼밥 고집' },
  { grade: 'normal', text: '숫자·데이터를 다시 보면 답이 보이는 날.', lucky: '엑셀', avoid: '감만 믿기' },
  { grade: 'good', text: '오후 회의에서 좋은 제안이 통할 확률 UP.', lucky: '짧은 발표', avoid: '장황한 설명' },
  { grade: 'chill', text: '가끔은 「모르겠습니다」가 최선의 답일 때도 있어요.', lucky: '솔직함', avoid: '억지 답' },
  { grade: 'great', text: '깔끔한 책상이 맑은 머리를 부릅니다. 5분 정리 GO!', lucky: '정리', avoid: '어질러진 책상' },
  { grade: 'normal', text: '오늘은 배우는 쪽이 이득. 질문 하나 던져보세요.', lucky: '궁금증', avoid: '모른 척' },
  { grade: 'good', text: '퇴근길에 좋은 생각이 떠오를 수 있어요. 메모 준비!', lucky: '메모 앱', avoid: '뇌만 믿기' },
  { grade: 'great', text: '농담 한 방에 긴장이 풀리는 날. 가볍게 분위기 UP!', lucky: '밈', avoid: '딱딱함' },
  { grade: 'chill', text: '완벽하지 않아도 괜찮은 하루. 80%면 충분해요.', lucky: '만족', avoid: '자책' },
  { grade: 'good', text: '스탠딩 5분이 허리와 운세를 동시에 챙겨줘요.', lucky: '스트레칭', avoid: '장시간 앉기' },
  { grade: 'normal', text: '오늘은 듣기 좋은 플레이리스트가 행운을 불러요.', lucky: 'BGM', avoid: '정적' },
  { grade: 'good', text: '작은 친절이 돌아오는 날. 문 잡아주기도 운이에요.', lucky: '배려', avoid: '서두름' },
  { grade: 'great', text: '오늘 결정한 일이 내일의 칭찬으로 이어질 거예요!', lucky: '결단', avoid: '미루기' },
  { grade: 'chill', text: '점심 후 10분 낮잠은 금지지만, 눈 감고 쉬기는 OK.', lucky: '눈 감기', avoid: '과한 졸음' },
  { grade: 'normal', text: '차가운 물 한 모금이 오후의 시작을 상쾌하게.', lucky: '물', avoid: '탄산만' },
  { grade: 'good', text: '오늘은 「일단 해보기」가 통하는 날입니다.', lucky: '시작', avoid: '망설임' },
];

function hashFortuneSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function loadTodayFortune() {
  try {
    const data = JSON.parse(localStorage.getItem(FORTUNE_STORAGE_KEY) || 'null');
    if (!data || data.dayKey !== todayKey()) return null;
    return data;
  } catch {
    return null;
  }
}

function saveTodayFortune(fortuneIndex) {
  const fortune = FORTUNES[fortuneIndex];
  const record = {
    dayKey: todayKey(),
    index: fortuneIndex,
    drawnAt: new Date().toISOString(),
    ...fortune,
  };
  localStorage.setItem(FORTUNE_STORAGE_KEY, JSON.stringify(record));
  return record;
}

function pickFortuneIndex() {
  const name = typeof getUserName === 'function' ? getUserName() : '';
  const seed = hashFortuneSeed(`${todayKey()}:${name || '사원'}`);
  return seed % FORTUNES.length;
}

function drawTodayFortune() {
  const existing = loadTodayFortune();
  if (existing) return existing;
  return saveTodayFortune(pickFortuneIndex());
}

function getFortuneGradeMeta(grade) {
  return FORTUNE_GRADES[grade] || FORTUNE_GRADES.normal;
}

function renderFortune() {
  const idleEl = document.getElementById('fortuneIdle');
  const resultEl = document.getElementById('fortuneResult');
  const btnDraw = document.getElementById('btnDrawFortune');
  if (!idleEl || !resultEl) return;

  const record = loadTodayFortune();

  if (!record) {
    idleEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    if (btnDraw) btnDraw.disabled = false;
    return;
  }

  idleEl.classList.add('hidden');
  resultEl.classList.remove('hidden');

  const meta = getFortuneGradeMeta(record.grade);
  const gradeEl = document.getElementById('fortuneGrade');
  const emojiEl = document.getElementById('fortuneEmoji');
  const textEl = document.getElementById('fortuneText');
  const luckyEl = document.getElementById('fortuneLucky');
  const avoidEl = document.getElementById('fortuneAvoid');
  const stampEl = document.getElementById('fortuneStamp');

  if (gradeEl) gradeEl.textContent = meta.label;
  if (emojiEl) emojiEl.textContent = meta.emoji;
  if (textEl) textEl.textContent = record.text;
  if (luckyEl) luckyEl.textContent = record.lucky;
  if (avoidEl) avoidEl.textContent = record.avoid;
  if (stampEl) stampEl.textContent = '오늘 확인 완료';
  if (resultEl) {
    resultEl.style.setProperty('--fortune-accent', meta.color);
  }
}

function handleDrawFortune() {
  const card = document.getElementById('fortuneCard');
  card?.classList.add('fortune-shake');
  setTimeout(() => {
    card?.classList.remove('fortune-shake');
    drawTodayFortune();
    renderFortune();
  }, 450);
}

function checkFortuneNotify() {
  const settings = typeof loadSettings === 'function' ? loadSettings() : {};
  if (settings.fortuneNotify === false) return;

  const now = new Date();
  if (now.getHours() !== FORTUNE_NOTIFY_HOUR || now.getMinutes() >= 5) return;

  const key = `${todayKey()}-fortune-10`;
  if (typeof wasNotified === 'function' && wasNotified(key)) return;

  if (typeof markNotified === 'function') markNotified(key);
  if (typeof sendNotification === 'function') {
    sendNotification(
      '🔮 오늘의 운세',
      '하루에 한 번! Fun 탭에서 운세를 확인해 보세요',
      'fortune-reminder',
      './?tab=fun',
    );
  }
}

function consumeFunDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab === 'fun' && typeof switchTab === 'function') {
    switchTab('fun');
    params.delete('tab');
    const qs = params.toString();
    const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    history.replaceState({}, '', cleanUrl);
  }
}
