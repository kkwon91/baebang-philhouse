/**
 * 배방 필하우스 리버시티 — 상담신청 접수 백엔드 (Google Apps Script)
 * 접수 → ① 구글시트 저장 ② 이메일 알림 ③ 문자(SMS) 알림
 *
 * ■ 코드 교체 방법: Apps Script 편집기에서 전체 붙여넣기 → 저장 →
 *   [배포] → [배포 관리] → 연필(수정) → 버전 "새 버전" → [배포]
 *   ★ "새 배포"를 누르면 URL이 바뀌니 반드시 "배포 관리 → 수정"으로!
 *
 * ■ 문자 알림 켜는 법 (NHN클라우드 Notification > SMS)
 *   1. console.nhncloud.com 가입 → 프로젝트 생성 → Notification > SMS 서비스 활성화
 *   2. SMS 콘솔 [발신번호] 탭에서 발신번호 사전 등록 (심사 1~2영업일)
 *   3. AppKey: SMS 콘솔 상단 [URL & Appkey]에서 확인 / Secret Key: 같은 화면에서 확인
 *   4. 아래 SMS_ 4개 값 채우기 → 저장 → "배포 관리 → 수정 → 새 버전" 재배포
 */

var NOTIFY_EMAIL = 'coin5451@gmail.com'; // 접수 알림 메일 — 비우면 메일 없음
var LEAD_SPREADSHEET_ID = ''; // 운영 Apps Script에만 접수 시트 ID 입력. 저장소에는 보관하지 않음.

// ── 문자(SMS) 알림 설정 (NHN클라우드) — 값이 비어 있으면 문자는 발송되지 않음 ──
var SMS_APP_KEY    = '';                // NHN클라우드 SMS AppKey
var SMS_SECRET_KEY = '';                // NHN클라우드 SMS SecretKey
var SMS_SEND_NO    = '';                // 사전 등록·승인된 발신번호 (예: '16664979')
var SMS_RECEIVERS  = ['01000000000'];   // 접수 알림 받을 번호 목록 (여러 명 가능: ['0101111...', '0102222...'])

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (!String(p.name || '').trim() || !/^01[016789]-\d{3,4}-\d{4}$/.test(p.phone || '')) {
    leadLog('save', 'rejected', { reason: 'invalid_fields' });
    return ContentService.createTextOutput('invalid');
  }
  var receiptId = /^[a-f0-9]{32}$/.test(p.receipt_id || '') ? p.receipt_id : '';
  var cache = CacheService.getScriptCache();
  var key = 'receipt:' + receiptId;
  var lock = LockService.getScriptLock();
  var locked = false;
  var step = 'lock';
  try {
    lock.waitLock(10000);
    locked = true;
    // 같은 접수 ID의 재전송은 저장·알림을 반복하지 않음 (캐시 유지 기간 내).
    if (receiptId && cache.get(key) === 'saved') {
      leadLog('save', 'duplicate');
      return ContentService.createTextOutput('ok');
    }
    step = 'sheet';
    var ss = SpreadsheetApp.openById(LEAD_SPREADSHEET_ID);
    var sh = ss.getSheetByName('접수') || ss.insertSheet('접수');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['접수일시', '성명', '연락처', '관심타입', '유입경로(UTM)', '페이지']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), sheetText(p.name), sheetText(p.phone), sheetText(p.type), sheetText(p.utm), sheetText(p.page)]);
    SpreadsheetApp.flush();
    leadLog('save', 'saved');
    // 시트 쓰기가 완료된 뒤에만 성공 상태를 노출. 개인정보는 캐시에 저장하지 않음.
    if (receiptId) {
      try { cache.put(key, 'saved', 21600); }
      catch (err) { leadLog('receipt', 'unknown', { reason: 'cache_exception' }); }
    }
  } catch (err) {
    leadLog('save', 'failed', { reason: step });
    // 원본 예외에는 시트 내용·URL이 포함될 수 있으므로 그대로 로그에 노출하지 않음.
    throw new Error('Lead save failed at ' + step);
  } finally {
    if (locked) lock.releaseLock();
  }

  // 알림은 실패해도 접수 저장에 영향 없게 각각 try-catch
  try { notifyEmail(p); } catch (err) { leadLog('email', 'failed', { reason: 'service_exception' }); }
  try { notifySms(p); } catch (err) { leadLog('sms', 'unknown', { reason: 'service_exception' }); }

  return ContentService.createTextOutput('ok');
}

