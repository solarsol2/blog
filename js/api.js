/**
 * API 계층. 서버(server.js)가 API 키와 함께 떠 있으면 실제 LLM 호출,
 * 아니면 더미 데이터를 반환하는 Mock으로 자동 전환한다.
 */
(function (root) {
  'use strict';
  const { resolve, parseKeywords } = root.PromptBuilder;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function detectMode() {
    if (location.protocol === 'file:') return 'mock';
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      return res.ok && (await res.json()).ready ? 'live' : 'mock';
    } catch {
      return 'mock';
    }
  }

  async function callServer(payload) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data.text;
  }

  // ---------- Mock ----------
  const DEMO_NOTICE = '⚠️ [데모 모드] 아래는 API 키 없이 만든 더미 글입니다. 실제 글이 아니에요.\n\n';

  function mockText(form) {
    const subject = form.subject.trim();
    const kws = parseKeywords(form.keywords);
    const kw = (i) => kws[i % (kws.length || 1)] || subject;
    const one = (key) => (resolve(form, key)[0] || {}).label || '';
    const isNaver = form.sel.platform === 'naver';
    const images = resolve(form, 'format').some((r) => r.label === '사진 자리표시자');
    const points = resolve(form, 'points').map((r) => r.label);
    const sections = resolve(form, 'sections').map((r) => r.label);

    const h = (t) => (isNaver ? `\n✔ ${t}\n` : `\n## ${t}\n`);
    const img = (d) => (images ? `\n[사진: ${d}]\n` : '');
    const filler = (title, i) =>
      `${title} 이야기를 해볼게요. ${points[i % (points.length || 1)] || '사용감'} 측면에서 보면 '${kw(i)}'를 찾는 분들이 궁금해할 만한 부분이 분명히 있었어요. ` +
      `(톤: ${one('tone')} · 화자: ${one('persona') || '지정 안 함'})`;

    let body = `제목: ${kw(0)} | ${subject} ${one('postType')}\n`;
    body += `\n${subject}을(를) 직접 경험해 본 내용을 정리했어요. '${kw(0)}' 정보를 찾는 분들께 참고가 되면 좋겠어요.\n`;
    (sections.length ? sections : ['본문']).forEach((s, i) => {
      body += h(s) + img(`${subject} — ${s}`) + filler(s, i) + '\n';
    });
    if (form.extra.trim()) body += `\n특히 강조하고 싶은 점: ${form.extra.trim().slice(0, 120)}\n`;

    const target = { short: 1000, medium: 1500, long: 2100, xlong: 3100 }[form.sel.length] || 1500;
    let i = 0;
    while (body.length < target) body += '\n' + filler(sections[i % (sections.length || 1)] || '추가 경험', i++) + '\n';

    if (form.sel.postType === 'sponsored') body += '\n※ 본 포스팅은 업체로부터 제품을 제공받아 작성되었습니다.';
    if (form.sel.postType === 'experience') body += '\n※ 본 포스팅은 체험단으로 서비스를 제공받아 작성되었습니다.';
    if (resolve(form, 'format').some((r) => r.label === '해시태그'))
      body += '\n\n' + (kws.length ? kws : [subject]).map((k) => '#' + k.replace(/\s+/g, '')).join(' ');
    return body.trim();
  }

  function mockRevise(prev, feedback) {
    let text = prev.replace(DEMO_NOTICE, '');
    const chips = (feedback && feedback.chips) || [];
    if (chips.includes('shorter')) text = text.slice(0, Math.round(text.length * 0.75)).replace(/[^\n.]*$/, '');
    if (chips.includes('longer')) text += '\n\n(데모) 경험 묘사를 보강한 문단이 여기에 추가됩니다.';
    text = text.split('궁금해할 만한').join('꼭 알아야 할').split('참고가 되면').join('도움이 되면');
    const note = [...chips, feedback && feedback.text].filter(Boolean).join(', ');
    return DEMO_NOTICE + (note ? `(반영한 피드백: ${note})\n\n` : '') + text;
  }

  /**
   * 생성 요청 → 결과 텍스트. opts: { mode: 'live'|'mock', previousText?, feedback?: {chips, text} }
   * previousText가 있으면 수정 모드(피드백 없으면 문장 다듬기).
   */
  async function generatePost(form, { mode, previousText, feedback } = {}) {
    if (mode === 'live') return callServer({ form, previousText: previousText || null, feedback: feedback || null });
    await sleep(800 + Math.random() * 600);
    return previousText ? mockRevise(previousText, feedback) : DEMO_NOTICE + mockText(form);
  }

  root.BlogAPI = { detectMode, generatePost };
})(window);
