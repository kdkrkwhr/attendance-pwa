/**
 * Fun 탭 — 오늘의 한마디 + 오늘의 운세 (하루 1회)
 */
const FORTUNE_STORAGE_KEY = 'attendance-fortune';
const FORTUNE_NOTIFY_HOUR = 10;

const FORTUNE_GRADES = {
  great: { label: '대길', emoji: '🌟', color: '#f59e0b' },
  good: { label: '길', emoji: '✨', color: '#8b5cf6' },
  normal: { label: '소길', emoji: '🍀', color: '#10b981' },
  chill: { label: '평온', emoji: '☁️', color: '#60a5fa' },
};

/** 사주 오행 궁합 → 운세 등급 */
const SAJU_RELATION_TO_GRADE = {
  same: 'great',
  input: 'great',
  output: 'good',
  control: 'normal',
  pressure: 'chill',
  neutral: 'normal',
};

/** 오늘 일진 오행 → 한마디 태그 */
const SAJU_ELEMENT_QUOTE_TAGS = {
  wood: ['성장', '실행', '아이디어', '집중'],
  fire: ['소통', '협업', '관계', '응원'],
  earth: ['정리', '마무리', '균형', '팁'],
  metal: ['팁', '집중', '실행', '정리'],
  water: ['마음', '휴식', '균형', '리셋'],
};

const SAJU_STAR_SCORE_RANGE = {
  5: { min: 93, max: 100 },
  4: { min: 87, max: 95 },
  3: { min: 83, max: 90 },
  2: { min: 80, max: 87 },
};

/** 등급별 행운 점수 구간 (전체 평균 ~90점대) */
const GRADE_SCORE_RANGE = {
  great: { min: 93, max: 100 },
  good: { min: 87, max: 95 },
  normal: { min: 83, max: 90 },
  chill: { min: 80, max: 87 },
};

