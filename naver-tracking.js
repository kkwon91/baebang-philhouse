/* 네이버 전환 추적: 저장이 확인된 상담 신청만 lead로 전송. */
(function () {
  'use strict';

  var script = document.currentScript;
  var account = script && (script.getAttribute('data-account') || '').trim();
  var domain = script && (script.getAttribute('data-domain') || '').trim();
  if (!account || !domain || window.__philhouseNaverTracking) return;
  window.__philhouseNaverTracking = true;

  var pendingLead = false;
  var leadAttempted = false;
  var initialized = false;
  var ready = false;

  function sendLead() {
    if (!ready || !pendingLead || leadAttempted) return;
    // 호출 중 예외나 이벤트 중복이 생겨도 같은 페이지에서 재전송하지 않음.
    leadAttempted = true;
    try { window.wcs.trans({ type: 'lead' }); } catch (e) {}
  }

  // SDK를 기다리는 동안에도 저장 성공을 기억. 이벤트 detail/폼 값은 읽지 않음.
  document.addEventListener('philhouse:lead-saved', function () {
    pendingLead = true;
    sendLead();
  }, { once: true });

  function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      if (!window.wcs || typeof window.wcs.inflow !== 'function' ||
          typeof window.wcs.trans !== 'function' || typeof window.wcs_do !== 'function') return;
      window.wcs.inflow(domain);
      window.wcs_do();
      ready = true;
      sendLead();
    } catch (e) {} // 분석 서비스 장애가 상담 완료 화면에 영향을 주지 않도록 격리.
  }

  try {
    window.wcs_add = window.wcs_add || {};
    window.wcs_add.wa = account;
    if (window.wcs && typeof window.wcs_do === 'function') {
      initialize();
    } else {
      var library = document.createElement('script');
      library.src = 'https://wcs.naver.net/wcslog.js';
      library.async = true;
      library.onload = initialize;
      library.onerror = function () {}; // 차단 시 폼은 그대로 사용 가능, 전환 재시도 없음.
      document.head.appendChild(library);
    }
  } catch (e) {}
})();
