(function (root) {
  'use strict';
  const threshold = 5.5;
  const title = '높은 자기평가에 대한 추가 확인';
  const message = '원점수 5.5점 이상인 영역에서는 선수의 과도한 자기신념이나 실제 수행보다 긍정적으로 응답했을 가능성을 함께 확인해야 합니다. 점수만으로 단정하지 않고, 실수 인정·피드백 수용·경기와 훈련의 실제 행동을 코치 및 보호자 관찰과 함께 살펴보세요.';
  const basis = '5.5점은 MPS의 코칭상 추가 확인 기준이며, 과도한 자기신념을 판정하는 검증된 절단점은 아닙니다.';
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function highScores(entries) {
    return entries.filter(item => typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= threshold && item.score <= 6);
  }
  function formatScores(entries, limit = Infinity) {
    const scores = highScores(entries);
    const shown = scores.slice(0, limit).map(item => `${item.name} ${item.score.toFixed(1)}점`).join(' · ');
    return shown + (scores.length > limit ? ` 외 ${scores.length - limit}개 영역` : '');
  }
  function noticeText(entries) {
    const scores = formatScores(entries);
    return scores ? `${title}\n해당 영역: ${scores}\n${message}\n${basis}` : '';
  }
  function noticeHTML(entries, conditional = false) {
    if (!conditional && !highScores(entries).length) return '';
    const intro = conditional ? '선택한 구간 중 실제 원점수가 5.5점 이상일 때 적용합니다.' : `해당 영역: ${formatScores(entries, 3)}`;
    return `<aside class="mps-score-notice" aria-label="${title}"><strong>${title}</strong><p class="mps-score-notice-scores">${escapeHTML(intro)}</p><p>${message}</p><small>${basis}</small></aside>`;
  }
  function renderNotice(container, entries) {
    if (!container) return;
    const html = noticeHTML(entries);
    container.hidden = !html;
    container.innerHTML = html;
  }
  function tierIncludesThreshold(rawRange) {
    if (typeof rawRange !== 'string') return false;
    const values = (rawRange.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!values.length || values.some(v => v < 1 || v > 6)) return false;
    return /이상/.test(rawRange) || Math.max(...values) >= threshold;
  }
  root.MPS_SCORE_REVIEW = { threshold, title, message, basis, highScores, formatScores, noticeText, noticeHTML, renderNotice, tierIncludesThreshold };
})(typeof window === 'undefined' ? globalThis : window);