const DAILY_QUOTES = [
  { text: '완벽한 하루보다, 끝낸 하루가 더 기분 좋다.', tag: '마무리' },
  { text: '일은 쌓이는 게 아니라, 하나씩 줄어드는 거예요.', tag: '집중' },
  { text: '커피는 마시는 게 아니라, 마음의 재부팅이에요.', tag: '휴식' },
  { text: '회의실 문을 나설 때, 한 번 더 고개 끄덕이면 분위기가 달라져요.', tag: '관계' },
  { text: '오늘의 나를 칭찬할 거 하나만 적어보세요. 꽤 괜찮을걸요.', tag: '응원' },
  { text: '답이 안 보일 땐 화면이 아니라 창밖을 먼저 보세요.', tag: '리셋' },
  { text: '빨리 가려면 혼자, 멀리 가려면 같이—오늘은 같이 가도 돼요.', tag: '협업' },
  { text: '「나중에」는 일정표에 없는 날이 더 많아요. 지금 5분만.', tag: '실행' },
  { text: '실수는 실패가 아니라, 다음엔 이렇게 하면 되겠다는 메모예요.', tag: '성장' },
  { text: '점심은 배를 채우는 게 아니라, 오후를 살리는 투자예요.', tag: '점심' },
  { text: '메일함이 비면 머리도 비워져요. 하나만 처리해 보세요.', tag: '정리' },
  { text: '어제의 나와 비교하지 말고, 어제보다 한 걸음만.', tag: '마음' },
  { text: '모르겠다고 말하는 순간, 대화가 진짜 시작돼요.', tag: '소통' },
  { text: '퇴근 시간은 목표가 아니라, 오늘을 마무리하는 종소리예요.', tag: '퇴근' },
  { text: '바쁜 건 잘하고 있다는 뜻일 수도, 잠깐 숨 쉴 타이밍일 수도 있어요.', tag: '균형' },
  { text: '책상 위 컵 하나만 정리해도 머릿속이 조금 맑아져요.', tag: '정리' },
  { text: '좋은 아이디어는 보통 「어? 그런 생각도 하네」 다음에 나와요.', tag: '아이디어' },
  { text: '오늘 웃은 횟수, 생각보다 많을 거예요. 그걸로 충분해요.', tag: '긍정' },
  { text: '할 일 목록에 「물 한 잔」도 넣어도 됩니다. 진심이에요.', tag: '건강' },
  { text: '누군가의 「고마워요」가 오늘 당신에게도 올 수 있어요.', tag: '관계' },
  { text: '어려운 일은 오전에, 귀찮은 일은 타이머 10분에 맡기세요.', tag: '팁' },
  { text: '회의가 길면 메모가 길어지고, 메모가 길면 결론이 짧아져요.', tag: '회의' },
  { text: '지금 이 순간도, 분명 누군가는 당신 덕분에 편해졌을지 몰라요.', tag: '응원' },
  { text: '새로운 걸 배우는 날엔 「처음이라서」가 가장 멋진 이유예요.', tag: '성장' },
  { text: '오후 3시의 졸림은 약한 게 아니라, 열심히 살았다는 증거예요.', tag: '유머' },
  { text: '문제는 하나가 아니라, 해결책도 하나가 아닐 수 있어요.', tag: '사고' },
  { text: '오늘 하루, 최소한 한 가지는 잘했을 거예요. 그게 뭔지 떠올려 보세요.', tag: '마음' },
  { text: '쉬는 것도 업무의 일부입니다. 진짜로요.', tag: '휴식' },
  { text: '답장이 늦었다고 너무 미안해하지 마세요. 오늘 안에면 충분해요.', tag: '마음' },
  { text: '작은 친절은 로그에 안 남아도, 분위기에는 남아요.', tag: '관계' },
  { text: '「일단 저장」은 현대인의 기도문이에요. Ctrl+S, 아멘.', tag: '유머' },
  { text: '오늘의 목표를 줄이면, 오늘의 성취는 늘어나요.', tag: '실행' },
  { text: '말하기 전에 한 박자, 보내기 전에 한 번 더. 오늘의 안전벨트예요.', tag: '팁' },
  { text: '팀이 편하면 일이 빨라져요. 그 편함에 당신도 한몫했을 거예요.', tag: '협업' },
  { text: '금요일이 아니어도, 주말은 분명 다가오고 있어요.', tag: '응원' },
  { text: '지금 막막해도 괜찮아요. 막막한 건 시작 직전 신호일 때가 많아요.', tag: '마음' },
  { text: '좋은 하루의 기준은 완벽함이 아니라, 내일도 나갈 수 있을 정도예요.', tag: '균형' },
  { text: '오늘의 한 걸음이 내일의 「그때는 어떻게 했더라?」가 됩니다.', tag: '성장' },
  { text: '일 끝나고 「오늘도 수고했어」— 누가 해주지 않으면 스스로 해주세요.', tag: '응원' },
  { text: '재미없는 하루도, 나중엔 「그때 그거」가 되는 날이 올 거예요.', tag: '유머' },
];

