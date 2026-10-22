import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// tests/가 다른 드라이브의 junction이어도 실행한 저장소의 실제 소스를 검증.
const frontend = readFileSync(path.join(process.cwd(), 'site.js'), 'utf8');
const backend = readFileSync(path.join(process.cwd(), 'form-backend/Code.gs'), 'utf8');
const naverTracking = readFileSync(path.join(process.cwd(), 'naver-tracking.js'), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));

function browser({ search = '', storage = new Map(), receipt = 'saved', networkError = false, storageError = false, naver = false, naverThrows = false } = {}) {
  let now = Date.now();
  const events = {};
  const requests = [];
  const analytics = [];
  const customEvents = [];
  const documentListeners = {};
  const naverConversions = [];
  const done = { hidden: true };
  const error = { hidden: true, textContent: '' };
  const button = { disabled: false, textContent: '신청' };
  const anchor = { getAttribute: () => '#register', classList: { contains: () => false }, hasAttribute: () => false, addEventListener: (name, fn) => { events.anchor = fn; } };
  const form = {
    name: { value: '테스트' }, p1: { value: '010' }, p2: { value: '0000' }, p3: { value: '0000' },
    type: { value: '84A' }, company: { value: '' }, hidden: false,
    querySelectorAll: () => [],
    querySelector: selector => selector === '#agree' ? { checked: true } : button,
    addEventListener: (name, fn) => { events[name] = fn; },
    setAttribute() {}, removeAttribute() {}
  };
  const location = { search, pathname: '/sub.html', hash: '', href: 'https://example.test/sub.html' + search };
  const history = { replaceState: (...args) => { history.replaced = args[2]; } };
  const document = {
    currentScript: { getAttribute: name => name === 'data-account' ? 'mock-only' : 'xn--vh3bna170cnsee1wpd.com' },
    addEventListener: (name, handler) => { documentListeners[name] = handler; },
    querySelector: () => null,
    querySelectorAll: selector => selector === 'a[href^="#"]' ? [anchor] : [],
    getElementById: id => ({ rsForm: form, fmDone: done, fmError: error, register: { scrollIntoView() {} } }[id] || null),
    createElement: () => ({ remove() {} }),
    dispatchEvent: event => { customEvents.push(event); if (documentListeners[event.type]) documentListeners[event.type](event); },
    head: { appendChild: script => {
      const callback = new URL(script.src).searchParams.get('callback');
      setImmediate(() => {
        if (receipt === 'error') { now += 46000; script.onerror(); }
        else context[callback]({ status: receipt });
      });
    } }
  };
  const context = vm.createContext({
    document, location, history, URLSearchParams, Uint8Array, Array, Promise, AbortController,
    Date: { now: () => now }, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    crypto: webcrypto, gtag: (...args) => analytics.push(args),
    sessionStorage: {
      getItem: key => { if (storageError) throw Error('blocked'); return storage.get(key) || null; },
      setItem: (key, value) => { if (storageError) throw Error('blocked'); storage.set(key, value); }
    },
    fetch: (url, init) => { requests.push(init); return networkError ? Promise.reject(Error('offline')) : Promise.resolve({ type: 'opaque' }); },
    alert: message => { throw Error(message); }
  });
  context.window = context;
  if (naver) {
    context.wcs = { inflow() {}, trans(payload) { naverConversions.push(payload); if (naverThrows) throw Error('SDK blocked'); } };
    context.wcs_do = () => {};
    vm.runInContext(naverTracking, context);
  }
  vm.runInContext(frontend, context);
  const submit = () => events.submit({ preventDefault() {}, target: form });
  return { submit, requests, analytics, customEvents, naverConversions, done, error, button, form, events, history };
}

test('real form success triggers one Naver lead while SDK exceptions leave completion intact', async () => {
  const page = browser({ naver: true, naverThrows: true });
  page.submit(); page.submit();
  assert.equal(page.naverConversions.length, 0);
  await turn(); await turn();
  assert.equal(page.naverConversions.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(page.naverConversions[0])), { type: 'lead' });
  assert.equal(page.done.hidden, false);
  assert.equal(page.error.hidden, true);
  assert.equal(page.button.disabled, false);
});

test('real form receipt failure never triggers a Naver lead', async () => {
  const page = browser({ receipt: 'error', naver: true });
  page.submit();
  await turn(); await turn();
  assert.equal(page.naverConversions.length, 0);
  assert.equal(page.done.hidden, true);
  assert.equal(page.error.hidden, false);
});

test('campaign attribution survives page changes and anchor navigation without general query data', async () => {
  const storage = new Map();
  const first = browser({ search: '?utm_source=naver&utm_campaign=bb&NaPm=ad123&name=private', storage });
  first.events.anchor({ preventDefault() {} });
  assert.equal(first.history.replaced, '/sub.html?utm_source=naver&utm_campaign=bb&NaPm=ad123&name=private#register');
  const next = browser({ search: '?page=2', storage });
  next.submit();
  const body = new URLSearchParams(next.requests[0].body);
  assert.equal(body.get('utm'), '?utm_source=naver&utm_campaign=bb&NaPm=ad123');
  await turn(); await turn();
});

