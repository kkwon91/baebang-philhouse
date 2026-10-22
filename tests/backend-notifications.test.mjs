import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(path.join(process.cwd(), 'form-backend/Code.gs'), 'utf8');
const requestId = '20261022013600MockRequest';
const receiptId = 'abcdef0123456789abcdef0123456789';
const fields = { name: '비공개이름', phone: '010-1234-5678', type: '84A', utm: 'private-campaign', page: 'private-page', receipt_id: receiptId };
const success = () => ({ header: { isSuccessful: true, resultCode: 0 }, body: { data: {
  requestId, statusCode: '2', sendResultList: [{ recipientNo: '01011112222', resultCode: 0, recipientSeq: 1 }]
} } });

// Apps Script services are replaced in full: no network or real Google writes.
function server({ reply = success(), httpStatus = 200, fetchThrows = false, emailThrows = false,
  saveThrows = false, cacheThrows = false, logThrows = false } = {}) {
  const rows = [], requests = [], emails = [], logs = [], opened = [];
  const cache = new Map();
  const output = text => ({ text, setMimeType() { return this; } });
  const context = vm.createContext({
    console: { log(value) { if (logThrows) throw Error('logger unavailable'); logs.push(JSON.parse(value)); } },
    ContentService: { createTextOutput: output, MimeType: { JSON: 'json', JAVASCRIPT: 'js' } },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put(key, value) { if (cacheThrows) throw Error('private-cache-error'); cache.set(key, value); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById(id) { opened.push(id); return { getSheetByName: () => ({
      getLastRow: () => 1, appendRow(row) { if (saveThrows) throw Error('private-sheet-error'); rows.push(row); }
    }) }; }, flush() {} },
    MailApp: { sendEmail(...args) { emails.push(args); if (emailThrows) throw Error('secret-key private-name private-phone'); } },
    Utilities: { newBlob() {
      let text = '';
      // Service mock for ASCII/Korean fixtures: EUC-KR uses 1/2 bytes; emoji is unrepresentable.
      return { setDataFromString(value, charset) { assert.equal(charset, 'EUC-KR'); text = value.replace(/\p{Extended_Pictographic}/gu, '?'); return this; },
        getDataAsString(charset) { assert.equal(charset, 'EUC-KR'); return text; },
        getBytes() { return new Array([...text].reduce((sum, c) => sum + (c.charCodeAt(0) < 128 ? 1 : 2), 0)).fill(0); } };
    } },
    UrlFetchApp: { fetch(url, options) {
      requests.push({ url, options, payload: JSON.parse(options.payload) });
      if (fetchThrows) throw Error('secret-key private-phone ' + url);
      return { getResponseCode: () => httpStatus, getContentText: () => typeof reply === 'string' ? reply : JSON.stringify(reply) };
    } }
  });
  vm.runInContext(source, context);
  context.LEAD_SPREADSHEET_ID = 'mock-spreadsheet-id';
  context.SMS_APP_KEY = 'mock-app-key'; context.SMS_SECRET_KEY = 'mock-secret-key';
  context.SMS_SEND_NO = '1666-4979'; context.SMS_RECEIVERS = ['01011112222'];
  const submit = () => context.doPost({ parameter: fields });
  return { context, submit, rows, requests, emails, logs, opened, cache };
}

test('explicit sheet save plus validated SMS acceptance; duplicate receipts do not resend', () => {
  const s = server();
  assert.equal(s.submit().text, 'ok'); assert.equal(s.submit().text, 'ok');
  assert.deepEqual(s.opened, ['mock-spreadsheet-id']);
  assert.equal(s.rows.length, 1); assert.equal(s.emails.length, 1); assert.equal(s.requests.length, 1);
  assert.match(s.requests[0].url, /^https:\/\/sms\.api\.nhncloudservice\.com\/sms\/v3\.0\/appKeys\/mock-app-key\/sender\/sms$/);
  assert.equal(s.requests[0].payload.sendNo, '16664979');
  assert.equal(s.requests[0].options.headers['X-Secret-Key'], 'mock-secret-key');
  assert.equal(s.logs.find(x => x.status === 'accepted').details.requestId, requestId);
  assert.equal(s.logs.find(x => x.status === 'accepted').details.acceptedCount, 1);
  assert.equal(s.cache.get('receipt:' + receiptId), 'saved');
});

for (const [label, options, status] of [
  ['HTTP rejection', { httpStatus: 401, reply: { header: { isSuccessful: false, resultCode: -1000, resultMessage: 'private-phone mock-secret-key' } } }, 'rejected'],
  ['API rejection in HTTP 200', { reply: { header: { isSuccessful: false, resultCode: -2019, resultMessage: 'private-phone' } } }, 'rejected'],
  ['malformed response', { reply: '<html>private-phone</html>' }, 'unknown'],
  ['transport exception', { fetchThrows: true }, 'unknown'],
  ['missing result structure', { reply: { header: { isSuccessful: true, resultCode: 0 } } }, 'unknown']
]) {
  test(`${label} is logged but saved lead remains successful and retries do not resend`, () => {
    const s = server(options);
    assert.equal(s.submit().text, 'ok'); assert.equal(s.submit().text, 'ok');
    assert.equal(s.rows.length, 1); assert.equal(s.requests.length, 1);
    assert.equal(s.cache.get('receipt:' + receiptId), 'saved');
    assert.ok(s.logs.some(x => x.stage === 'sms' && x.status === status));
    assert.doesNotMatch(JSON.stringify(s.logs), /private-phone|mock-secret-key|비공개이름|010-1234-5678|private-campaign|private-page/);
  });
}