function sheetText(value) {
  var text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

// 호출 지점에서 정한 단계·코드·건수만 기록. 고객 정보, 설정, 원본 예외/응답은 금지.
function leadLog(stage, status, details) {
  try {
    console.log(JSON.stringify({ event: 'lead_backend', stage: stage, status: status, details: details || {} }));
  } catch (err) {} // 진단 로그의 오류가 저장·알림을 방해하지 않음.
}

// 읽기 전용 접수 상태. 난수 ID의 저장 여부만 반환하며 고객 정보는 반환하지 않음.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'health') {
    return ContentService.createTextOutput(JSON.stringify({ version: 'receipt-v2', status: 'ready' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (p.action !== 'status' || !/^[a-f0-9]{32}$/.test(p.receipt_id || '') ||
      !/^bbReceipt_[a-f0-9]{32}_\d+$/.test(p.callback || '')) {
    return ContentService.createTextOutput('invalid');
  }
  var saved = CacheService.getScriptCache().get('receipt:' + p.receipt_id) === 'saved';
  return ContentService.createTextOutput(p.callback + '(' + JSON.stringify({ status: saved ? 'saved' : 'pending' }) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function notifyEmail(p) {
  if (!NOTIFY_EMAIL) { leadLog('email', 'skipped', { reason: 'not_configured' }); return; }
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
  leadLog('email', 'submitted'); // MailApp 호출 완료이며 수신함 도착 보장은 아님.
}

function notifySms(p) {
  if (!SMS_APP_KEY || !SMS_SECRET_KEY || !SMS_SEND_NO) {
    leadLog('sms', 'skipped', { reason: 'not_configured' });
    return;
  }
  var invalid = 0;
  var restored = 0;
  var numbers = [];
  (Array.isArray(SMS_RECEIVERS) ? SMS_RECEIVERS : []).forEach(function (value) {
    var n = String(value).replace(/[\s-]/g, '');
    // 운영 설정에서 따옴표 없이 입력된 010 번호의 선행 0 소실만 복원.
    if (typeof value === 'number' && /^10\d{8}$/.test(n)) { n = '0' + n; restored++; }
    if (!/^01[016789]\d{7,8}$/.test(n)) { invalid++; return; }
    if (numbers.indexOf(n) < 0) numbers.push(n);
  });
  if (invalid || restored) leadLog('sms', 'recipient_check', { invalidCount: invalid, restoredCount: restored });
  if (!numbers.length) { leadLog('sms', 'skipped', { reason: 'no_valid_recipients' }); return; }

  var nameText = String(p.name || '이름없음');
  var typeText = String(p.type || '-');
  // 고객 원문은 시트/메일에 보존. SMS에서만 지원하지 않는 글자를 인코더의 '?'로 대체.
  var encoder = Utilities.newBlob('');
  var safeName = encoder.setDataFromString(nameText, 'EUC-KR').getDataAsString('EUC-KR');
  var safeType = encoder.setDataFromString(typeText, 'EUC-KR').getDataAsString('EUC-KR');
  if (safeName !== nameText || safeType !== typeText) leadLog('sms', 'body_normalized');
  var name = Array.from(safeName);
  var type = Array.from(safeType).slice(0, 10);
  var shortened = name.length > 60;
  name = name.slice(0, 60);
  function body() { return '[배방 상담신청]\n' + name.join('') + ' ' + (p.phone || '') + '\n타입: ' + type.join(''); }
  var msg = body();
  // NHN 기준은 EUC-KR. SMS 요금/유형 유지: 제목·전화번호를 보존하고 타입→이름만 축약.
  var encoded = Utilities.newBlob('').setDataFromString(msg, 'EUC-KR');
  while (encoded.getBytes().length > 90 && (type.length > 1 || name.length > 1)) {
    if (type.length > 1) type.pop(); else name.pop();
    shortened = true;
    msg = body();
    encoded.setDataFromString(msg, 'EUC-KR');
  }
  if (encoded.getBytes().length > 90) { leadLog('sms', 'rejected', { reason: 'sms_limit' }); return; }
  if (shortened) leadLog('sms', 'body_shortened');
  var channel = 'sms';
  var payload = { body: msg, sendNo: String(SMS_SEND_NO).replace(/[\s-]/g, ''),
    recipientList: numbers.map(function (n) { return { recipientNo: n }; }) };
  var url = 'https://sms.api.nhncloudservice.com/sms/v3.0/appKeys/' + SMS_APP_KEY + '/sender/sms';
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json;charset=UTF-8',
      headers: { 'X-Secret-Key': SMS_SECRET_KEY }, payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (err) {
    // 통신 예외 후 실제 접수 여부는 불명. 중복 발송을 피하려고 자동 재시도하지 않음.
    leadLog('sms', 'unknown', { reason: 'transport_exception', channel: channel });
    return;
  }
  var httpStatus = response.getResponseCode();
  var details = { channel: channel, httpStatus: httpStatus };
  var result;
  try { result = JSON.parse(response.getContentText()); } catch (err) {
    leadLog('sms', httpStatus >= 200 && httpStatus < 300 ? 'unknown' : 'rejected',
      { reason: 'invalid_response', channel: channel, httpStatus: httpStatus });
    return;
  }
  var header = result && result.header;
  if (header && typeof header.resultCode === 'number') details.resultCode = header.resultCode;
  if (httpStatus < 200 || httpStatus >= 300 || !header || header.isSuccessful !== true) {
    leadLog('sms', 'rejected', details);
    return;
  }
  var data = result.body && result.body.data;
  if (!data || !/^[A-Za-z0-9_-]{15,80}$/.test(data.requestId || '') ||
      !/^[123]$/.test(String(data.statusCode))) {
    leadLog('sms', 'unknown', { reason: 'incomplete_response', channel: channel, httpStatus: httpStatus });
    return;
  }
  details.requestId = data.requestId;
  details.requestStatus = String(data.statusCode);
  var list = Array.isArray(data.sendResultList) ? data.sendResultList : [];
  var accepted = 0;
  var rejected = 0;
  var codes = [];
  list.forEach(function (item) {
    if (item && typeof item.resultCode === 'number') {
      if (item.resultCode === 0) accepted++; else rejected++;
      if (codes.indexOf(item.resultCode) < 0) codes.push(item.resultCode);
    }
  });
  details.acceptedCount = accepted;
  details.rejectedCount = rejected;
  details.resultCodes = codes;
  var status = data.statusCode == 3 ? 'rejected' :
    rejected ? (accepted ? 'partial' : 'rejected') :
    data.statusCode == 2 && list.length === numbers.length && accepted === numbers.length ? 'accepted' : 'pending';
  leadLog('sms', status, details); // 요청 수락과 단말 도착은 다름. 수신 결과는 NHN 콘솔에서 확인.
}

/** 문자 설정 후 이 함수를 편집기에서 [실행]하면 테스트 문자가 갑니다 */
function testSms() {
  notifySms({ name: '테스트', phone: '010-0000-0000', type: '84C' });
}