test('a new campaign replaces the previous campaign and blocked storage keeps current UTM', async () => {
  const storage = new Map();
  browser({ search: '?utm_source=old&utm_content=old', storage });
  const current = browser({ search: '?utm_source=naver', storage });
  current.submit();
  assert.equal(new URLSearchParams(current.requests[0].body).get('utm'), '?utm_source=naver');
  const blocked = browser({ search: '?utm_campaign=bb', storageError: true });
  blocked.submit();
  assert.equal(new URLSearchParams(blocked.requests[0].body).get('utm'), '?utm_campaign=bb');
  await turn(); await turn();
});

test('opaque POST never completes a lead before saved receipt; duplicate clicks are blocked', async () => {
  const page = browser();
  page.submit(); page.submit();
  assert.equal(page.requests.length, 1);
  assert.equal(page.done.hidden, true);
  assert.equal(page.analytics.length, 0);
  assert.equal(page.button.disabled, true);
  await turn(); await turn();
  assert.equal(page.done.hidden, false);
  assert.equal(page.analytics[0][1], 'generate_lead');
  assert.equal(page.customEvents[0].type, 'philhouse:lead-saved');
  assert.equal(page.button.disabled, false);
});

test('receipt failure keeps form visible, fires no conversion, and reuses receipt on retry', async () => {
  const page = browser({ receipt: 'error' });
  page.submit();
  const firstId = new URLSearchParams(page.requests[0].body).get('receipt_id');
  await turn(); await turn();
  assert.equal(page.form.hidden, false);
  assert.equal(page.done.hidden, true);
  assert.equal(page.error.hidden, false);
  assert.equal(page.analytics.length, 0);
  page.submit();
  assert.equal(new URLSearchParams(page.requests[1].body).get('receipt_id'), firstId);
  await turn(); await turn();
});

test('saved receipt can confirm a POST whose network response was lost', async () => {
  const page = browser({ networkError: true });
  page.submit();
  await turn(); await turn();
  assert.equal(page.done.hidden, false);
  assert.equal(page.analytics.length, 1);
});

function server({ failSave = false, failFlush = false } = {}) {
  const cache = new Map();
  const rows = [];
  const notices = [];
  let releases = 0;
  const output = text => ({ text, setMimeType(type) { this.type = type; return this; } });
  const sheet = { getLastRow: () => 1, appendRow: row => { if (failSave) throw Error('write failure'); rows.push(row); }, setFrozenRows() {} };
  const context = vm.createContext({
    ContentService: { createTextOutput: output, MimeType: { JSON: 'json', JAVASCRIPT: 'js' } },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { releases++; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }), flush: () => { if (failFlush) throw Error('flush failure'); } }
  });
  vm.runInContext(backend, context);
  context.notifyEmail = () => notices.push('email');
  context.notifySms = () => notices.push('sms');
  const id = '0123456789abcdef0123456789abcdef';
  const fields = { name: '테스트', phone: '010-0000-0000', type: '84A', receipt_id: id };
  return { context, rows, notices, cache, fields, id, releases: () => releases };
}

test('server marks success only after sheet save and suppresses repeat save and notification', () => {
  const s = server();
  s.context.doPost({ parameter: s.fields });
  s.context.doPost({ parameter: s.fields });
  assert.equal(s.rows.length, 1);
  assert.deepEqual(s.notices, ['email', 'sms']);
  assert.equal(s.releases(), 2);
  const status = s.context.doGet({ parameter: { action: 'status', receipt_id: s.id, callback: 'bbReceipt_' + s.id + '_1' } });
  assert.equal(status.type, 'js');
  assert.match(status.text, /"status":"saved"/);
  assert.doesNotMatch(status.text, /테스트|010-/);
});

for (const failure of ['failSave', 'failFlush']) {
  test(`${failure} does not confirm receipt or send notifications`, () => {
    const s = server({ [failure]: true });
    assert.throws(() => s.context.doPost({ parameter: s.fields }));
    assert.equal(s.cache.size, 0);
    assert.equal(s.notices.length, 0);
    assert.equal(s.releases(), 1);
  });
}

test('read-only health/status routes do not write or notify and reject executable callbacks', () => {
  const s = server();
  assert.equal(JSON.parse(s.context.doGet({ parameter: { action: 'health' } }).text).version, 'receipt-v1');
  assert.equal(s.context.doGet({ parameter: { action: 'status', receipt_id: s.id, callback: 'alert(1)//' } }).text, 'invalid');
  assert.equal(s.rows.length, 0);
  assert.equal(s.notices.length, 0);
  assert.equal(s.context.sheetText('=FORMULA()'), "'=FORMULA()");
});
