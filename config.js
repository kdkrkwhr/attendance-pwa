/**
 * 회사 네트워크 설정 (배포 시 관리자가 수정)
 *
 * 1. 회사 Wi-Fi에 연결
 * 2. 휴대폰 브라우저에서 https://api.ipify.org 접속 → 나온 IP 복사
 * 3. 아래 allowedPublicIps 에 붙여넣기
 *
 * 브라우저는 Wi-Fi 이름(SSID)을 읽을 수 없어서,
 * 회사 Wi-Fi의 공인 IP로 확인합니다.
 */
window.APP_CONFIG = {
  networkGuard: {
    enabled: true,
    /** 회사 Wi-Fi에서 보이는 공인 IP (여러 개면 쉼표로 구분 가능) */
    allowedPublicIps: ['222.235.88.35'],
  },
  /** 08~10시 회사 네트워크 최초 감지 시 출근 추정 (앱이 켜져 있을 때) */
  morningCheckInDetect: {
    enabled: true,
    startHour: 8,
    endHour: 10,
    pollIntervalMs: 60_000,
  },
  /** 점심 지도 기본 위치 (restaurants.json 의 office 가 있으면 office 우선) */
  lunchMap: {
    dataUrl: './data/dmc_restaurants.json',
    defaultCenter: [37.5845, 126.8856],
    defaultZoom: 16,
  },
};
