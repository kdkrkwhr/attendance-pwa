/**
 * Fun 탭 — 오늘의 한마디 + 오늘의 운세 (하루 1회)
 */
const FORTUNE_STORAGE_KEY = 'attendance-fortune';
const FUN_REVEAL_KEY = 'attendance-fun-reveal';
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

/** 오행 궁합 → 한마디 태그 (운세 등급·점수와 같은 축) */
const SAJU_RELATION_QUOTE_TAGS = {
  same: ['성장', '실행', '응원', '긍정', '협업'],
  input: ['응원', '성장', '마음', '긍정'],
  output: ['협업', '소통', '관계', '실행'],
  control: ['균형', '팁', '집중', '마무리'],
  pressure: ['휴식', '마음', '균형', '리셋'],
  neutral: ['균형', '마무리', '집중', '팁'],
};

const SAJU_STAR_SCORE_RANGE = {
  5: { min: 82, max: 100 },
  4: { min: 64, max: 88 },
  3: { min: 48, max: 74 },
  2: { min: 32, max: 58 },
};

/** 등급별 행운 점수 구간 */
const GRADE_SCORE_RANGE = {
  great: { min: 82, max: 100 },
  good: { min: 62, max: 86 },
  normal: { min: 45, max: 72 },
  chill: { min: 28, max: 55 },
};

const FORTUNE_CATEGORIES = {
  work: { label: '업무운', emoji: '💼' },
  money: { label: '재물운', emoji: '💰' },
  love: { label: '인연운', emoji: '💫' },
  health: { label: '건강운', emoji: '🌿' },
  creative: { label: '창의운', emoji: '🎨' },
  rest: { label: '휴식운', emoji: '🛋️' },
  luck: { label: '행운', emoji: '🍀' },
  learn: { label: '학습운', emoji: '📚' },
};

