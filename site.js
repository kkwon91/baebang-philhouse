/* 배방 필하우스 리버시티 — 공통 동작 (헤더·레일·하단바·관심고객등록 폼) */
(function () {
  'use strict';

  // ── 접수 백엔드 (Google Apps Script 웹앱, form-backend/Code.gs) ──
  // form-backend/Code.gs의 receipt-v1 응답을 먼저 배포한 뒤 이 파일을 배포.
  var FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwtxhaKuMTVl3yebA5c5BHZg6QqDewPAqL1u1b25iOeiA9cYcK2kRiuajW3eC3TwdUX/exec';

  // 광고 페이지에서 다른 페이지로 이동해도 같은 탭의 유입 정보를 접수까지 보존.
  // 새 광고 링크를 열면 그 캠페인으로 교체하며 일반 검색 파라미터는 저장하지 않음.
  var attributionKey = 'baebang-philhouse:attribution:v1';
  var attributionParams = new URLSearchParams();
  new URLSearchParams(location.search).forEach(function (value, key) {
    if (/^(utm_(source|medium|campaign|term|content|id)|NaPm)$/i.test(key)) {
      attributionParams.append(key, value);
    }
  });
  var adAttribution = attributionParams.toString();
  if (adAttribution) adAttribution = '?' + adAttribution;
  try {
    if (adAttribution) sessionStorage.setItem(attributionKey, adAttribution);
    else adAttribution = sessionStorage.getItem(attributionKey) || '';
  } catch (e) {} // 저장소 접근이 제한돼도 현재 페이지의 유입 정보와 접수는 유지.

  function makeReceiptId() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // no-cors POST 자체로는 저장 성공 여부를 알 수 없으므로 읽기 전용 상태만 조회.
  // 상태 응답에는 성명·연락처·UTM 등 개인정보를 포함하지 않음.
  function waitForReceipt(receiptId) {
    var deadline = Date.now() + 45000;
    var attempt = 0;
    return new Promise(function (resolve, reject) {
      function check() {
        var callback = 'bbReceipt_' + receiptId + '_' + (++attempt);
        var script = document.createElement('script');
        var settled = false;
        var timer;
        function finish(saved) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          script.remove();
          delete window[callback];
          if (saved) { resolve(); return; }
          if (Date.now() >= deadline) { reject(new Error('receipt-unconfirmed')); return; }
          setTimeout(check, 1500);
        }
        window[callback] = function (result) { finish(result && result.status === 'saved'); };
        script.onerror = function () { finish(false); };
        script.src = FORM_ENDPOINT + '?action=status&receipt_id=' + encodeURIComponent(receiptId) + '&callback=' + callback;
        timer = setTimeout(function () { finish(false); }, Math.min(10000, Math.max(1, deadline - Date.now())));
        document.head.appendChild(script);
      }
      check();
    });
  }

  // ── GA4 이벤트 (측정 ID 가 site.config.json GA_ID 에 있을 때만 gtag 존재) ──
  function track(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () {
      var where = a.closest('[data-track]');
      track('click_call', { phone: a.getAttribute('href').slice(4), placement: where ? where.getAttribute('data-track') : (a.className || 'inline'), page_path: location.pathname + location.hash });
    });
  });

  var header = document.querySelector('.sh');
  var mobile = document.getElementById('mobileMenu');
  var isDesktop = function () { return window.innerWidth > 1100; };

  // 헤더 메가메뉴 (데스크톱 hover)
  if (header) {
    header.querySelectorAll('.sh-nav > a').forEach(function (a) {
      a.addEventListener('mouseenter', function () { if (isDesktop()) header.classList.add('mega-open'); });
    });
    header.addEventListener('mouseleave', function () { header.classList.remove('mega-open'); });
    window.addEventListener('resize', function () { if (!isDesktop()) header.classList.remove('mega-open'); });
  }

  // 모바일 전체화면 메뉴
  function setMobile(open) {
    if (!mobile) return;
    mobile.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    document.querySelectorAll('.sh-burger').forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  }
  document.querySelectorAll('.sh-burger').forEach(function (b) {
    b.addEventListener('click', function () { setMobile(mobile && mobile.hidden); });
  });
  if (mobile) {
    mobile.querySelectorAll('a, button[data-close-menu]').forEach(function (el) {
      el.addEventListener('click', function () { setMobile(false); });
    });
  }

  // 상단으로
  document.querySelectorAll('.totop').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  });

  // 닫기 버튼(상단 스트립 등): data-close="#id"
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = document.querySelector(b.getAttribute('data-close'));
      if (t) t.remove();
    });
  });

  // 같은 페이지 앵커: 모바일 브라우저 호환 스크롤
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    var id = a.getAttribute('href').slice(1);
    if (!id || a.classList.contains('totop') || a.hasAttribute('data-noscroll')) return;
    a.addEventListener('click', function (ev) {
      var t = document.getElementById(id);
      if (t) { ev.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#' + id); }
    });
  });

  // ── 관심고객등록 폼 ──
  var form = document.getElementById('rsForm');
  if (form) {
    var submitting = false;
    var lastSubmission = null;
    var tels = form.querySelectorAll('.telrow input');
    tels.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/\D/g, '');
        if (inp.value.length >= inp.maxLength && i < tels.length - 1) tels[i + 1].focus();
      });
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (submitting) return;
      var f = ev.target;
      var done = function () { f.hidden = true; var d = document.getElementById('fmDone'); if (d) d.hidden = false; };
      if (f.company && f.company.value) { done(); return; } // 스팸봇 차단(숨김 필드)
      if (!f.name.value.trim()) { alert('성함을 입력해 주세요.'); f.name.focus(); return; }
      var phone = f.p1.value + '-' + f.p2.value + '-' + f.p3.value;
      if (!/^01[016789]-\d{3,4}-\d{4}$/.test(phone)) { alert('연락처를 정확히 입력해 주세요.'); f.p1.focus(); return; }
      var agree = form.querySelector('#agree');
      if (agree && !agree.checked) { alert('개인정보 수집·이용에 동의해 주세요.'); return; }

      var button = f.querySelector('button[type="submit"]');
      var error = document.getElementById('fmError');
      if (error) error.hidden = true;
      if (!FORM_ENDPOINT) {
        if (error) { error.textContent = '온라인 신청을 사용할 수 없습니다. 전화로 문의해 주세요.'; error.hidden = false; }
        return;
      }
      var fields = {
          name: f.name.value.trim(),
          phone: phone,
          type: f.type ? (f.type.value || '') : '',
          utm: adAttribution,          // 페이지 이동 전 광고 유입경로(UTM) 보존
          page: location.href
      };
      // 응답 확인 실패 후 같은 내용으로 다시 누르면 같은 ID를 사용해 중복 접수를 줄임.
      var fingerprint = JSON.stringify(fields);
      if (!lastSubmission || lastSubmission.fingerprint !== fingerprint) {
        lastSubmission = { fingerprint: fingerprint, id: makeReceiptId() };
      }
      fields.receipt_id = lastSubmission.id;
      var body = new URLSearchParams(fields);
      submitting = true;
      var originalLabel = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = '접수를 확인하고 있습니다…'; }
      f.setAttribute('aria-busy', 'true');
      // 네트워크 오류여도 서버에 저장됐을 수 있으므로 상태를 확인한다.
      var controller = new AbortController();
      var postTimer = setTimeout(function () { controller.abort(); }, 20000);
      fetch(FORM_ENDPOINT, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(), signal: controller.signal
      }).catch(function () {}).then(function () {
        clearTimeout(postTimer);
        return waitForReceipt(fields.receipt_id);
      }).then(function () {
        var detail = { type: fields.type, page_path: location.pathname + location.hash };
        track('generate_lead', detail);
        document.dispatchEvent(new CustomEvent('philhouse:lead-saved', { detail: detail }));
        done();
      }).catch(function () {
        if (error) {
          error.textContent = '접수 완료 여부를 확인하지 못했습니다. 잠시 후 다시 시도하거나 전화로 확인해 주세요.';
          error.hidden = false;
        }
      }).finally(function () {
        submitting = false;
        f.removeAttribute('aria-busy');
        if (button) { button.disabled = false; button.textContent = originalLabel; }
      });
    });
  }
})();
