// 빌드: src/pages/*.html → 루트 *.html
//   <!--@include name-->            → src/partials/name.html 삽입
//   <!--@if KEY-->…<!--@endif-->    → site.config.json 의 KEY 값이 비어 있으면 블록 제거
//   {{TOKEN}}                       → site.config.json 값 치환 (파셜 안의 토큰도 치환)
// 실행: node build.mjs   (페이지별로 독립 처리, 하나가 실패해도 나머지는 빌드되고 종료코드 1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const partialDir = path.join(root, 'src', 'partials');
const pageDir = path.join(root, 'src', 'pages');

const partials = Object.fromEntries(
  fs.readdirSync(partialDir).filter(f => f.endsWith('.html'))
    .map(f => [f.replace(/\.html$/, ''), fs.readFileSync(path.join(partialDir, f), 'utf8').replace(/\r?\n$/, '')])
);

function render(src, name) {
  let html = src.replace(/<!--@include ([\w-]+)-->/g, (_, n) => {
    if (!(n in partials)) throw new Error(`파셜 없음: ${n}`);
    return partials[n];
  });
  html = html.replace(/<!--@if ([A-Z_]+)-->([\s\S]*?)<!--@endif-->/g, (_, k, body) => (cfg[k] ? body : ''));
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in cfg)) throw new Error(`토큰 없음: ${k}`);
    return cfg[k];
  });
  const leftover = html.match(/<!--@(include|if|endif)|\{\{[A-Z_]+\}\}|<(sc-if|sc-for|dc-import|x-dc|helmet)\b|style-hover=/);
  if (leftover) throw new Error(`치환되지 않은 마커/런타임 잔재: ${leftover[0]}`);
  return html;
}

let ok = 0, fail = 0;
const pages = fs.readdirSync(pageDir).filter(f => f.endsWith('.html'));
if (!pages.length) { console.error('src/pages 에 페이지가 없습니다'); process.exit(1); }
for (const f of pages) {
  try {
    const html = render(fs.readFileSync(path.join(pageDir, f), 'utf8'), f);
    fs.writeFileSync(path.join(root, f), html);
    console.log('built', f, html.length, 'bytes');
    ok++;
  } catch (e) {
    console.error('FAIL', f, '-', e.message);
    fail++;
  }
}
console.log(`done: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
