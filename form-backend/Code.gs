/**
 * 배방 필하우스 리버시티 — 상담신청 접수 백엔드 (Google Apps Script)
 * 접수가 들어올 때마다 구글 스프레드시트에 한 줄씩 쌓이고, 원하면 이메일 알림도 옵니다. 비용 0원.
 *
 * ■ 설치 방법 (5분)
 *  1. sheets.google.com 에서 새 스프레드시트 생성 (이름 예: 배방 상담접수)
 *  2. 메뉴 [확장 프로그램] → [Apps Script] 클릭
 *  3. 기본 코드를 모두 지우고 이 파일 내용 전체를 붙여넣기 → 저장(Ctrl+S)
 *  4. 우측 상단 [배포] → [새 배포] → 톱니바퀴에서 유형 "웹 앱" 선택
 *       - 다음 사용자 인증 정보로 실행: 나
 *       - 액세스 권한이 있는 사용자: **모든 사용자**  ← 중요
 *  5. [배포] → 권한 승인(계정 선택 → "고급" → "이동") → 웹 앱 URL 복사
 *  6. index.html 의  var FORM_ENDPOINT = ''  에 복사한 URL 붙여넣기 → 사이트 재업로드
 *
 * ■ 코드 수정 후에는 [배포] → [배포 관리] → 연필 아이콘 → 버전 "새 버전" → [배포] 해야 반영됩니다.
 * ■ 접수 즉시 이메일 알림을 받으려면 아래 NOTIFY_EMAIL 에 이메일을 넣으세요.
 */

var NOTIFY_EMAIL = ''; // 예: 'me@gmail.com' — 비워두면 알림 없음

function doPost(e) {
  var p = (e && e.parameter) || {};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('접수') || ss.insertSheet('접수');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['접수일시', '성명', '연락처', '관심타입', '유입경로(UTM)', '페이지']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), p.name || '', p.phone || '', p.type || '', p.utm || '', p.page || '']);

  if (NOTIFY_EMAIL) {
    MailApp.sendEmail(
      NOTIFY_EMAIL,
      '[배방 상담신청] ' + (p.name || '이름없음') + ' ' + (p.phone || ''),
      '성명: ' + (p.name || '') +
      '\n연락처: ' + (p.phone || '') +
      '\n관심타입: ' + (p.type || '') +
      '\n유입(UTM): ' + (p.utm || '') +
      '\n페이지: ' + (p.page || '') +
      '\n접수시각: ' + new Date()
    );
  }
  return ContentService.createTextOutput('ok');
}
