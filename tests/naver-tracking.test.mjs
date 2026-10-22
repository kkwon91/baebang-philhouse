import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// tests/가 다른 드라이브의 junction이어도 실행한 저장소의 실제 소스를 검증.
const root = process.cwd();
const source = readFileSync(path.join(root, 'naver-tracking.js'), 'utf8');
const domain = 'xn--vh3bna170cnsee1wpd.com';

function tracker({ account = 'mock-only', loaded = false, throws = '' } = {}) {
  const listeners = [];
  const scripts = [];
  const calls = [];
  const context = vm.createContext({ document: {
    currentScript: { getAttribute: name => name === 'data-account' ? account : domain },
    addEventListener: (name, handler) => listeners.push({ name, handler }),
    createElement: () => ({}),
    head: { appendChild: script => { if (throws === 'append') throw Error('blocked'); scripts.push(script); } }
  } });
  context.window = context;
  function installSdk() {
    function record(name, payload) { calls.push({ name, payload }); if (throws === name) throw Error('sdk failure'); }
    context.wcs = { inflow: value => record('inflow', value), trans: value => record('trans', value) };
    context.wcs_do = () => record('pv');
  }
  if (loaded) installSdk();
  const run = () => vm.runInContext(source, context);
  run();
  return {
    context, calls, scripts, installSdk, run,
    emit: (name = 'philhouse:lead-saved', event = {}) => listeners.filter(l => l.name === name).forEach(l => l.handler(event))
  };
}

test('blank account does not load the SDK or register tracking', () => {
  const t = tracker({ account: '  ' });
  t.emit();
  assert.equal(t.scripts.length, 0);
  assert.equal(t.context.wcs_add, undefined);
  assert.equal(t.calls.length, 0);
});

test('page view alone, submit attempt and phone click never send a lead', () => {
  const t = tracker({ loaded: true });
  t.emit('submit'); t.emit('click_call'); t.emit('philhouse:lead-failed');
  assert.deepEqual(t.calls.map(c => c.name), ['inflow', 'pv']);
  assert.equal(t.calls[0].payload, domain);
  assert.equal(t.context.wcs_add.wa, 'mock-only');
});

test('delayed SDK sends exactly one pending lead after one PV, ignoring duplicate events/loads', () => {
  const t = tracker();
  assert.equal(t.scripts[0].src, 'https://wcs.naver.net/wcslog.js');
  assert.equal(t.scripts[0].async, true);
  t.emit(); t.emit();
  assert.equal(t.calls.length, 0);
  t.installSdk();
  t.scripts[0].onload(); t.scripts[0].onload(); t.emit(); t.run(); t.emit();
  assert.equal(t.scripts.length, 1);
  assert.deepEqual(t.calls.map(c => c.name), ['inflow', 'pv', 'trans']);
});

test('lead payload contains type only and never reads customer event detail', () => {
  const t = tracker({ loaded: true });
  t.emit('philhouse:lead-saved', { get detail() { throw Error('customer fields must not be read'); } });
  assert.deepEqual(JSON.parse(JSON.stringify(t.calls.find(c => c.name === 'trans').payload)), { type: 'lead' });
});

test('blocked library has no conversion or retry and does not throw into the caller', () => {
  const t = tracker();
  assert.doesNotThrow(() => { t.scripts[0].onerror(); t.emit(); t.emit(); });
  assert.equal(t.calls.length, 0);
  assert.equal(t.scripts.length, 1);
});

for (const failure of ['append', 'inflow', 'pv', 'trans']) {
  test(`SDK ${failure} exception is contained without retry`, () => {
    const t = tracker({ loaded: failure !== 'append', throws: failure });
    assert.doesNotThrow(() => { t.emit(); t.emit(); t.run(); });
    assert.ok(t.calls.filter(c => c.name === failure).length <= 1);
    if (failure !== 'trans') assert.equal(t.calls.filter(c => c.name === 'trans').length, 0);
  });
}

test('real build enables tracking on all three pages only when a key exists', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'baebang-naver-test-'));
  try {
    for (const dir of ['pages', 'partials']) {
      mkdirSync(path.join(temp, 'src', dir), { recursive: true });
      for (const file of readdirSync(path.join(root, 'src', dir)).filter(name => name.endsWith('.html'))) {
        writeFileSync(path.join(temp, 'src', dir, file), readFileSync(path.join(root, 'src', dir, file)));
      }
    }
    writeFileSync(path.join(temp, 'build.mjs'), readFileSync(path.join(root, 'build.mjs')));
    const config = JSON.parse(readFileSync(path.join(root, 'site.config.json'), 'utf8'));
    for (const account of ['', 'mock-only']) {
      writeFileSync(path.join(temp, 'site.config.json'), JSON.stringify({ ...config, NAVER_WA: account }));
      const build = spawnSync(process.execPath, [path.join(temp, 'build.mjs')], { encoding: 'utf8' });
      assert.equal(build.status, 0, build.stderr);
      for (const page of ['index.html', 'sub.html', 'why_asan.html']) {
        const html = readFileSync(path.join(temp, page), 'utf8');
        const tags = html.match(/<script[^>]+src="naver-tracking\.js"[^>]*><\/script>/g) || [];
        assert.equal(tags.length, account ? 1 : 0, page);
        assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|<!--@(include|if|endif)/);
        if (account) {
          assert.match(tags[0], /\bdefer\b/);
          assert.match(tags[0], /data-account="mock-only"/);
          assert.ok(tags[0].includes('data-domain="' + domain + '"'));
          assert.ok(html.indexOf(tags[0]) < html.indexOf('<script src="site.js"'), page);
        }
      }
    }
  } finally {
    // 재귀 삭제는 이 테스트가 만든 임시 폴더로 제한.
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(tmpdir()));
    assert.ok(path.basename(temp).startsWith('baebang-naver-test-'));
    rmSync(temp, { recursive: true, force: true });
  }
});
