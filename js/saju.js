/**
 * Fun 탭 — 오늘의 사주 (년주 + 오늘 일진 + 오행 궁합)
 * 생년월일은 설정에만 저장 (localStorage)
 */
const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCH_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIAC = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];

const STEM_ELEMENT = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water'];
const ELEMENT_HANJA = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const ELEMENT_KO = { wood: '목', fire: '화', earth: '토', metal: '금', water: '수' };

const ELEMENT_GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const ELEMENT_OVERCOMES = { wood: 'earth', fire: 'metal', earth: 'water', metal: 'wood', water: 'fire' };

/** 음력 설날(양력) — 띠·년주 계산용 */
const LUNAR_NEW_YEAR = {
  1960: [1, 28], 1961: [2, 15], 1962: [2, 5], 1963: [1, 25], 1964: [2, 13],
  1965: [2, 2], 1966: [1, 21], 1967: [2, 9], 1968: [1, 30], 1969: [2, 17],
  1970: [2, 6], 1971: [1, 27], 1972: [2, 15], 1973: [2, 3], 1974: [1, 23],
  1975: [2, 11], 1976: [1, 31], 1977: [2, 18], 1978: [2, 7], 1979: [1, 28],
  1980: [2, 16], 1981: [2, 5], 1982: [1, 25], 1983: [2, 13], 1984: [2, 2],
  1985: [2, 20], 1986: [2, 9], 1987: [1, 29], 1988: [2, 17], 1989: [2, 6],
  1990: [1, 27], 1991: [2, 15], 1992: [2, 4], 1993: [1, 23], 1994: [2, 10],
  1995: [1, 31], 1996: [2, 19], 1997: [2, 7], 1998: [1, 28], 1999: [2, 16],
  2000: [2, 5], 2001: [1, 24], 2002: [2, 12], 2003: [2, 1], 2004: [1, 22],
  2005: [2, 9], 2006: [1, 29], 2007: [2, 18], 2008: [2, 7], 2009: [1, 26],
  2010: [2, 14], 2011: [2, 3], 2012: [1, 23], 2013: [2, 10], 2014: [1, 31],
  2015: [2, 19], 2016: [2, 8], 2017: [1, 28], 2018: [2, 16], 2019: [2, 5],
  2020: [1, 25], 2021: [2, 12], 2022: [2, 1], 2023: [1, 22], 2024: [2, 10],
  2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13],
  2030: [2, 3],
};

const DAY_ELEMENT_MESSAGES = {
  wood: [
    '목(木) 기운이 도는 날이에요. 새 제안·학습에 유리합니다.',
    '자라나는 기운이에요. 막힌 일을 다시 시작해 보세요.',
    '성장의 날! 배우고 시도하기 좋은 하루예요.',
  ],
  fire: [
    '화(火) 기운이 활발해요. 발표·소통·아이디어 공유에 좋습니다.',
    '에너지가 올라가는 날. 적극적으로 의견 내보세요.',
    '빛나는 하루! 먼저 말 걸면 분위기가 따라옵니다.',
  ],
  earth: [
    '토(土) 기운의 날. 차분히 정리·마무리하기 좋아요.',
    '안정감이 도는 하루. 꼼꼼한 실행이 빛을 발합니다.',
    '기반을 다지기 좋은 날. 체크리스트부터 챙겨보세요.',
  ],
  metal: [
    '금(金) 기운이 맑아요. 결정·정리·숫자 업무에 유리합니다.',
    '단호함이 통하는 날. 우선순위를 정하면 일이 빨라져요.',
    '깔끔하게 가면 좋은 하루. 불필요한 건 과감히 덜어내세요.',
  ],
  water: [
    '수(水) 기운이 흐르는 날. 유연한 대응·관계 정리에 좋아요.',
    '흐름을 타면 편한 하루. 억지보다 조율이 답이에요.',
    '생각이 맑아지는 날. 잠깐 멈추고 방향을 점검해 보세요.',
  ],
};

const RELATION_META = {
  same: { stars: 5, workLabel: '아주 좋음', elementLabel: '오행이 잘 맞아요' },
  input: { stars: 5, workLabel: '좋음', elementLabel: '나를 돕는 기운이에요' },
  output: { stars: 4, workLabel: '좋음', elementLabel: '기운을 보내는 날이에요' },
  control: { stars: 3, workLabel: '보통', elementLabel: '조율하면 괜찮아요' },
  pressure: { stars: 2, workLabel: '주의', elementLabel: '무리하지 않는 게 좋아요' },
  neutral: { stars: 3, workLabel: '보통', elementLabel: '무난한 흐름이에요' },
};

const DAY_PILLAR_ANCHOR = new Date(2024, 0, 1);
const DAY_PILLAR_ANCHOR_INDEX = 0;

function getBirthDateFromSettings() {
  if (typeof loadSettings !== 'function') return '';
  return (loadSettings().birthDate || '').trim();
}

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