const FORTUNES = [
  { grade: 'great', text: '오늘은 아이디어가 샘솟는 날! 회의에서 한마디가 통할 거예요.', luckyTip: '회의 전에 메모 한 줄만 준비해 보기', cautionTip: '「글쎄요…」처럼 애매하게 넘기지 않기' },
  { grade: 'great', text: '동료가 도와줄 운이 가득해요. 협업이 술술 풀립니다.', luckyTip: '막히면 바로 옆자리에게 가볍게 물어보기', cautionTip: '혼자 오래 끙끙대며 시간 쓰지 않기' },
  { grade: 'good', text: '점심 메뉴 고민 끝! 우연히 맛집을 발견할지도.', luckyTip: '평소 안 가본 메뉴 하나 골라보기', cautionTip: '매일 같은 메뉴만 고집하기' },
  { grade: 'good', text: '오후에 집중력이 올라가요. 어려운 일은 2시 이후에!', luckyTip: '오후에 이어폰 끼고 깊게 몰입하기', cautionTip: '알림을 켜 둔 채로 집중하려 하기' },
  { grade: 'normal', text: '차분히 가면 충분한 하루. 급할수록 천천히.', luckyTip: '물 자주 마시며 템포 조절하기', cautionTip: '급해서 대충 결정하고 넘기기' },
  { grade: 'chill', text: '오늘은 휴식도 실력입니다. 잠깐의 산책이 행운을 불러요.', luckyTip: '점심 후 5분만 밖에 나가 보기', cautionTip: '쉬는 시간까지 일로 채우기' },
  { grade: 'great', text: '퇴근이 예정보다 수월할 확률 UP! 일정을 잘 밀어붙이세요.', luckyTip: '아침에 할 일 3개만 체크리스트에 적기', cautionTip: '「나중에」만 반복하며 미루기' },
  { grade: 'good', text: '메일 한 통이 좋은 소식을 가져올 수 있어요.', luckyTip: '답장은 짧고 정리해서 보내기', cautionTip: '답장을 하루 종일 미루기' },
  { grade: 'normal', text: '작은 실수는 웃어넘기면 오히려 인연이 됩니다.', luckyTip: '가볍게 「아이고」 하고 넘어가기', cautionTip: '작은 실수에 너무 오래 매달리기' },
  { grade: 'good', text: '오늘은 듣는 쪽이 이기는 날. 상대 말을 끝까지 들어보세요.', luckyTip: '회의 중 메모하며 끝까지 듣기', cautionTip: '말 끝나기 전에 끼어들기' },
  { grade: 'great', text: '외근·야외 일정이 있다면 날씨도 도와줄 거예요!', luckyTip: '우산·충전기만 챙겨도 반은 성공', cautionTip: '짐을 너무 많이 들고 다니기' },
  { grade: 'chill', text: '커피 한 잔의 여유가 오후를 살려줍니다.', luckyTip: '오전에 가볍게 라떼 한 잔', cautionTip: '카페인을 너무 많이 마시기' },
  { grade: 'good', text: '숨겨둔 파일을 찾는 행운! 검색 한 번 더 해보세요.', luckyTip: '파일명·키워드로 검색 먼저 해보기', cautionTip: '폴더를 하나씩 열어 뒤지기' },
  { grade: 'normal', text: '오늘은 기본기가 빛나는 날. 꼼꼼함이 칭찬받아요.', luckyTip: '보내기 전에 한 번 더 확인하기', cautionTip: '「대충 괜찮겠지」하고 넘기기' },
  { grade: 'great', text: '새로운 도구나 단축키를 배우기 좋은 날이에요.', luckyTip: '단축키 하나만 검색해서 익혀 보기', cautionTip: '익숙한 방법만 고집하기' },
  { grade: 'good', text: '점심 후 졸림을 이기면 오후 운이 열려요.', luckyTip: '식사 후 가볍게 5분 걷기', cautionTip: '점심을 너무 과하게 먹기' },
  { grade: 'chill', text: '무리하지 않아도 할 일은 다 됩니다. 믿고 가요.', luckyTip: '10분만 눈 감고 쉬어 보기', cautionTip: '쉬었다는 죄책감까지 끌어안기' },
  { grade: 'normal', text: '차분한 톤이 설득력을 높여요. 부드럽게 말해보세요.', luckyTip: '말할 때 미소 한 번 더하기', cautionTip: '날카롭게 말했다가 분위기 싸해지기' },
  { grade: 'good', text: '오래 미뤄둔 작은 일 하나만 해도 뿌듯한 하루!', luckyTip: '타이머 5분만 켜고 시작하기', cautionTip: '완벽할 때까지 시작 안 하기' },
  { grade: 'great', text: '팀 분위기 메이커가 되는 날! 밝은 인사가 행운의 시작.', luckyTip: '엘리베이터·복도에서 먼저 인사하기', cautionTip: '무표정으로 지나치기' },
  { grade: 'good', text: '의자 한 번만 바꿔 앉아도 집중력이 달라져요.', luckyTip: '1시간마다 자세 한 번 바꿔 보기', cautionTip: '구부정하게 오래 앉아 있기' },
  { grade: 'normal', text: '예상 밖의 칭찬이 들어올 수 있어요. 겸손하게!', luckyTip: '칭찬 받으면 「감사합니다」 바로 하기', cautionTip: '칭찬을 당연하게 받아들이기' },
  { grade: 'chill', text: '오늘은 느긋한 점심이 최고의 투자입니다.', luckyTip: '점심은 천천히 씹어 먹기', cautionTip: '급하게 먹고 바로 업무로 돌아가기' },
  { grade: 'great', text: '문서 작성 운 최고! 초안부터 쓰면 금방 끝나요.', luckyTip: '빈 문서에 일단 한 문장만 쓰기', cautionTip: '처음부터 완벽하게 쓰려다 멈추기' },
  { grade: 'good', text: '동료와 커피챗 한 잔이 힌트를 줄지도 몰라요.', luckyTip: '복도에서 마주치면 가볍게 인사하기', cautionTip: '혼자만 끼니 해결하기' },
  { grade: 'normal', text: '숫자·데이터를 다시 보면 답이 보이는 날.', luckyTip: '엑셀·표로 한 번 더 정리해 보기', cautionTip: '감으로만 판단하고 넘기기' },
  { grade: 'good', text: '오후 회의에서 좋은 제안이 통할 확률 UP.', luckyTip: '핵심만 3줄로 짧게 말하기', cautionTip: '설명이 너무 길어지게 하기' },
  { grade: 'chill', text: '가끔은 「모르겠습니다」가 최선의 답일 때도 있어요.', luckyTip: '모를 땐 솔직하게 확인 요청하기', cautionTip: '모르는데 아는 척하고 답하기' },
  { grade: 'great', text: '깔끔한 책상이 맑은 머리를 부릅니다. 5분 정리 GO!', luckyTip: '책상 위 3가지만 치우기', cautionTip: '어질러진 책상 그대로 두기' },
  { grade: 'normal', text: '오늘은 배우는 쪽이 이득. 질문 하나 던져보세요.', luckyTip: '궁금한 건 바로 질문하기', cautionTip: '모르는 척하고 넘어가기' },
  { grade: 'good', text: '퇴근길에 좋은 생각이 떠오를 수 있어요. 메모 준비!', luckyTip: '떠오른 생각은 바로 메모 앱에 적기', cautionTip: '머릿속으로만 기억하려 하기' },
  { grade: 'great', text: '농담 한 방에 긴장이 풀리는 날. 가볍게 분위기 UP!', luckyTip: '가벼운 농담으로 분위기 풀기', cautionTip: '너무 딱딱하게만 말하기' },
  { grade: 'chill', text: '완벽하지 않아도 괜찮은 하루. 80%면 충분해요.', luckyTip: '오늘 한 것에 「충분해」라고 말하기', cautionTip: '끝나고도 자책만 하기' },
  { grade: 'good', text: '스탠딩 5분이 허리와 운세를 동시에 챙겨줘요.', luckyTip: '한 시간마다 5분 스트레칭', cautionTip: '오래 앉아만 있기' },
  { grade: 'normal', text: '오늘은 듣기 좋은 플레이리스트가 행운을 불러요.', luckyTip: '가볍게 BGM 틀어보기', cautionTip: '너무 조용한 자리만 고집하기' },
  { grade: 'good', text: '작은 친절이 돌아오는 날. 문 잡아주기도 운이에요.', luckyTip: '작은 배려를 한 번 더 해보기', cautionTip: '너무 바쁘다며 서두르기만 하기' },
  { grade: 'great', text: '오늘 결정한 일이 내일의 칭찬으로 이어질 거예요!', luckyTip: '망설이던 일 하나 오늘 결정하기', cautionTip: '결정만 미루고 넘기기' },
  { grade: 'chill', text: '점심 후 10분 낮잠은 금지지만, 눈 감고 쉬기는 OK.', luckyTip: '눈 감고 1분만 숨 고르기', cautionTip: '졸린데 무리해서 버티기' },
  { grade: 'normal', text: '차가운 물 한 모금이 오후의 시작을 상쾌하게.', luckyTip: '물 한 잔 먼저 마시기', cautionTip: '탄산음료만 마시기' },
  { grade: 'good', text: '오늘은 「일단 해보기」가 통하는 날입니다.', luckyTip: '망설이던 일 「일단 시작」하기', cautionTip: '시작 전에 너무 오래 고민하기' },
];

function hashFortuneSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getFortuneUserName() {
  return typeof getUserName === 'function' ? getUserName() : '';
}

function getBirthISOForDaily() {
  if (typeof getBirthDateFromSettings === 'function') return getBirthDateFromSettings();
  return '';
}

function getSajuContext() {
  const birthISO = getBirthISOForDaily();
  if (!birthISO || typeof buildTodaySaju !== 'function') return null;
  return buildTodaySaju(birthISO);
}

function pickFromPool(pool, seed) {
  if (!pool.length) return 0;
  return pool[seed % pool.length];
}

function pickDailyQuoteIndexFromSaju(saju, birthISO) {
  const tags = SAJU_ELEMENT_QUOTE_TAGS[saju.dayElement] || [];
  const tagged = DAILY_QUOTES.map((q, i) => i).filter((i) => tags.includes(DAILY_QUOTES[i].tag));
  const pool = tagged.length ? tagged : DAILY_QUOTES.map((_, i) => i);
  const seed = hashFortuneSeed(`${todayKey()}:${birthISO}:quote`);
  return pickFromPool(pool, seed);
}

function pickFortuneIndexFromSaju(saju, birthISO) {
  const grade = SAJU_RELATION_TO_GRADE[saju.relation] || 'normal';
  const matched = FORTUNES.map((f, i) => i).filter((i) => FORTUNES[i].grade === grade);
  const pool = matched.length ? matched : FORTUNES.map((_, i) => i);
  const seed = hashFortuneSeed(`${todayKey()}:${birthISO}:fortune`);
  return pickFromPool(pool, seed);
}