test('mixed recipient results are partial, not complete acceptance', () => {
  const reply = success();
  reply.body.data.sendResultList.push({ recipientNo: '01033334444', resultCode: -2019, resultMessage: 'private-phone', recipientSeq: 2 });
  const s = server({ reply }); s.context.SMS_RECEIVERS.push('01033334444'); s.submit();
  const log = s.logs.find(x => x.status === 'partial');
  assert.equal(log.details.acceptedCount, 1); assert.equal(log.details.rejectedCount, 1);
  assert.deepEqual(log.details.resultCodes, [0, -2019]);
  assert.doesNotMatch(JSON.stringify(s.logs), /01033334444|private-phone/);
});

for (const [requestStatus, expected] of [['1', 'pending'], ['3', 'rejected']]) {
  test(`NHN request status ${requestStatus} is ${expected} even with a successful recipient result`, () => {
    const reply = success(); reply.body.data.statusCode = requestStatus;
    const s = server({ reply }); s.submit();
    assert.equal(s.logs.filter(x => x.stage === 'sms').at(-1).status, expected);
  });
}

test('missing per-recipient outcomes remain pending', () => {
  const reply = success(); delete reply.body.data.sendResultList[0].resultCode;
  const s = server({ reply }); s.submit();
  assert.equal(s.logs.filter(x => x.stage === 'sms').at(-1).status, 'pending');
});

test('numeric leading-zero loss is restored narrowly; invalid and duplicate receivers are removed', () => {
  const s = server();
  s.context.SMS_RECEIVERS = ['010-1111-2222', 1011112222, 'bad01011112222', '999', 1234];
  s.submit();
  assert.deepEqual(s.requests[0].payload.recipientList, [{ recipientNo: '01011112222' }]);
  const log = s.logs.find(x => x.status === 'recipient_check');
  assert.deepEqual(log.details, { invalidCount: 3, restoredCount: 1 });
});

test('no valid receivers and missing configuration are visible without outgoing requests', () => {
  const invalid = server(); invalid.context.SMS_RECEIVERS = ['bad']; invalid.submit();
  assert.equal(invalid.requests.length, 0);
  assert.ok(invalid.logs.some(x => x.details.reason === 'no_valid_recipients'));
  const empty = server(); empty.context.SMS_APP_KEY = ''; empty.submit();
  assert.equal(empty.requests.length, 0);
  assert.ok(empty.logs.some(x => x.details.reason === 'not_configured'));
});

test('SMS 90-byte boundary and long Korean names preserve title and phone without using LMS', () => {
  for (const name of ['A'.repeat(52), 'A'.repeat(53), '가'.repeat(60)]) {
    const s = server(); s.context.notifySms({ ...fields, name, type: '-' });
    const sent = s.requests[0];
    const bytes = [...sent.payload.body].reduce((sum, c) => sum + (c.charCodeAt(0) < 128 ? 1 : 2), 0);
    assert.equal(bytes, 90);
    assert.ok(sent.payload.body.startsWith('[배방 상담신청]\n'));
    assert.ok(sent.payload.body.includes(fields.phone));
    assert.ok(sent.url.endsWith('/sender/sms')); assert.equal(sent.payload.title, undefined);
    assert.equal(s.logs.some(x => x.status === 'body_shortened'), name !== 'A'.repeat(52));
  }
});

test('unsupported SMS characters are normalized while the original lead and phone are preserved', () => {
  const s = server(); s.context.doPost({ parameter: { ...fields, name: '이름😀' } });
  assert.equal(s.rows.length, 1); assert.equal(s.rows[0][1], '이름😀'); assert.equal(s.requests.length, 1);
  assert.ok(s.requests[0].payload.body.includes('이름?'));
  assert.ok(s.requests[0].payload.body.includes(fields.phone));
  assert.ok(s.logs.some(x => x.status === 'body_normalized'));
});

test('email failure and logging failure do not suppress SMS or invalidate saved receipts', () => {
  const email = server({ emailThrows: true }); assert.equal(email.submit().text, 'ok');
  assert.equal(email.requests.length, 1); assert.ok(email.logs.some(x => x.stage === 'email' && x.status === 'failed'));
  assert.doesNotMatch(JSON.stringify(email.logs), /secret-key|private-name|private-phone/);
  const logging = server({ logThrows: true }); assert.equal(logging.submit().text, 'ok');
  assert.equal(logging.requests.length, 1); assert.equal(logging.cache.get('receipt:' + receiptId), 'saved');
});

test('save errors stop notifications but receipt-cache errors do not suppress saved-lead notifications', () => {
  const save = server({ saveThrows: true }); assert.throws(save.submit, /Lead save failed at sheet/);
  assert.equal(save.rows.length, 0); assert.equal(save.requests.length, 0); assert.equal(save.emails.length, 0);
  const receipt = server({ cacheThrows: true }); assert.equal(receipt.submit().text, 'ok');
  assert.equal(receipt.rows.length, 1); assert.equal(receipt.requests.length, 1); assert.equal(receipt.emails.length, 1);
  assert.equal(receipt.cache.size, 0);
  assert.ok(receipt.logs.some(x => x.status === 'saved'));
  assert.ok(receipt.logs.some(x => x.stage === 'receipt' && x.details.reason === 'cache_exception'));
  assert.doesNotMatch(JSON.stringify([...save.logs, ...receipt.logs]), /private-sheet-error|private-cache-error/);
});
