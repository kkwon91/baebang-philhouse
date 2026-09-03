/**
 * 배방 필하우스 리버시티 — 상담신청 접수 백엔드 (Google Apps Script)
 * 접수 → ① 구글시트 저장 ② 이메일 알림 ③ 문자(SMS) 알림
 *
 * ■ 코드 교체 방법: Apps Script 편집기에서 전체 붙여넣기 → 저장 →
 *   [배포] → [배포 관리] → 연필(수정) → 버전 "새 버전" → [배포]
 *   ★ "새 배포"를 누르면 URL이 바뀌니 반드시 "배포 관리 → 수정"으로!
 *
 * ■ 문자 알림 켜는 법 (알리고 smartsms.aligo.in)
 *   1. 알리고 가입 → [발신번호 관리]에서 발신번호 등록·인증 (1666-4979 또는 휴대폰)
 *   2. [API 연동] 메뉴에서 API Key 발급 + 발송서버 IP 인증을 "미사용(전체허용)"으로
 *   3. 아래 SMS_ 4개 값 채우기 → 저장 → 새 버전 재배포
 */

var NOTIFY_EMAIL = 'coin5451@gmail.com'; // 접수 알림 메일 — 비우면 메일 없음

// ── 문자(SMS) 알림 설정 — 값이 비어 있으면 문자는 발송되지 않음 ──
var SMS_API_KEY   = '';                 // 알리고 API Key
var SMS_USER_ID   = '';                 // 알리고 사용자 ID
var SMS_SENDER    = '';                 // 알리고에 등록·인증된 발신번호 (예: '16664979')
var SMS_RECEIVERS = ['01000000000'];    // 접수 알림 받을 번호 목록 (여러 명 가능: ['0101111...', '0102222...'])

function doPost(e) {
  var p = (e && e.parameter) || {};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('접수') || ss.insertSheet('접수');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['접수일시', '성명', '연락처', '관심타입', '유입경로(UTM)', '페이지']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), p.name || '', p.phone || '', p.type || '', p.utm || '', p.page || '']);

  // 알림은 실패해도 접수 저장에 영향 없게 각각 try-catch
  try { notifyEmail(p); } catch (err) {}
  try { notifySms(p); } catch (err) {}

  return ContentService.createTextOutput('ok');
}

function notifyEmail(p) {
  if (!NOTIFY_EMAIL) return;
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

function notifySms(p) {
  if (!SMS_API_KEY || !SMS_USER_ID || !SMS_SENDER) return;
  var msg = '[배방 상담신청]\n' +
            (p.name || '이름없음') + ' ' + (p.phone || '') +
            '\n관심타입: ' + (p.type || '-');
  SMS_RECEIVERS.forEach(function (to) {
    UrlFetchApp.fetch('https://apis.aligo.in/send/', {
      method: 'post',
      payload: {
        key: SMS_API_KEY,
        user_id: SMS_USER_ID,
        sender: SMS_SENDER,
        receiver: String(to).replace(/\D/g, ''),
        msg: msg,
        testmode_yn: 'N'
      },
      muteHttpExceptions: true
    });
  });
}

/** 문자 설정 후 이 함수를 편집기에서 [실행]하면 테스트 문자가 갑니다 */
function testSms() {
  notifySms({ name: '테스트', phone: '010-0000-0000', type: '84C' });
}
