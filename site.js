/* 배방 필하우스 리버시티 — 공통 동작 (헤더·레일·하단바·관심고객등록 폼) */
(function () {
  'use strict';

  // ── 접수 백엔드 (Google Apps Script 웹앱, form-backend/Code.gs) ──
  // 비어 있으면 접수 완료 화면만 표시되고 저장은 되지 않음. 반드시 연동 후 오픈.
  var FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwtxhaKuMTVl3yebA5c5BHZg6QqDewPAqL1u1b25iOeiA9cYcK2kRiuajW3eC3TwdUX/exec';

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
      if (t) { ev.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (history.replaceState) history.replaceState(null, '', '#' + id); }
    });
  });

  // ── 관심고객등록 폼 ──
  var form = document.getElementById('rsForm');
  if (form) {
    var tels = form.querySelectorAll('.telrow input');
    tels.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/\D/g, '');
        if (inp.value.length >= inp.maxLength && i < tels.length - 1) tels[i + 1].focus();
      });
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var done = function () { f.hidden = true; var d = document.getElementById('fmDone'); if (d) d.hidden = false; };
      if (f.company && f.company.value) { done(); return; } // 스팸봇 차단(숨김 필드)
      if (!f.name.value.trim()) { alert('성함을 입력해 주세요.'); f.name.focus(); return; }
      var phone = f.p1.value + '-' + f.p2.value + '-' + f.p3.value;
      if (!/^01[016789]-\d{3,4}-\d{4}$/.test(phone)) { alert('연락처를 정확히 입력해 주세요.'); f.p1.focus(); return; }
      var agree = form.querySelector('#agree');
      if (agree && !agree.checked) { alert('개인정보 수집·이용에 동의해 주세요.'); return; }

      if (FORM_ENDPOINT) {
        var body = new URLSearchParams({
          name: f.name.value.trim(),
          phone: phone,
          type: f.type ? (f.type.value || '') : '',
          utm: location.search || '',   // 광고 유입경로(UTM) 자동 기록
          page: location.href
        });
        fetch(FORM_ENDPOINT, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        }).catch(function () {});
      }
      track('generate_lead', { type: f.type ? (f.type.value || '') : '', page_path: location.pathname + location.hash });
      done();
    });
  }
})();
