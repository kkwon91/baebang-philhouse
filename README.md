# 배방 필하우스 리버시티 — 분양 홈페이지

https://배방필하우스.com (GitHub Pages, `main` 브랜치 루트 = 배포. **push 가 곧 배포**)

## 구조

```
src/pages/      index.html · sub.html · why_asan.html   ← 편집은 여기서
src/partials/   head · header · form · footer           ← 공통 조각
site.config.json  전화번호·분양대행사·GA 측정 ID 등 토큰 값
build.mjs       src → 루트 *.html 생성 (node build.mjs)
site.css / site.js  공통 스타일·동작 (헤더·레일·하단바·관심고객등록 폼·GA 이벤트)
naver-tracking.js  네이버 공통 PV 및 저장 확인 후 신청완료 전환 (공통키 설정 시 활성)
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
| 네이버 전환 추적 연결 | `site.config.json` 의 `NAVER_WA` 에 해당 사이트의 실제 네이버 공통키 입력 → 빌드. 공란이면 비활성 |
| 접수 백엔드 URL | `site.js` 의 `FORM_ENDPOINT` |
| 카피·이미지 | `src/pages/*.html` (인라인 스타일 그대로 유지) |

## 관심고객등록 · 전화

- 폼(`src/partials/form.html`, `#register`)은 세 페이지 모두 푸터 위에 들어간다. 제출 → `site.js` 가 Apps Script 웹앱으로 POST(no-cors) → 구글시트 '접수' 탭 + 메일/SMS 알림. 서버의 읽기 전용 상태 응답으로 저장을 확인한 뒤에만 완료 화면을 표시한다.
- 전화: 헤더(PC)·모바일 메뉴·하단 고정바(≤1100px)·각 페이지 CTA 전부 `tel:` 링크. GA 가 연결돼 있으면 `click_call`, 저장이 확인된 폼 접수는 `generate_lead` 이벤트로 기록된다. 동일 시점에 `philhouse:lead-saved` DOM 이벤트도 발행한다. 전화 클릭은 실제 상담 연결을 뜻하지 않는다.
- 광고 유입: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `NaPm`을 탭의 `sessionStorage`에 보존해 다른 페이지에서 신청해도 기록한다. 새 광고 링크 유입 시 새 값으로 교체하며, 일반 쿼리 파라미터는 저장하지 않는다. 저장소 접근이 차단된 환경에서는 현재 페이지의 값만 사용할 수 있다.
- 성공 응답에는 난수 접수 ID에 대한 저장 여부만 포함한다. 이름·전화번호 등은 GET URL/응답에 넣지 않는다. 응답이 없으면 완료 전환을 보내지 않고 확인 실패 안내와 재시도 버튼을 표시한다. 같은 내용의 재시도는 같은 ID를 사용하며 서버 캐시가 유지되는 동안 중복 저장·알림을 방지한다(최대 6시간, 캐시 조기 만료 가능).
- 네이버 전환 태그는 계정에서 발급받은 해당 사이트의 실제 공통키를 `NAVER_WA`에 설정해야 작동한다. 해당 사이트의 공식 설치 안내에서 확인한 공통키를 설정했으며, 공란으로 바꾼 뒤 빌드하면 비활성화된다.

## 네이버 전환 추적

- `NAVER_WA`가 있을 때 공통 head에서 `naver-tracking.js`를 `site.js`보다 먼저 실행한다. 세 페이지 모두 `window.wcs_add.wa` 설정, `wcs.inflow('xn--vh3bna170cnsee1wpd.com')`, 페이지당 `wcs_do()` 1회 순서로 초기화한다.
- `wcslog.js`를 비동기로 불러오며, 로딩 중 발생한 `philhouse:lead-saved`는 기다렸다가 `wcs.trans({ type: 'lead' })`로 페이지당 1회만 전송한다. 전화 클릭·제출 클릭·저장 확인 실패는 신청완료 전환으로 보내지 않는다.
- 전환 payload에는 `type`만 넣는다. 성명·연락처·UTM·관심타입·접수 ID·이벤트 detail을 전달하지 않는다. 네이버 공통 PV 스크립트 자체는 공식 규격에 따라 현재 페이지 URL/referrer 등을 수집한다.
- 광고 차단이나 네이버 스크립트 오류가 있어도 상담 완료 UI는 유지한다. 이 경우 전환 수집은 누락될 수 있으며 임의 재전송은 하지 않는다. 페이지를 떠나기 전에 SDK가 로드되지 않으면 해당 페이지의 대기 전환은 유지되지 않는다.
- 기존 `cnv` 방식이나 별도의 네이버 태그를 중복 설치하지 않는다. 실제 공통키가 확정되기 전에는 비활성 상태를 유지하고, 테스트는 `node --test tests/*.test.mjs`의 네트워크 없는 모의 검증으로 진행한다. 운영 사이트에서 시험 접수/전환 요청을 보내지 않는다.
- 공식 규격: [네이버 전환 추적 가이드](https://naver.github.io/conversion-tracking/pages/01_script_guide_wcstrans/), [신청완료·PV 설치 가이드](https://navercts.gitbook.io/guide/script_guide).

## 접수 확인 기능 배포 순서

1. Apps Script의 기존 메일·SMS·발신번호 설정을 보존하고 `form-backend/Code.gs`의 접수/상태 함수를 반영한다. 로컬 SMS 설정은 플레이스홀더이므로 운영 설정을 덮어쓰지 않는다.
2. Apps Script에서 **배포 관리 → 수정 → 새 버전**으로 기존 URL을 유지해 배포한다. 기존 POST 방식과 호환되므로 홈페이지보다 먼저 적용한다.
3. 기존 웹앱 URL에 `?action=health`를 붙여 `{"version":"receipt-v1","status":"ready"}`를 확인한다. 이 요청은 접수·알림을 생성하지 않는다.
4. `node --test tests/lead-flow.test.mjs`와 `node build.mjs`를 실행한 뒤 홈페이지 변경을 검토·배포한다.
5. 실제 브라우저의 저장 확인은 허가된 테스트 접수와 운영 시트 확인으로 별도 검증한다. 로컬 모의 테스트는 운영 배포·실접수 성공을 증명하지 않는다.

Apps Script 프로젝트 이름·편집 URL·연결 시트 ID는 저장소에 없다. 프로젝트 소유자 계정으로 기존 배포를 찾아야 한다.

## 화면 분기 (release 원본과 동일)

1100px 초과 = PC 메뉴바·메가메뉴, 이하 = 햄버거 + 하단 고정 2버튼, 640px 이하 = 폰 레이아웃(헤더 60px·브랜드 축약).

## 배포

```
node build.mjs
git add -A && git commit -m "..."
git push origin main      # GitHub Pages 가 1~2분 내 반영
```