const SCORE_MSG_POOL = {
  high: ['오늘은 최고의 날! ✨', '운이 폭발하는 날이에요', '뭐든 잘 풀릴 기운이 가득해요'],
  midHigh: ['기분 좋은 하루 예감이에요', '조금만 신경 쓰면 대박이에요', '운이 따르는 편이에요'],
  mid: ['무난한 하루예요', '평범이 최고의 날이에요', '특별할 필요 없어요'],
  low: ['차분히 가도 충분해요', '쉬어가도 괜찮은 날이에요', '무리하지 말고 천천히 가요'],
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
  { grade: 'great', category: 'work', text: '오늘은 아이디어가 샘솟는 날! 회의에서 한마디가 통할 거예요.', luckyTip: '회의 전에 메모 한 줄만 준비해 보기', cautionTip: '「글쎄요…」처럼 애매하게 넘기지 않기' },
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
  { grade: 'great', category: 'money', text: '지갑·통장 정리하면 작은 보너스 운이 숨어 있어요.', luckyTip: '쓸데없는 구독 하나만 끊어 보기', cautionTip: '충동으로 장바구니부터 채우기' },
  { grade: 'great', category: 'love', text: '오랜만에 연락 온 사람이 좋은 소식을 가져올 수 있어요.', luckyTip: '먼저 안부 한 줄 보내 보기', cautionTip: '답장을 너무 늦게 하기' },
  { grade: 'great', category: 'health', text: '컨디션이 올라가는 날! 가벼운 운동을 시작하기 딱 좋아요.', luckyTip: '계단 한 층만 더 오르기', cautionTip: '밤늦게까지 스크린만 보기' },
  { grade: 'great', category: 'creative', text: '머릿속 그림이 선명해요. 그림·글·음악 뭐든 시도해 보세요.', luckyTip: '5분만 낙서·메모라도 해보기', cautionTip: '완성될 때까지 시작 안 하기' },
  { grade: 'great', category: 'luck', text: '우연한 할인·쿠폰·이벤트에 걸릴 확률이 높아요.', luckyTip: '평소 안 쓰는 앱 알림 한번 확인하기', cautionTip: '「나한텐 안 온다」며 무시하기' },
  { grade: 'great', category: 'learn', text: '새로운 걸 배우면 머리에 딱 붙는 날이에요.', luckyTip: '유튜브 튜토리얼 10분만 보기', cautionTip: '너무 어려운 것부터 파고들기' },
  { grade: 'good', category: 'money', text: '점심·간식에서 의외로 만족스러운 가성비를 만날 수 있어요.', luckyTip: '단골 말고 새 가게 한번 가보기', cautionTip: '배고프다며 비싼 것만 고르기' },
  { grade: 'good', category: 'love', text: '엘리베이터·복도에서 반가운 얼굴을 만날 수 있어요.', luckyTip: '먼저 밝게 인사하기', cautionTip: '이어폰 끼고 눈 피하기' },
  { grade: 'good', category: 'health', text: '수면의 질이 좋아지는 날. 오늘 밤 푹 잘 수 있어요.', luckyTip: '자기 30분 전 폰 멀리 두기', cautionTip: '늦게까지 카페인 마시기' },
  { grade: 'good', category: 'creative', text: '남들이 못 본 해결책이 떠오를 수 있어요.', luckyTip: '문제를 종이에 그림으로 그려보기', cautionTip: '남의 답안만 베끼기' },
  { grade: 'good', category: 'luck', text: '길에서 주운 작은 행운(쿠폰·동전·칭찬)이 기분을 올려줘요.', luckyTip: '지나치던 작은 것에도 눈 두기', cautionTip: '운이 없다고 중얼거리기' },
  { grade: 'good', category: 'learn', text: '남이 설명해 주는 것보다 직접보면 금방 익혀요.', luckyTip: '매뉴얼 대신 손으로 한번 눌러보기', cautionTip: '이해 안 되는데 넘어가기' },
  { grade: 'normal', category: 'money', text: '큰돈은 아니어도 지출이 생각보다 적게 나갈 수 있어요.', luckyTip: '영수증 한번 확인해 보기', cautionTip: '「별로 안 썼겠지」하고 안 보기' },
  { grade: 'normal', category: 'love', text: '가족·친구에게 짧은 연락이 관계를 따뜻하게 해줘요.', luckyTip: '카톡 이모티콘 하나만 보내기', cautionTip: '바쁘다며 연락 미루기' },
  { grade: 'normal', category: 'health', text: '목·어깨가 뻐근할 수 있어요. 스트레칭이 답이에요.', luckyTip: '1시간마다 고개 돌리기', cautionTip: '통증 참고 같은 자세 유지하기' },
  { grade: 'normal', category: 'creative', text: '평소와 다른 루트·메뉴·음악이 영감을 줄 수 있어요.', luckyTip: '출퇴근길 한 정거장 걸어보기', cautionTip: '매일 똑같은 패턴만 반복하기' },
  { grade: 'normal', category: 'luck', text: '기대 안 했는데 괜찮은 일이 하나쯤 생길 수 있어요.', luckyTip: '작은 변화에도 「오」 하고 반응하기', cautionTip: '별일 없다며 하루를 깔아버리기' },
  { grade: 'normal', category: 'rest', text: '오늘은 속도를 줄여도 일은 따라와요.', luckyTip: '점심 후 3분만 눈 감기', cautionTip: '쉬는 시간까지 일로 채우기' },
  { grade: 'chill', category: 'rest', text: '아무것도 안 해도 되는 날이에요. 쉬는 것도 실력입니다.', luckyTip: '「오늘은 여기까지」 선언하기', cautionTip: '쉬었다는 죄책감까지 끌어안기' },
  { grade: 'chill', category: 'health', text: '몸이 쉬라고 신호를 보내는 중이에요. 무리 금지.', luckyTip: '물 자주 마시고 일찍 눕기', cautionTip: '졸린데 억지로 버티기' },
  { grade: 'chill', category: 'money', text: '큰 지출·계약은 내일로 미루는 게 이득이에요.', luckyTip: '장바구니에만 담고 하루 뒤 결정하기', cautionTip: '지금 당장 결제하기' },
  { grade: 'chill', category: 'love', text: '오늘은 혼자만의 시간이 더 편할 수 있어요.', luckyTip: '좋아하는 음악이나 영상 한 편', cautionTip: '억지로 약속 잡기' },
  { grade: 'chill', category: 'luck', text: '운이 낮은 날엔 욕심 부리지 않는 게 최고의 전략이에요.', luckyTip: '할 일 목록에서 하나 빼기', cautionTip: '모든 걸 오늘 끝내려 하기' },
  { grade: 'chill', category: 'creative', text: '만들기보다 감상하기 좋은 날. 영화·책·음악이 답이에요.', luckyTip: '평소 안 보던 장르 하나 골라보기', cautionTip: '결과물을 꼭 내야 한다고 압박하기' },
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

let dailyBundleCache = null;

function buildSajuDailyBundle(birthISO) {
  const saju = getSajuContext();
  if (!saju) return null;

  const grade = SAJU_RELATION_TO_GRADE[saju.relation] || 'normal';
  const fortunePool = FORTUNES.map((f, i) => i).filter((i) => FORTUNES[i].grade === grade);
  const fortuneIndex = pickFromPool(
    fortunePool.length ? fortunePool : FORTUNES.map((_, i) => i),
    hashFortuneSeed(`${todayKey()}:${birthISO}:fortune:${saju.dayElement || ''}:${saju.relation}`),
  );

  const quoteTags = SAJU_RELATION_QUOTE_TAGS[saju.relation] || SAJU_RELATION_QUOTE_TAGS.neutral;
  const quotePool = DAILY_QUOTES.map((q, i) => i).filter((i) => quoteTags.includes(DAILY_QUOTES[i].tag));
  const quoteIndex = pickFromPool(
    quotePool.length ? quotePool : DAILY_QUOTES.map((_, i) => i),
    hashFortuneSeed(`${todayKey()}:${birthISO}:quote`),
  );

  const scoreRange = SAJU_STAR_SCORE_RANGE[saju.starCount] || SAJU_STAR_SCORE_RANGE[3];
  const scoreSpan = scoreRange.max - scoreRange.min + 1;
  const luckScore = scoreRange.min + (hashFortuneSeed(`${todayKey()}:${birthISO}:score`) % scoreSpan);

  return {
    dayKey: todayKey(),
    birthISO,
    saju,
    grade,
    fortuneIndex,
    quoteIndex,
    luckScore,
  };
}

function getSajuDailyBundle() {
  const birthISO = getBirthISOForDaily();
  if (!birthISO) {
    dailyBundleCache = null;
    return null;
  }
  if (dailyBundleCache?.dayKey === todayKey() && dailyBundleCache?.birthISO === birthISO) {
    return dailyBundleCache;
  }
  dailyBundleCache = buildSajuDailyBundle(birthISO);
  return dailyBundleCache;
}

function pickDailyQuoteIndex() {
  const bundle = getSajuDailyBundle();
  if (bundle) return bundle.quoteIndex;

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
    const bundle = birthISO ? getSajuDailyBundle() : null;
    if (bundle && data.sajuLinked && data.grade !== bundle.grade) {
      localStorage.removeItem(FORTUNE_STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveTodayFortune(fortuneIndex) {
  const bundle = getSajuDailyBundle();
  const fortune = FORTUNES[fortuneIndex];
  const quote = bundle
    ? DAILY_QUOTES[bundle.quoteIndex]
    : DAILY_QUOTES[pickDailyQuoteIndex()];
  const luckScore = bundle
    ? bundle.luckScore
    : pickLuckScore(fortune.grade, fortuneIndex);
  const record = {
    dayKey: todayKey(),
    index: fortuneIndex,
    drawnAt: new Date().toISOString(),
    quoteText: quote.text,
    quoteTag: quote.tag,
    luckScore,
    sajuLinked: Boolean(bundle),
    category: fortune.category,
    ...fortune,
  };
  localStorage.setItem(FORTUNE_STORAGE_KEY, JSON.stringify(record));
  return record;
}

function pickFortuneIndex() {
  const bundle = getSajuDailyBundle();
  if (bundle) return bundle.fortuneIndex;

  const name = getFortuneUserName();
  const seed = hashFortuneSeed(`${todayKey()}:${name || '사원'}:${new Date().getDay()}`);
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
  const bundle = getSajuDailyBundle();
  if (bundle) return bundle.luckScore;
  return pickLuckScore(record.grade, record.index ?? 0);
}

function getLuckScoreMessage(score, grade) {
  const seed = hashFortuneSeed(`${todayKey()}:msg:${score}:${grade}`);
  let pool;
  if (score >= 85) pool = SCORE_MSG_POOL.high;
  else if (score >= 68) pool = SCORE_MSG_POOL.midHigh;
  else if (score >= 50) pool = SCORE_MSG_POOL.mid;
  else pool = SCORE_MSG_POOL.low;
  return pool[seed % pool.length];
}

function getFortuneCategoryMeta(category) {
  return FORTUNE_CATEGORIES[category] || null;
}

function drawTodayFortune() {
  const existing = loadTodayFortune();
  if (existing) return existing;
  return saveTodayFortune(pickFortuneIndex());
}

/** 생년월일 있으면 사주·한마디·운세·점수를 같은 날 번들로 맞춤 */
function ensureTodayFortune() {
  if (!getBirthISOForDaily()) return loadTodayFortune();
  return drawTodayFortune();
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

function loadFunReveal() {
  try {
    const data = JSON.parse(localStorage.getItem(FUN_REVEAL_KEY) || '{}');
    if (data.dayKey !== todayKey()) return {};
    return data;
  } catch {
    return {};
  }
}

function isFunRevealed(type) {
  return Boolean(loadFunReveal()[type]);
}

function markFunRevealed(type) {
  const data = loadFunReveal();
  data.dayKey = todayKey();
  data[type] = true;
  localStorage.setItem(FUN_REVEAL_KEY, JSON.stringify(data));
}

/** 미니게임 — 각 게임 하루 1회 */
const GAME_DAILY_KEY = 'attendance-game-daily';
const GAME_CARD_IDS = [
  ['tap', 'tapCard'],
  ['slot', 'slotCard'],
  ['dice', 'diceCard'],
  ['coin', 'coinCard'],
  ['rps', 'rpsCard'],
  ['stretch', 'stretchCard'],
  ['balance', 'balanceCard'],
  ['reaction', 'reactionCard'],
  ['typing', 'typingCard'],
  ['guess', 'guessCard'],
];

function loadGameDaily() {
  try {
    const data = JSON.parse(localStorage.getItem(GAME_DAILY_KEY) || '{}');
    if (data.dayKey !== todayKey()) return {};
    return data;
  } catch {
    return {};
  }
}

function isGamePlayedToday(id) {
  return Boolean(loadGameDaily()[id]);
}

function markGamePlayedToday(id) {
  const data = loadGameDaily();
  data.dayKey = todayKey();
  data[id] = true;
  localStorage.setItem(GAME_DAILY_KEY, JSON.stringify(data));
}

function guardGameStart(id) {
  return !isGamePlayedToday(id);
}

function finishGameDaily(id) {
  if (isGamePlayedToday(id)) return;
  markGamePlayedToday(id);
  renderGameDailyLocks();
}

function renderGameDailyLocks() {
  GAME_CARD_IDS.forEach(([id, cardId]) => {
    const card = document.getElementById(cardId);
    if (!card) return;
    const played = isGamePlayedToday(id);
    let lockEl = card.querySelector('.game-daily-lock');
    if (!played) {
      lockEl?.classList.add('hidden');
      return;
    }
    card.querySelectorAll(
      '[id$="Idle"], [id$="Running"], [id$="Playing"], [id$="Play"], .rps-idle, .balance-idle',
    ).forEach((el) => el.classList.add('hidden'));
    card.querySelectorAll('[id$="Result"], [id$="Done"]').forEach((el) => el.classList.add('hidden'));
    if (!lockEl) {
      lockEl = document.createElement('div');
      lockEl.className = 'game-daily-lock fun-reveal-idle';
      lockEl.innerHTML = '<p class="fun-reveal-idle-text">오늘은 이미 플레이했어요 ✓<br>내일 다시 도전!</p>';
      card.appendChild(lockEl);
    }
    lockEl.classList.remove('hidden');
  });
}

function handleRevealQuote() {
  markFunRevealed('quote');
  renderDailyQuote();
}

function renderDailyQuote() {
  const quoteEl = document.getElementById('dailyQuoteText');
  const tagEl = document.getElementById('dailyQuoteTag');
  const idleEl = document.getElementById('quoteIdle');
  const contentEl = document.getElementById('quoteContent');
  if (!quoteEl) return;

  const revealed = isFunRevealed('quote');
  idleEl?.classList.toggle('hidden', revealed);
  contentEl?.classList.toggle('hidden', !revealed);
  if (!revealed) return;

  const record = loadTodayFortune();
  const quote = record?.quoteText
    ? { text: record.quoteText, tag: record.quoteTag }
    : getTodayQuote();

  quoteEl.textContent = `「${quote.text}」`;
  if (tagEl) {
    tagEl.textContent = quote.tag ? `#${quote.tag}` : '';
    tagEl.classList.toggle('hidden', !quote.tag);
  }
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
  const categoryEl = document.getElementById('fortuneCategory');
  const textEl = document.getElementById('fortuneText');
  const luckyEl = document.getElementById('fortuneLucky');
  const cautionEl = document.getElementById('fortuneCaution');
  const stampEl = document.getElementById('fortuneStamp');

  if (gradeEl) gradeEl.textContent = meta.label;
  if (emojiEl) emojiEl.textContent = meta.emoji;
  const catMeta = getFortuneCategoryMeta(record.category || FORTUNES[record.index]?.category);
  if (categoryEl) {
    if (catMeta) {
      categoryEl.textContent = `${catMeta.emoji} ${catMeta.label}`;
      categoryEl.classList.remove('hidden');
    } else {
      categoryEl.textContent = '';
      categoryEl.classList.add('hidden');
    }
  }
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
  if (scoreMsgEl) scoreMsgEl.textContent = getLuckScoreMessage(score, record.grade);

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
    markFunRevealed('fortune');
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
  consumeTabDeepLink('fun');
}

/** 오늘의 색 — 날짜 시드로 매일 바뀌는 컬러 카드 */
const COLORS_OF_DAY = [
  { name: '체리 레드', hex: '#e11d48' },
  { name: '선셋 오렌지', hex: '#f97316' },
  { name: '허니 옐로', hex: '#eab308' },
  { name: '라임 그린', hex: '#84cc16' },
  { name: '포레스트 그린', hex: '#16a34a' },
  { name: '세이지 그린', hex: '#4d9375' },
  { name: '틸', hex: '#0d9488' },
  { name: '스카이 블루', hex: '#0ea5e9' },
  { name: '오션 블루', hex: '#2563eb' },
  { name: '인디고', hex: '#4f46e5' },
  { name: '라벤더', hex: '#8b5cf6' },
  { name: '오키드', hex: '#c026d3' },
  { name: '베리 핑크', hex: '#db2777' },
  { name: '코랄 핑크', hex: '#fb7185' },
  { name: '테라코타', hex: '#c2622d' },
  { name: '머스타드', hex: '#ca8a04' },
  { name: '민트', hex: '#2dd4bf' },
  { name: '슬레이트 블루', hex: '#64748b' },
  { name: '차콜', hex: '#334155' },
  { name: '샌드 베이지', hex: '#d6b98c' },
];

function getTodayColor() {
  const seed = hashFortuneSeed(`${todayKey()}:color`);
  return COLORS_OF_DAY[seed % COLORS_OF_DAY.length];
}

function renderColorOfDay() {
  const swatchEl = document.getElementById('colorSwatch');
  const nameEl = document.getElementById('colorName');
  const hexEl = document.getElementById('colorHex');
  if (!swatchEl) return;

  const color = getTodayColor();
  swatchEl.style.backgroundColor = color.hex;
  if (nameEl) nameEl.textContent = color.name;
  if (hexEl) hexEl.textContent = color.hex.toUpperCase();
}

/** 오늘의 행운 숫자 — 날짜 시드로 매일 바뀌는 로또식 숫자 */
const LUCKY_HINTS = [
  '이 숫자와 함께 좋은 하루 보내세요',
  '엘리베이터·주차장에서 마주치면 반가워하기',
  '중요한 결정 앞에서 슬쩍 참고해보세요',
  '오늘 이 숫자가 들어간 걸 발견하면 행운',
  '커피 주문할 때 이 숫자만큼 스탬프 챙기기',
];

function getTodayLuckyNumber() {
  const seed = hashFortuneSeed(`${todayKey()}:lucky`);
  return {
    number: (seed % 45) + 1,
    hint: LUCKY_HINTS[seed % LUCKY_HINTS.length],
  };
}

function renderLuckyNumber() {
  const numberEl = document.getElementById('luckyNumber');
  const hintEl = document.getElementById('luckyHint');
  if (!numberEl) return;

  const lucky = getTodayLuckyNumber();
  numberEl.textContent = lucky.number;
  if (hintEl) hintEl.textContent = lucky.hint;
}

/** 동전 던지기 — 하루 1회 */
function flipCoin() {
  if (!guardGameStart('coin')) return;
  const idleEl = document.getElementById('coinIdle');
  const resultEl = document.getElementById('coinResult');
  const faceEl = document.getElementById('coinResultFace');
  const textEl = document.getElementById('coinResultText');
  const btn = document.getElementById('btnCoinFlip');
  if (!idleEl || !resultEl) return;

  btn?.setAttribute('disabled', 'true');
  idleEl.classList.add('coin-flipping');
  setTimeout(() => {
    const isHeads = Math.random() < 0.5;
    faceEl.textContent = isHeads ? '🙂' : '🌙';
    textEl.textContent = isHeads ? '앞면 — Yes' : '뒷면 — No';
    idleEl.classList.remove('coin-flipping');
    idleEl.classList.add('hidden');
    resultEl.classList.remove('hidden');
    btn?.removeAttribute('disabled');
    finishGameDaily('coin');
  }, 500);
}

function resetCoin() {
  document.getElementById('coinResult')?.classList.add('hidden');
  document.getElementById('coinIdle')?.classList.remove('hidden');
}

/** 가위바위보 vs AI — 하루 1회 */
const RPS_EMOJI = { rock: '✊', scissors: '✌️', paper: '✋' };
const RPS_LABEL = { rock: '바위', scissors: '가위', paper: '보' };
const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function playRps(myMove) {
  if (!guardGameStart('rps')) return;
  if (!RPS_EMOJI[myMove]) return;
  const idleEl = document.getElementById('rpsIdle');
  const resultEl = document.getElementById('rpsResult');
  const meEmojiEl = document.getElementById('rpsMeEmoji');
  const aiEmojiEl = document.getElementById('rpsAiEmoji');
  const textEl = document.getElementById('rpsResultText');
  if (!idleEl || !resultEl) return;

  const moves = Object.keys(RPS_EMOJI);
  const aiMove = moves[Math.floor(Math.random() * moves.length)];
  if (meEmojiEl) meEmojiEl.textContent = RPS_EMOJI[myMove];
  if (aiEmojiEl) aiEmojiEl.textContent = RPS_EMOJI[aiMove];

  let outcome;
  if (myMove === aiMove) outcome = `비김 — 둘 다 ${RPS_LABEL[myMove]}`;
  else if (RPS_BEATS[myMove] === aiMove) outcome = `승리! ${RPS_LABEL[myMove]}가 ${RPS_LABEL[aiMove]}를 이겼어요`;
  else outcome = `패배... ${RPS_LABEL[aiMove]}한테 졌어요`;
  if (textEl) textEl.textContent = outcome;

  idleEl.classList.add('hidden');
  resultEl.classList.remove('hidden');
  finishGameDaily('rps');
}

function resetRps() {
  document.getElementById('rpsResult')?.classList.add('hidden');
  document.getElementById('rpsIdle')?.classList.remove('hidden');
}

/** 1분 스트레칭 — 하루 1회 */
const STRETCH_STORAGE_KEY = 'attendance-stretch';
const STRETCH_SECONDS = 60;
const STRETCH_TIPS = [
  '목을 좌우로 천천히 돌려보세요',
  '양팔을 위로 뻗고 크게 숨을 쉬어보세요',
  '어깨를 앞뒤로 크게 굴려보세요',
  '허리를 좌우로 살짝 비틀어보세요',
  '손목·손가락을 쭉 펴고 털어주세요',
  '깍지 낀 손을 앞으로 뻗고 등을 늘려보세요',
  '한쪽씩 발목을 돌려 스트레칭 해보세요',
];
let stretchTimerId = null;
let stretchSecondsLeft = STRETCH_SECONDS;

function loadStretchState() {
  try {
    const data = JSON.parse(localStorage.getItem(STRETCH_STORAGE_KEY) || 'null');
    if (!data || data.dayKey !== todayKey()) return { dayKey: todayKey(), count: 0 };
    return data;
  } catch {
    return { dayKey: todayKey(), count: 0 };
  }
}

function bumpStretchCount() {
  const state = loadStretchState();
  state.count += 1;
  localStorage.setItem(STRETCH_STORAGE_KEY, JSON.stringify(state));
  return state.count;
}

function renderStretchHint() {
  const hintEl = document.getElementById('stretchCardHint');
  if (!hintEl) return;
  hintEl.textContent = `오늘 ${loadStretchState().count}회`;
}

function startStretch() {
  if (!guardGameStart('stretch')) return;
  const idleEl = document.getElementById('stretchIdle');
  const runningEl = document.getElementById('stretchRunning');
  const doneEl = document.getElementById('stretchDone');
  const countdownEl = document.getElementById('stretchCountdown');
  const tipEl = document.getElementById('stretchTipText');
  if (!idleEl || !runningEl) return;

  stretchSecondsLeft = STRETCH_SECONDS;
  if (tipEl) tipEl.textContent = STRETCH_TIPS[Math.floor(Math.random() * STRETCH_TIPS.length)];
  if (countdownEl) countdownEl.textContent = String(stretchSecondsLeft);

  idleEl.classList.add('hidden');
  doneEl?.classList.add('hidden');
  runningEl.classList.remove('hidden');

  clearInterval(stretchTimerId);
  stretchTimerId = setInterval(() => {
    stretchSecondsLeft -= 1;
    if (countdownEl) countdownEl.textContent = String(Math.max(stretchSecondsLeft, 0));
    if (stretchSecondsLeft <= 0) finishStretch();
  }, 1000);
}

function finishStretch() {
  clearInterval(stretchTimerId);
  stretchTimerId = null;
  bumpStretchCount();
  document.getElementById('stretchRunning')?.classList.add('hidden');
  const doneTextEl = document.getElementById('stretchDoneText');
  if (doneTextEl) doneTextEl.textContent = '완료! 스트레칭 끝 🎉';
  document.getElementById('stretchDone')?.classList.remove('hidden');
  renderStretchHint();
  finishGameDaily('stretch');
}

function cancelStretch() {
  clearInterval(stretchTimerId);
  stretchTimerId = null;
  document.getElementById('stretchRunning')?.classList.add('hidden');
  document.getElementById('stretchIdle')?.classList.remove('hidden');
}

function resetStretchToIdle() {
  document.getElementById('stretchDone')?.classList.add('hidden');
  document.getElementById('stretchIdle')?.classList.remove('hidden');
}

/** 밸런스 게임 — A/B 선택 후 다른 직원들 선택 비율(시드 기반 고정값) 확인 */
const BALANCE_QUESTIONS = [
  { a: '아이스 아메리카노', b: '따뜻한 아메리카노' },
  { a: '재택근무', b: '사무실 출근' },
  { a: '점심은 혼밥', b: '점심은 다 같이' },
  { a: '민트초코', b: '민트초코 반대파' },
  { a: '주 4일제', b: '연봉 20% 인상' },
  { a: '아침형 인간', b: '저녁형 인간' },
  { a: '엘리베이터', b: '계단' },
  { a: '칼퇴', b: '야근수당' },
  { a: '치킨은 후라이드', b: '치킨은 양념' },
  { a: '여름 휴가', b: '겨울 휴가' },
  { a: '회식은 저녁', b: '회식은 점심' },
  { a: '메신저로 소통', b: '직접 찾아가서 소통' },
];
let balanceQIndex = null;

function renderBalanceGame() {
  if (isGamePlayedToday('balance')) return;
  const qEl = document.getElementById('balanceQuestion');
  const aBtn = document.getElementById('balanceOptionA');
  const bBtn = document.getElementById('balanceOptionB');
  if (!qEl || !aBtn || !bBtn) return;

  balanceQIndex = Math.floor(Math.random() * BALANCE_QUESTIONS.length);
  const q = BALANCE_QUESTIONS[balanceQIndex];
  qEl.textContent = `${q.a}  vs  ${q.b}`;
  aBtn.textContent = q.a;
  bBtn.textContent = q.b;

  document.getElementById('balanceResult')?.classList.add('hidden');
  document.getElementById('balanceIdle')?.classList.remove('hidden');
}

function pickBalance(choice) {
  if (balanceQIndex === null) return;
  const q = BALANCE_QUESTIONS[balanceQIndex];
  const seed = hashFortuneSeed(`${todayKey()}:balance:${balanceQIndex}`);
  const pctA = 30 + (seed % 41);
  const pctB = 100 - pctA;

  document.getElementById('balanceIdle')?.classList.add('hidden');
  const textEl = document.getElementById('balanceResultText');
  if (textEl) textEl.textContent = choice === 'a' ? `"${q.a}" 선택!` : `"${q.b}" 선택!`;

  const barA = document.getElementById('balanceBarA');
  const barB = document.getElementById('balanceBarB');
  if (barA) barA.style.width = `${pctA}%`;
  if (barB) barB.style.width = `${pctB}%`;

  const labelA = document.getElementById('balanceLabelA');
  const labelB = document.getElementById('balanceLabelB');
  if (labelA) labelA.textContent = `${q.a} ${pctA}%`;
  if (labelB) labelB.textContent = `${q.b} ${pctB}%`;

  document.getElementById('balanceResult')?.classList.remove('hidden');
  finishGameDaily('balance');
}

/** 타자 속도 테스트 — 문장 따라치기, 분당 타수(CPM) 측정 */
const TYPING_STORAGE_KEY = 'attendance-typing-best';
const TYPING_SENTENCES = [
  '오늘도 무사히 출근 완료했습니다',
  '커피 한잔의 여유가 필요한 시간입니다',
  '점심 메뉴 고민은 언제나 즐겁습니다',
  '칼퇴를 향해 달려가는 오후입니다',
  '월요일도 결국 지나가기 마련입니다',
  '회의는 짧을수록 좋은 법입니다',
  '주말이 코앞으로 다가오고 있습니다',
  '업무 집중력은 커피에서 나옵니다',
  '금요일 퇴근길은 언제나 가볍습니다',
  '오늘 하루도 수고 많으셨습니다',
];
let typingTarget = '';
let typingStartTime = null;

function loadTypingBest() {
  try {
    return Number(localStorage.getItem(TYPING_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveTypingBestIfHigher(cpm) {
  const best = loadTypingBest();
  if (cpm > best) localStorage.setItem(TYPING_STORAGE_KEY, String(cpm));
  return Math.max(best, cpm);
}

function renderTypingHint() {
  const hintEl = document.getElementById('typingCardHint');
  if (!hintEl) return;
  const best = loadTypingBest();
  hintEl.textContent = best ? `최고 ${best}타/분` : '문장 따라치기';
}

function startTypingTest() {
  if (!guardGameStart('typing')) return;
  const idleEl = document.getElementById('typingIdle');
  const runningEl = document.getElementById('typingRunning');
  const doneEl = document.getElementById('typingDone');
  const targetEl = document.getElementById('typingTarget');
  const inputEl = document.getElementById('typingInput');
  if (!idleEl || !runningEl || !targetEl || !inputEl) return;

  typingTarget = TYPING_SENTENCES[Math.floor(Math.random() * TYPING_SENTENCES.length)];
  typingStartTime = null;
  targetEl.textContent = typingTarget;
  inputEl.value = '';

  idleEl.classList.add('hidden');
  doneEl?.classList.add('hidden');
  runningEl.classList.remove('hidden');
  inputEl.focus();
}

function handleTypingInput(value) {
  if (!typingTarget) return;
  if (typingStartTime === null && value.length > 0) typingStartTime = Date.now();
  if (value === typingTarget) finishTypingTest();
}

function finishTypingTest() {
  const elapsedSec = Math.max((Date.now() - typingStartTime) / 1000, 0.5);
  const cpm = Math.round((typingTarget.length / elapsedSec) * 60);
  const best = saveTypingBestIfHigher(cpm);

  document.getElementById('typingRunning')?.classList.add('hidden');
  const doneTextEl = document.getElementById('typingDoneText');
  if (doneTextEl) {
    doneTextEl.textContent = cpm >= best
      ? `${cpm}타/분 — 신기록 🎉`
      : `${cpm}타/분 (최고 ${best}타/분)`;
  }
  document.getElementById('typingDone')?.classList.remove('hidden');
  typingTarget = '';
  finishGameDaily('typing');
}

function cancelTypingTest() {
  typingTarget = '';
  document.getElementById('typingRunning')?.classList.add('hidden');
  document.getElementById('typingIdle')?.classList.remove('hidden');
}

function resetTypingToIdle() {
  document.getElementById('typingDone')?.classList.add('hidden');
  document.getElementById('typingIdle')?.classList.remove('hidden');
}

/** 반응속도 테스트 — 초록불에 빠르게 탭, ms 측정 */
const REACTION_STORAGE_KEY = 'attendance-reaction-best';
let reactionPhase = 'idle';
let reactionGoAt = 0;
let reactionTimerId = null;

function loadReactionBest() {
  try {
    return Number(localStorage.getItem(REACTION_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveReactionBestIfLower(ms) {
  const best = loadReactionBest();
  if (!best || ms < best) localStorage.setItem(REACTION_STORAGE_KEY, String(ms));
  return Math.min(best || ms, ms);
}

function renderReactionHint() {
  const hintEl = document.getElementById('reactionCardHint');
  if (!hintEl) return;
  const best = loadReactionBest();
  hintEl.textContent = best ? `최고 ${best}ms` : '초록불에 탭';
}

function clearReactionTimer() {
  clearTimeout(reactionTimerId);
  reactionTimerId = null;
}

function setReactionPlayState(mode, text, sub = '') {
  const playEl = document.getElementById('reactionPlay');
  const textEl = document.getElementById('reactionPlayText');
  const subEl = document.getElementById('reactionPlaySub');
  if (!playEl) return;
  playEl.classList.remove('reaction-wait', 'reaction-go', 'reaction-early');
  if (mode) playEl.classList.add(mode);
  if (textEl) textEl.textContent = text;
  if (subEl) subEl.textContent = sub;
}

function startReactionTest() {
  if (isGamePlayedToday('reaction')) return;
  const idleEl = document.getElementById('reactionIdle');
  const playEl = document.getElementById('reactionPlay');
  const doneEl = document.getElementById('reactionDone');
  if (!idleEl || !playEl) return;

  clearReactionTimer();
  reactionPhase = 'wait';
  reactionGoAt = 0;

  idleEl.classList.add('hidden');
  doneEl?.classList.add('hidden');
  playEl.classList.remove('hidden');
  setReactionPlayState('reaction-wait', '기다리세요…', '빨간불일 땐 누르지 마세요');

  const delay = 1500 + Math.random() * 2500;
  reactionTimerId = setTimeout(() => {
    reactionPhase = 'go';
    reactionGoAt = Date.now();
    setReactionPlayState('reaction-go', '지금!', '최대한 빨리 탭하세요');
  }, delay);
}

function handleReactionTap() {
  if (isGamePlayedToday('reaction')) return;
  if (reactionPhase === 'wait') {
    clearReactionTimer();
    reactionPhase = 'idle';
    setReactionPlayState('reaction-early', '너무 빨라요!', '초록불이 뜰 때까지 기다리세요');
    setTimeout(resetReactionToIdle, 1200);
    return;
  }
  if (reactionPhase !== 'go' || !reactionGoAt) return;

  const ms = Date.now() - reactionGoAt;
  reactionPhase = 'idle';
  const best = saveReactionBestIfLower(ms);

  document.getElementById('reactionPlay')?.classList.add('hidden');
  const doneTextEl = document.getElementById('reactionDoneText');
  if (doneTextEl) {
    doneTextEl.textContent = ms <= best
      ? `${ms}ms — 신기록 ⚡`
      : `${ms}ms (최고 ${best}ms)`;
  }
  document.getElementById('reactionDone')?.classList.remove('hidden');
  renderReactionHint();
  finishGameDaily('reaction');
}

function resetReactionToIdle() {
  clearReactionTimer();
  reactionPhase = 'idle';
  document.getElementById('reactionPlay')?.classList.add('hidden');
  document.getElementById('reactionDone')?.classList.add('hidden');
  document.getElementById('reactionIdle')?.classList.remove('hidden');
}

/** 숫자 맞추기 — 1~50, UP/DOWN 힌트 */
const GUESS_STORAGE_KEY = 'attendance-guess-best';
const GUESS_MAX = 50;
let guessTarget = 0;
let guessTries = 0;

function loadGuessBest() {
  try {
    return Number(localStorage.getItem(GUESS_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveGuessBestIfLower(tries) {
  const best = loadGuessBest();
  if (!best || tries < best) localStorage.setItem(GUESS_STORAGE_KEY, String(tries));
  return Math.min(best || tries, tries);
}

function renderGuessHint() {
  const hintEl = document.getElementById('guessCardHint');
  if (!hintEl) return;
  const best = loadGuessBest();
  hintEl.textContent = best ? `최소 ${best}번` : '1~50';
}

function startGuessGame() {
  if (!guardGameStart('guess')) return;
  const idleEl = document.getElementById('guessIdle');
  const playingEl = document.getElementById('guessPlaying');
  const doneEl = document.getElementById('guessDone');
  const feedbackEl = document.getElementById('guessFeedback');
  const triesEl = document.getElementById('guessTries');
  const inputEl = document.getElementById('guessInput');
  if (!idleEl || !playingEl) return;

  guessTarget = Math.floor(Math.random() * GUESS_MAX) + 1;
  guessTries = 0;
  if (feedbackEl) feedbackEl.textContent = '숫자를 입력하세요';
  if (triesEl) triesEl.textContent = '시도 0회';
  if (inputEl) inputEl.value = '';

  idleEl.classList.add('hidden');
  doneEl?.classList.add('hidden');
  playingEl.classList.remove('hidden');
  inputEl?.focus();
}

function submitGuess() {
  const inputEl = document.getElementById('guessInput');
  const feedbackEl = document.getElementById('guessFeedback');
  const triesEl = document.getElementById('guessTries');
  if (!inputEl || !guessTarget) return;

  const value = Number(inputEl.value);
  if (!Number.isInteger(value) || value < 1 || value > GUESS_MAX) {
    if (feedbackEl) feedbackEl.textContent = `1~${GUESS_MAX} 사이 숫자를 입력하세요`;
    return;
  }

  guessTries += 1;
  if (triesEl) triesEl.textContent = `시도 ${guessTries}회`;

  if (value === guessTarget) {
    const best = saveGuessBestIfLower(guessTries);
    document.getElementById('guessPlaying')?.classList.add('hidden');
    const doneTextEl = document.getElementById('guessDoneText');
    if (doneTextEl) {
      doneTextEl.textContent = guessTries <= best
        ? `${guessTarget} 정답! ${guessTries}번 만에 맞춤 — 신기록 🎉`
        : `${guessTarget} 정답! ${guessTries}번 (최고 ${best}번)`;
    }
    document.getElementById('guessDone')?.classList.remove('hidden');
    renderGuessHint();
    guessTarget = 0;
    finishGameDaily('guess');
    return;
  }

  if (feedbackEl) {
    feedbackEl.textContent = value < guessTarget
      ? `${value} — 더 큰 숫자예요 ⬆️`
      : `${value} — 더 작은 숫자예요 ⬇️`;
  }
  inputEl.value = '';
  inputEl.focus();
}

function giveUpGuessGame() {
  if (!guessTarget) return;
  const answer = guessTarget;
  guessTarget = 0;
  document.getElementById('guessPlaying')?.classList.add('hidden');
  const doneTextEl = document.getElementById('guessDoneText');
  if (doneTextEl) doneTextEl.textContent = `정답은 ${answer}였어요`;
  document.getElementById('guessDone')?.classList.remove('hidden');
  finishGameDaily('guess');
}

function resetGuessToIdle() {
  guessTarget = 0;
  document.getElementById('guessPlaying')?.classList.add('hidden');
  document.getElementById('guessDone')?.classList.add('hidden');
  document.getElementById('guessIdle')?.classList.remove('hidden');
}

/** 주사위 굴리기 — 2개 합계, 오늘 최고 합 기록 */
const DICE_STORAGE_KEY = 'attendance-dice-best';
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const DICE_SUM_MSG = {
  2: '스네이크아이즈… 오늘은 조심히 가요',
  3: '작은 숫자지만 시작은 됐어요',
  4: '무난한 출발이에요',
  5: '평범이 최고의 행운이에요',
  6: '괜찮은 숫자예요',
  7: '행운의 7! 뭐든 해보세요',
  8: '기분 좋은 숫자예요',
  9: '오늘 운이 따르는 편이에요',
  10: '꽤 좋은 합이에요!',
  11: '거의 최고! 오늘 잘 될 거예요',
  12: '더블 식스! 레전드 행운 🎉',
};

function loadDiceBest() {
  try {
    const raw = localStorage.getItem(DICE_STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return data?.date === todayKey() ? Number(data.sum) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveDiceBestIfHigher(sum) {
  const best = loadDiceBest();
  if (!best || sum > best) {
    localStorage.setItem(DICE_STORAGE_KEY, JSON.stringify({ date: todayKey(), sum }));
    return sum;
  }
  return best;
}

function renderDiceHint() {
  const hintEl = document.getElementById('diceCardHint');
  if (!hintEl) return;
  const best = loadDiceBest();
  hintEl.textContent = best ? `오늘 최고 ${best}` : '2개 합계';
}

function rollDice() {
  if (!guardGameStart('dice')) return;
  const idleEl = document.getElementById('diceIdle');
  const resultEl = document.getElementById('diceResult');
  const facesEl = document.getElementById('diceFaces');
  const sumEl = document.getElementById('diceSumText');
  const msgEl = document.getElementById('diceMsgText');
  const btn = document.getElementById('btnDiceRoll');
  if (!idleEl || !resultEl) return;

  btn?.setAttribute('disabled', 'true');
  idleEl.classList.add('dice-rolling');
  let ticks = 0;
  const spin = setInterval(() => {
    const a = Math.floor(Math.random() * 6);
    const b = Math.floor(Math.random() * 6);
    if (facesEl) facesEl.textContent = `${DICE_FACES[a]} ${DICE_FACES[b]}`;
    ticks += 1;
    if (ticks >= 8) {
      clearInterval(spin);
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const sum = d1 + d2;
      const best = saveDiceBestIfHigher(sum);
      if (facesEl) facesEl.textContent = `${DICE_FACES[d1 - 1]} ${DICE_FACES[d2 - 1]}`;
      if (sumEl) {
        sumEl.textContent = sum >= best && sum > 0
          ? `합계 ${sum} — 오늘 최고!`
          : `합계 ${sum} (오늘 최고 ${best})`;
      }
      if (msgEl) msgEl.textContent = DICE_SUM_MSG[sum] || '주사위가 말해줬어요';
      idleEl.classList.remove('dice-rolling');
      idleEl.classList.add('hidden');
      resultEl.classList.remove('hidden');
      btn?.removeAttribute('disabled');
      renderDiceHint();
      finishGameDaily('dice');
    }
  }, 80);
}

function resetDice() {
  document.getElementById('diceResult')?.classList.add('hidden');
  document.getElementById('diceIdle')?.classList.remove('hidden');
}

/** 행운 슬롯 — 3릴 매칭, 오늘 잭팟 횟수 */
const SLOT_STORAGE_KEY = 'attendance-slot-jackpots';
const SLOT_SYMBOLS = ['🍀', '⭐', '💎', '☕', '🍕', '🎯'];

function loadSlotJackpots() {
  try {
    const raw = localStorage.getItem(SLOT_STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return data?.date === todayKey() ? Number(data.count) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveSlotJackpot() {
  const count = loadSlotJackpots() + 1;
  localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify({ date: todayKey(), count }));
  return count;
}

function renderSlotHint() {
  const hintEl = document.getElementById('slotCardHint');
  if (!hintEl) return;
  const jackpots = loadSlotJackpots();
  hintEl.textContent = jackpots ? `오늘 잭팟 ${jackpots}회` : '3개 일치';
}

function spinSlot() {
  if (!guardGameStart('slot')) return;
  const idleEl = document.getElementById('slotIdle');
  const resultEl = document.getElementById('slotResult');
  const reelsEl = document.getElementById('slotReels');
  const msgEl = document.getElementById('slotMsgText');
  const btn = document.getElementById('btnSlotSpin');
  if (!idleEl || !resultEl) return;

  btn?.setAttribute('disabled', 'true');
  idleEl.classList.add('slot-spinning');
  let ticks = 0;
  const spin = setInterval(() => {
    const picks = [
      SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
    ];
    if (reelsEl) reelsEl.textContent = picks.join(' ');
    ticks += 1;
    if (ticks >= 10) {
      clearInterval(spin);
      const final = [
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      ];
      if (reelsEl) reelsEl.textContent = final.join(' ');
      const allMatch = final[0] === final[1] && final[1] === final[2];
      const pairMatch = !allMatch && (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]);
      if (msgEl) {
        if (allMatch) {
          const count = saveSlotJackpot();
          msgEl.textContent = `잭팟! ${final[0]} 3개 — 오늘 ${count}번째 🎉`;
        } else if (pairMatch) {
          msgEl.textContent = '더블 매치! 꽤 좋은 행운이에요';
        } else {
          msgEl.textContent = '아쉽네요… 다시 도전해보세요';
        }
      }
      idleEl.classList.remove('slot-spinning');
      idleEl.classList.add('hidden');
      resultEl.classList.remove('hidden');
      btn?.removeAttribute('disabled');
      renderSlotHint();
      finishGameDaily('slot');
    }
  }, 80);
}

function resetSlot() {
  document.getElementById('slotResult')?.classList.add('hidden');
  document.getElementById('slotIdle')?.classList.remove('hidden');
}

/** 5초 탭 챌린지 — 오늘 최고 탭 수 */
const TAP_STORAGE_KEY = 'attendance-tap-best';
const TAP_SECONDS = 5;
let tapCount = 0;
let tapTimerId = null;
let tapIntervalId = null;

function loadTapBest() {
  try {
    const raw = localStorage.getItem(TAP_STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return data?.date === todayKey() ? Number(data.count) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveTapBestIfHigher(count) {
  const best = loadTapBest();
  if (!best || count > best) {
    localStorage.setItem(TAP_STORAGE_KEY, JSON.stringify({ date: todayKey(), count }));
    return count;
  }
  return best;
}

function renderTapHint() {
  const hintEl = document.getElementById('tapCardHint');
  if (!hintEl) return;
  const best = loadTapBest();
  hintEl.textContent = best ? `오늘 최고 ${best}탭` : '5초 안에';
}

function clearTapTimers() {
  if (tapTimerId) {
    clearTimeout(tapTimerId);
    tapTimerId = null;
  }
  if (tapIntervalId) {
    clearInterval(tapIntervalId);
    tapIntervalId = null;
  }
}

function startTapChallenge() {
  if (!guardGameStart('tap')) return;
  const idleEl = document.getElementById('tapIdle');
  const runningEl = document.getElementById('tapRunning');
  const doneEl = document.getElementById('tapDone');
  const countEl = document.getElementById('tapCount');
  const countdownEl = document.getElementById('tapCountdown');
  if (!idleEl || !runningEl) return;

  clearTapTimers();
  tapCount = 0;
  if (countEl) countEl.textContent = '0';
  if (countdownEl) countdownEl.textContent = String(TAP_SECONDS);

  idleEl.classList.add('hidden');
  doneEl?.classList.add('hidden');
  runningEl.classList.remove('hidden');

  let left = TAP_SECONDS;
  tapIntervalId = setInterval(() => {
    left -= 1;
    if (countdownEl) countdownEl.textContent = String(Math.max(left, 0));
    if (left <= 0) clearInterval(tapIntervalId);
  }, 1000);

  tapTimerId = setTimeout(() => finishTapChallenge(), TAP_SECONDS * 1000);
}

function handleTapHit() {
  if (!tapTimerId) return;
  tapCount += 1;
  const countEl = document.getElementById('tapCount');
  if (countEl) countEl.textContent = String(tapCount);
}

function finishTapChallenge() {
  clearTapTimers();
  const runningEl = document.getElementById('tapRunning');
  const doneEl = document.getElementById('tapDone');
  const doneTextEl = document.getElementById('tapDoneText');
  runningEl?.classList.add('hidden');

  const best = saveTapBestIfHigher(tapCount);
  if (doneTextEl) {
    doneTextEl.textContent = tapCount >= best
      ? `${tapCount}탭 — 오늘 최고!`
      : `${tapCount}탭 (오늘 최고 ${best}탭)`;
  }
  doneEl?.classList.remove('hidden');
  renderTapHint();
  finishGameDaily('tap');
}

function resetTapToIdle() {
  clearTapTimers();
  tapCount = 0;
  document.getElementById('tapRunning')?.classList.add('hidden');
  document.getElementById('tapDone')?.classList.add('hidden');
  document.getElementById('tapIdle')?.classList.remove('hidden');
}
