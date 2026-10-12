/**
 * API 계층. 서버(server.js)가 API 키와 함께 떠 있으면 실제 LLM 호출,
 * 아니면 더미 데이터를 반환하는 Mock으로 자동 전환한다.
 */
(function (root) {
  'use strict';
  const { OPTIONS, parseKeywords, buildPrompt, buildRefinePrompt } = root.PromptBuilder;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function detectMode() {
    if (location.protocol === 'file:') return 'mock';
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) return 'mock';
      const data = await res.json();
      return data.ready ? 'live' : 'mock';
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
  const ENDINGS = {
    friendly: ['정말 만족스러웠어요.', '꼭 한번 써보시길 추천드려요!', '생각보다 훨씬 좋았어요.'],
    professional: ['전반적으로 우수한 완성도를 보입니다.', '충분히 고려해 볼 만한 선택지입니다.', '실사용 측면에서 높은 점수를 줄 수 있습니다.'],
    emotional: ['손끝에 닿는 감촉이 오래 기억에 남았다.', '조용한 오후, 그 순간이 참 좋았다.', '작은 변화가 하루의 결을 바꿔 놓았다.'],
    mz: ['이거 완전 갓성비 찐템 인정 🔥', '솔직히 킹받을 정도로 좋음 ㅋㅋ', '안 써본 사람 없게 해주세요 🙌'],
  };

  function mockText(form) {
    const subject = form.subject.trim();
    const kws = parseKeywords(form.keywords);
    const kw = (i) => kws[i % (kws.length || 1)] || subject;
    const end = ENDINGS[form.tone];
    const typeLabel = OPTIONS.postType[form.postType].label;
    const isNaver = form.platform === 'naver';
    const img = (desc) => (isNaver ? `\n[사진: ${desc}]\n` : '');
    const h = (t) => (isNaver ? `\n✔ ${t}\n` : `\n## ${t}\n`);

    const unit = [
      `${subject}에 대해 직접 경험해 본 내용을 정리했습니다. '${kw(0)}' 정보를 찾고 계신 분들께 도움이 되면 좋겠어요. ${end[0]}`,
      `가장 먼저 눈에 띈 건 완성도였어요. ${kw(1)} 관점에서 보면 기대 이상이었고, 사용하는 내내 불편함이 거의 없었습니다. ${end[1]}`,
      `물론 아쉬운 점도 있었어요. 가격대는 [확인 필요]이며, 처음 적응하는 데 약간의 시간이 필요했습니다. 하지만 ${end[2]}`,
    ];

    let body = [
      `제목: ${kw(0)} | ${subject} ${typeLabel} 솔직 후기`,
      img(`${subject} 전체 모습`),
      h('첫인상'),
      unit[0],
      img(`${subject} 디테일 컷`),
      h('핵심 포인트'),
      unit[1],
      form.extra.trim() ? `\n특히 강조하고 싶은 부분은 이거예요. ${form.extra.trim().slice(0, 120)}\n` : '',
      img('사용 장면'),
      h('아쉬운 점'),
      unit[2],
    ].join('\n');

    const target = { short: 1000, medium: 1500, long: 2100 }[form.length];
    let i = 0;
    while (body.length < target) {
      body += `\n\n${unit[i % unit.length]}`;
      i++;
    }

    body += isNaver ? '\n' : '\n\n## 한눈에 정리\n- 장점: 완성도, 편의성\n- 단점: 적응 기간\n- 추천: ' + kw(0) + ' 정보를 찾는 분\n';
    if (form.postType === 'sponsored') body += '\n※ 본 포스팅은 업체로부터 제품을 제공받아 작성되었습니다.';
    if (form.postType === 'experience') body += '\n※ 본 포스팅은 체험단으로 서비스를 제공받아 작성되었습니다.';
    if (isNaver) body += '\n\n' + (kws.length ? kws : [subject]).map((k) => '#' + k.replace(/\s+/g, '')).join(' ');
    return body.trim();
  }

  function mockRefine(prev) {
    const swaps = [
      ['정말', '진짜'], ['기대 이상', '예상보다 훨씬 좋은 수준'], ['불편함이 거의 없었습니다', '거슬리는 부분이 없었어요'],
      ['도움이 되면 좋겠어요', '참고가 되셨으면 해요'], ['약간의 시간', '조금의 시간'],
    ];
    return swaps.reduce((t, [a, b]) => t.split(a).join(b), prev);
  }

  /**
   * 생성 요청. mode: 'live' | 'mock'
   * previousText가 있으면 리라이팅(다시 생성하기) 모드.
   */
  async function generatePost(form, { mode, previousText } = {}) {
    const prompt = previousText ? buildRefinePrompt(form, previousText) : buildPrompt(form);
    if (mode === 'live') {
      const text = await callServer({ form, previousText: previousText || null });
      return { text, prompt };
    }
    await sleep(900 + Math.random() * 700); // 네트워크 지연 흉내
    return { text: previousText ? mockRefine(previousText) : mockText(form), prompt };
  }

  root.BlogAPI = { detectMode, generatePost };
})(window);