function getEffectiveZodiacYear(birthISO) {
  const parts = parseISODate(birthISO);
  if (!parts) return null;
  const { year, month, day } = parts;
  const lny = LUNAR_NEW_YEAR[year];
  if (!lny) return year;
  const [lnyM, lnyD] = lny;
  if (month < lnyM || (month === lnyM && day < lnyD)) return year - 1;
  return year;
}

function getYearPillar(effectiveYear) {
  const stem = ((effectiveYear - 4) % 10 + 10) % 10;
  const branch = ((effectiveYear - 4) % 12 + 12) % 12;
  return { stem, branch };
}

function getDayPillar(date = new Date()) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((target - DAY_PILLAR_ANCHOR) / 86400000);
  const index = ((DAY_PILLAR_ANCHOR_INDEX + diff) % 60 + 60) % 60;
  return {
    stem: index % 10,
    branch: index % 12,
    index,
  };
}

function formatPillarLabel(stem, branch) {
  const elem = STEM_ELEMENT[stem];
  return `${STEMS[stem]}${BRANCHES[branch]}(${ELEMENT_HANJA[elem]})`;
}

function formatZodiacLabel(branch) {
  return `${ZODIAC[branch]}(${BRANCH_HANJA[branch]})`;
}

function getElementRelation(userElement, dayElement) {
  if (userElement === dayElement) return 'same';
  if (ELEMENT_GENERATES[userElement] === dayElement) return 'output';
  if (ELEMENT_GENERATES[dayElement] === userElement) return 'input';
  if (ELEMENT_OVERCOMES[userElement] === dayElement) return 'control';
  if (ELEMENT_OVERCOMES[dayElement] === userElement) return 'pressure';
  return 'neutral';
}

function starsFromCount(count) {
  const n = Math.max(0, Math.min(5, count));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function pickDayMessage(dayElement, dateKey) {
  const list = DAY_ELEMENT_MESSAGES[dayElement] || DAY_ELEMENT_MESSAGES.earth;
  const seed = typeof hashFortuneSeed === 'function'
    ? hashFortuneSeed(`${dateKey}:saju-msg`)
    : dateKey.length;
  return list[seed % list.length];
}

function buildTodaySaju(birthISO) {
  const effectiveYear = getEffectiveZodiacYear(birthISO);
  if (!effectiveYear) return null;

  const yearPillar = getYearPillar(effectiveYear);
  const dayPillar = getDayPillar(new Date());
  const userElement = STEM_ELEMENT[yearPillar.stem];
  const dayElement = STEM_ELEMENT[dayPillar.stem];
  const relation = getElementRelation(userElement, dayElement);
  const meta = RELATION_META[relation] || RELATION_META.neutral;
  const dateKey = typeof todayKey === 'function' ? todayKey() : '';

  return {
    dayPillarLabel: formatPillarLabel(dayPillar.stem, dayPillar.branch),
    zodiacLabel: formatZodiacLabel(yearPillar.branch),
    userElementKo: ELEMENT_KO[userElement],
    dayElementKo: ELEMENT_KO[dayElement],
    dayElement,
    relation,
    starCount: meta.stars,
    message: pickDayMessage(dayElement, dateKey),
    stars: starsFromCount(meta.stars),
    workLabel: meta.workLabel,
    elementHint: meta.elementLabel,
  };
}

function renderSaju() {
  const emptyEl = document.getElementById('sajuEmpty');
  const idleEl = document.getElementById('sajuIdle');
  const contentEl = document.getElementById('sajuContent');
  if (!emptyEl || !contentEl) return;

  const birthISO = getBirthDateFromSettings();
  if (!birthISO || !parseISODate(birthISO)) {
    emptyEl.classList.remove('hidden');
    idleEl?.classList.add('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  const revealed = typeof isFunRevealed === 'function' && isFunRevealed('saju');
  if (!revealed) {
    emptyEl.classList.add('hidden');
    idleEl?.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  const saju = buildTodaySaju(birthISO);
  if (!saju) {
    emptyEl.classList.remove('hidden');
    idleEl?.classList.add('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  idleEl?.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const dayEl = document.getElementById('sajuDayPillar');
  const zodiacEl = document.getElementById('sajuZodiac');
  const messageEl = document.getElementById('sajuMessage');
  const starsEl = document.getElementById('sajuStars');
  const workEl = document.getElementById('sajuWorkCompat');

  if (dayEl) dayEl.textContent = saju.dayPillarLabel;
  if (zodiacEl) zodiacEl.textContent = saju.zodiacLabel;
  if (messageEl) messageEl.textContent = `「${saju.message}」`;
  if (starsEl) starsEl.textContent = saju.stars;
  if (workEl) workEl.textContent = saju.workLabel;
}

function handleRevealSaju() {
  if (typeof markFunRevealed === 'function') markFunRevealed('saju');
  renderSaju();
}

function handleSajuGoSettings() {
  if (typeof switchTab === 'function') switchTab('settings');
  requestAnimationFrame(() => {
    const input = document.getElementById('birthDate');
    input?.focus();
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
