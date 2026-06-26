# 출퇴근 체크 PWA

서버 없이 동작하는 자율출퇴근 관리 앱입니다.  
GitHub Pages에 올리면 PC 없이 24시간 접속할 수 있습니다.

## 근무 규칙

- **기본**: 출근 시각 + 8시간 근무 + 1시간 점심 = 퇴근 가능 시각
- 예: 08:00 출근 → 17:00 퇴근 / 09:00 출근 → 18:00 퇴근
- 9~10시간 근무는 설정에서 목표 근무시간 변경

---

## GitHub Pages 배포 방법

### 1. GitHub에 저장소 만들기

1. [GitHub](https://github.com) → **New repository**
2. 이름 예: `attendance-pwa`
3. **Public** 선택 (무료 Pages)
4. **Create repository**

### 2. 파일 업로드

이 폴더(`attendance-pwa`) **안의 파일 전체**를 저장소 **루트(최상위)**에 올립니다.

```
attendance-pwa/          ← 이 폴더 자체가 아니라, 안의 파일들
├── index.html           ← 저장소 루트에 바로
├── manifest.json
├── sw.js
├── icon-192.png
├── icon-512.png
├── .nojekyll
├── css/
└── js/
```

GitHub 웹에서: 저장소 → **Add file** → **Upload files** → 끌어다 놓기

### 3. Pages 켜기

1. 저장소 **Settings** → 왼쪽 **Pages**
2. **Source**: Deploy from a branch
3. **Branch**: `main` / **Folder**: `/ (root)`
4. **Save**

1~2분 후 주소가 생깁니다:

```
https://<GitHub아이디>.github.io/attendance-pwa/
```

### 4. 휴대폰 설치

1. 위 주소를 **Chrome**에서 열기
2. **공유 → 홈 화면에 추가**
3. **알림 권한 허용**

팀원에게는 이 **HTTPS 주소만** 공유하면 됩니다. PC는 필요 없습니다.

---

## Git으로 올리는 경우 (선택)

```bash
cd attendance-pwa
git init
git add .
git commit -m "Add attendance PWA"
git branch -M main
git remote add origin https://github.com/<아이디>/attendance-pwa.git
git push -u origin main
```

이후 Settings → Pages에서 위와 같이 설정.

---

## 주의사항

| 항목 | 설명 |
|------|------|
| **기록 저장** | 각자 **폰 브라우저**에만 저장 (서버·GitHub에 안 올라감) |
| **주소 바꾸면** | 예전 주소(localhost, loca.lt)에 쌓인 기록과 **별개** (다시 출근부터) |
| **HTTPS** | GitHub Pages는 HTTPS라 **앱 설치·알림**이 로컬 IP보다 잘 됨 |
| **업데이트** | 코드 수정 후 push하면 몇 분 뒤 반영. 폰에서 **새로고침** |

---

## 사용법

1. GitHub Pages 주소로 접속
2. **홈 화면에 추가**
3. 지문 찍을 때 **출근 체크** 버튼도 함께
4. **알림 권한 허용**

## 로컬 테스트 (개발용)

```bash
npx serve .
```

## 팀 공유

- Pages URL 링크 공유
- 주간 현황은 **기록보내기 (CSV)**

## 알림

- Android가 Chrome PWA 알림에 더 유리
- iPhone은 홈 화면 추가 후 iOS 16.4+에서 알림 가능