function pickLuckScoreFromSaju(saju, birthISO) {
  const range = SAJU_STAR_SCORE_RANGE[saju.starCount] || SAJU_STAR_SCORE_RANGE[3];
  const seed = hashFortuneSeed(`${todayKey()}:${birthISO}:score`);
  const span = range.max - range.min + 1;
  return range.min + (seed % span);
}

function pickDailyQuoteIndex() {
  const birthISO = getBirthISOForDaily();
  const saju = birthISO ? getSajuContext() : null;
  if (saju) return pickDailyQuoteIndexFromSaju(saju, birthISO);

  const name = getFortuneUserName();
  const seed = hashFortuneSeed(`${todayKey()}:${name || '사원'}:quote`);
  return seed % DAILY_QUOTES.length;
}

function getTodayQuote() {
  return DAILY_QUOTES[pickDailyQuoteIndex()];
}

function loadTodayFortune() {
  try {
    const data = JSON.parse(localStorage.getItem(FORTUNE_STORAGE_KEY) || 'null');
    if (!data || data.dayKey !== todayKey()) return null;
    const birthISO = getBirthISOForDaily();
    if (birthISO && !data.sajuLinked) {
      localStorage.removeItem(FORTUNE_STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveTodayFortune(fortuneIndex) {
  const fortune = FORTUNES[fortuneIndex];
  const birthISO = getBirthISOForDaily();
  const saju = birthISO ? getSajuContext() : null;
  const quoteIndex = pickDailyQuoteIndex();
  const quote = DAILY_QUOTES[quoteIndex];
  const luckScore = saju
    ? pickLuckScoreFromSaju(saju, birthISO)
    : pickLuckScore(fortune.grade, fortuneIndex);
  const record = {
    dayKey: todayKey(),
    index: fortuneIndex,
    drawnAt: new Date().toISOString(),
    quoteText: quote.text,
    quoteTag: quote.tag,
    luckScore,
    sajuLinked: Boolean(saju),
    ...fortune,
  };
  localStorage.setItem(FORTUNE_STORAGE_KEY, JSON.stringify(record));
  return record;
}

function pickFortuneIndex() {
  const birthISO = getBirthISOForDaily();
  const saju = birthISO ? getSajuContext() : null;
  if (saju) return pickFortuneIndexFromSaju(saju, birthISO);

  const name = getFortuneUserName();
  const seed = hashFortuneSeed(`${todayKey()}:${name || '사원'}`);
  return seed % FORTUNES.length;
}

function pickLuckScore(grade, fortuneIndex) {
  const name = getFortuneUserName();
  const seed = hashFortuneSeed(`${todayKey()}:${name || '사원'}:score:${fortuneIndex}`);
  const range = GRADE_SCORE_RANGE[grade] || GRADE_SCORE_RANGE.normal;
  const span = range.max - range.min + 1;
  return range.min + (seed % span);
}

function getLuckScore(record) {
  if (typeof record.luckScore === 'number') return record.luckScore;
  const birthISO = getBirthISOForDaily();
  const saju = birthISO ? getSajuContext() : null;
  if (saju) return pickLuckScoreFromSaju(saju, birthISO);
  return pickLuckScore(record.grade, record.index ?? 0);
}

function getLuckScoreMessage(score) {
  if (score >= 97) return '오늘은 최고의 날! ✨';
  if (score >= 92) return '운이 아주 좋은 날이에요';
  if (score >= 87) return '기분 좋은 하루 예감이에요';
  if (score >= 83) return '무난히 좋은 하루가 될 거예요';
  return '차분히 가도 충분한 하루예요';
}

function drawTodayFortune() {
  const existing = loadTodayFortune();
  if (existing) return existing;
  return saveTodayFortune(pickFortuneIndex());
}

function getFortuneGradeMeta(grade) {
  return FORTUNE_GRADES[grade] || FORTUNE_GRADES.normal;
}

function getFortuneTip(record, kind) {
  if (kind === 'lucky') {
    return record.luckyTip || record.lucky || '';
  }
  return record.cautionTip || record.avoid || '';
}

function renderDailyQuote() {
  const quoteEl = document.getElementById('dailyQuoteText');
  const tagEl = document.getElementById('dailyQuoteTag');
  if (!quoteEl) return;

  const record = loadTodayFortune();
  const quote = record?.quoteText
    ? { text: record.quoteText, tag: record.quoteTag }
    : getTodayQuote();

  quoteEl.textContent = `「${quote.text}」`;
  if (tagEl) tagEl.textContent = quote.tag ? `#${quote.tag}` : '';
}

function renderFortune() {
  renderDailyQuote();

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
  const cautionEl = document.getElementById('fortuneCaution');
  const stampEl = document.getElementById('fortuneStamp');

  if (gradeEl) gradeEl.textContent = meta.label;
  if (emojiEl) emojiEl.textContent = meta.emoji;
  if (textEl) textEl.textContent = record.text;
  if (luckyEl) luckyEl.textContent = getFortuneTip(record, 'lucky');
  if (cautionEl) cautionEl.textContent = getFortuneTip(record, 'caution');
  if (stampEl) stampEl.textContent = '오늘 확인 완료';

  const score = getLuckScore(record);
  const scoreEl = document.getElementById('fortuneScore');
  const scoreFillEl = document.getElementById('fortuneScoreFill');
  const scoreMsgEl = document.getElementById('fortuneScoreMsg');
  if (scoreEl) scoreEl.textContent = String(score);
  if (scoreFillEl) scoreFillEl.style.width = `${score}%`;
  if (scoreMsgEl) scoreMsgEl.textContent = getLuckScoreMessage(score);

  if (resultEl) {
    resultEl.style.setProperty('--fortune-accent', meta.color);
    resultEl.style.setProperty('--fortune-score', String(score));
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
      '🔮 Fun 타임',
      '오늘의 한마디와 운세를 확인해 보세요',
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
