# 배방 필하우스 리버시티 — 분양 홈페이지

https://배방필하우스.com (GitHub Pages, `main` 브랜치 루트 = 배포. **push 가 곧 배포**)

## 구조

```
src/pages/      index.html · sub.html · why_asan.html   ← 편집은 여기서
src/partials/   head · header · form · footer           ← 공통 조각
site.config.json  전화번호·분양대행사·GA 측정 ID 등 토큰 값
build.mjs       src → 루트 *.html 생성 (node build.mjs)
site.css / site.js  공통 스타일·동작 (헤더·레일·하단바·관심고객등록 폼·GA 이벤트)
uploads/        이미지 전체
form-backend/   접수 백엔드(Apps Script) 원본 — 시크릿은 플레이스홀더
```

루트의 `index.html`, `sub.html`, `why_asan.html` 은 **빌드 산출물**이다. 직접 고치지 말고 `src/` 를 고친 뒤 `node build.mjs` 를 실행한다.

## 자주 하는 수정

| 할 일 | 고치는 곳 |
|---|---|
| 전화번호 변경 | `site.config.json` 의 `PHONE`, `PHONE_TEL` → `node build.mjs` |
| 분양대행사·대표·사업자번호 | `site.config.json` 의 `AGENCY*` |
| GA4 연결 | `site.config.json` 의 `GA_ID` 에 `G-XXXXXXXXXX` 입력 → 빌드. 비어 있으면 스크립트 자체가 안 들어감 |
| 접수 백엔드 URL | `site.js` 의 `FORM_ENDPOINT` |
| 카피·이미지 | `src/pages/*.html` (인라인 스타일 그대로 유지) |

## 관심고객등록 · 전화

- 폼(`src/partials/form.html`, `#register`)은 세 페이지 모두 푸터 위에 들어간다. 제출 → `site.js` 가 Apps Script 웹앱으로 POST(no-cors) → 구글시트 '접수' 탭 + 메일/SMS 알림.
- 전화: 헤더(PC)·모바일 메뉴·하단 고정바(≤1100px)·각 페이지 CTA 전부 `tel:` 링크. GA 가 연결돼 있으면 `click_call`, 폼 접수는 `generate_lead` 이벤트로 기록된다.

## 화면 분기 (release 원본과 동일)

1100px 초과 = PC 메뉴바·메가메뉴, 이하 = 햄버거 + 하단 고정 2버튼, 640px 이하 = 폰 레이아웃(헤더 60px·브랜드 축약).

## 배포

```
node build.mjs
git add -A && git commit -m "..."
git push origin main      # GitHub Pages 가 1~2분 내 반영
```
