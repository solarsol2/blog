(function () {
  'use strict';
  const { OPTIONS, DEFAULT_STATE, parseKeywords, validate, buildPrompt } = window.PromptBuilder;
  const { detectMode, generatePost } = window.BlogAPI;
  const STORAGE_KEY = 'blog-writer:selections';
  const $ = (id) => document.getElementById(id);

  // 칩 그룹 UI 정의 (값/라벨은 PromptBuilder.OPTIONS가 단일 출처)
  const GROUPS = [
    { key: 'postType', title: '글 유형', cols: 'grid-cols-2 sm:grid-cols-4', hints: { sponsored: '📦', experience: '🎟️', info: '💡', visit: '📍' } },
    { key: 'tone', title: '톤앤매너', cols: 'grid-cols-2 sm:grid-cols-4', hints: { friendly: '😊', professional: '👔', emotional: '🌙', mz: '🔥' } },
    { key: 'platform', title: '플랫폼 템플릿', cols: 'grid-cols-2', sub: { naver: '이미지+텍스트 반복형', tistory: '정보 전달형' } },
    { key: 'length', title: '분량', cols: 'grid-cols-3', sub: { short: '1,000자 내외', medium: '1,500자 내외', long: '2,000자 이상' } },
  ];

  const state = { ...DEFAULT_STATE, ...loadSelections(), mode: 'mock', loading: false, output: '' };

  function loadSelections() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.fromEntries(Object.entries(saved).filter(([g, v]) => OPTIONS[g] && OPTIONS[g][v]));
    } catch { return {}; }
  }
  function saveSelections() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ postType: state.postType, tone: state.tone, platform: state.platform, length: state.length }));
    } catch { /* 저장 불가 환경은 무시 */ }
  }

  // ---------- 렌더링 ----------
  const CHIP_BASE = 'chip group relative flex flex-col items-center justify-center rounded-xl border-2 px-3 py-3 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200';
  const CHIP_ON = 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm';
  const CHIP_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50';

  function renderChipGroups() {
    $('chipGroups').innerHTML = GROUPS.map((g) => `
      <div>
        <p class="mb-2 text-sm font-semibold">${g.title}</p>
        <div class="grid gap-2 ${g.cols}" role="radiogroup" aria-label="${g.title}" data-group="${g.key}">
          ${Object.entries(OPTIONS[g.key]).map(([value, opt]) => {
            const [main, paren] = opt.label.split(/[()]/);
            const sub = (g.sub && g.sub[value]) || paren || '';
            const icon = g.hints && g.hints[value] ? `<span class="text-lg leading-none mb-1">${g.hints[value]}</span>` : '';
            return `<button type="button" role="radio" data-value="${value}" class="${CHIP_BASE}">
              <span class="chip-check absolute right-1.5 top-1.5 flex h-4 w-4 scale-50 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white opacity-0 transition">✓</span>
              ${icon}<span class="text-sm font-semibold">${main.trim()}</span>
              ${sub ? `<span class="mt-0.5 text-[11px] opacity-70">${sub}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>`).join('');
    syncChips();
  }

  function syncChips() {
    document.querySelectorAll('[data-group]').forEach((groupEl) => {
      const current = state[groupEl.dataset.group];
      groupEl.querySelectorAll('button').forEach((btn) => {
        const on = btn.dataset.value === current;
        btn.setAttribute('aria-checked', on);
        btn.tabIndex = on ? 0 : -1;
        btn.className = `${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`;
      });
    });
  }

  function readForm() {
    return {
      postType: state.postType, tone: state.tone, platform: state.platform, length: state.length,
      subject: $('subject').value, keywords: $('keywords').value, extra: $('extra').value,
    };
  }

  function renderKeywordPreview() {
    $('keywordPreview').innerHTML = parseKeywords($('keywords').value)
      .map((k) => `<span class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">#${k.replace(/[<>&]/g, '')}</span>`)
      .join('');
  }

  function renderPromptPreview() {
    const form = readForm();
    if (!form.subject.trim()) form.subject = '(대상/제품명)';
    const { system, user } = buildPrompt(form);
    $('promptView').textContent = `[SYSTEM]\n${system}\n\n[USER]\n${user}`;
  }

  function renderControls() {
    const ready = $('subject').value.trim().length > 0;
    const hasOutput = state.output.trim().length > 0;
    $('generateBtn').disabled = !ready || state.loading;
    $('generateLabel').textContent = state.loading ? '생성 중…' : ready ? (hasOutput ? '✨ 새로 생성하기' : '✨ 글 생성하기') : '대상/제품명을 입력하세요';
    $('regenBtn').disabled = !hasOutput || state.loading;
    $('copyBtn').disabled = !hasOutput || state.loading;
    $('output').readOnly = state.loading || !hasOutput;
    $('loading').classList.toggle('hidden', !state.loading);
    $('loading').classList.toggle('flex', state.loading);
  }

  function renderCount() {
    const t = state.output;
    $('charCount').textContent = t
      ? `공백 포함 ${t.length.toLocaleString()}자 · 공백 제외 ${t.replace(/\s/g, '').length.toLocaleString()}자`
      : '아직 생성된 글이 없어요';
  }

  function renderMode() {
    const live = state.mode === 'live';
    $('modeBadge').textContent = live ? '● LLM 연결됨' : '● 데모 모드 (더미 데이터)';
    $('modeBadge').className = `rounded-full px-3 py-1 text-xs font-medium ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('opacity-0', '-translate-y-2');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('opacity-0', '-translate-y-2'), 1800);
  }

  // ---------- 액션 ----------
  async function run(refine) {
    const form = readForm();
    const errors = validate(form);
    if (errors.length) { toast(errors[0]); $('subject').focus(); return; }

    state.loading = true;
    $('loadingText').textContent = refine ? '문맥은 그대로, 문장만 다듬는 중…' : '글을 쓰고 있어요…';
    renderControls();
    try {
      const { text } = await generatePost(form, { mode: state.mode, previousText: refine ? state.output : null });
      state.output = text;
      $('output').value = text;
      $('output').scrollTop = 0;
      toast(refine ? '다듬기 완료!' : '생성 완료!');
      if (window.innerWidth < 1024) $('resultPanel').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      state.loading = false;
      renderControls();
      renderCount();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.output);
    } catch {
      $('output').select();
      document.execCommand('copy');
    }
    toast('📋 클립보드에 복사했어요');
  }

  // ---------- 이벤트 ----------
  function bind() {
    $('chipGroups').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      state[btn.closest('[data-group]').dataset.group] = btn.dataset.value;
      syncChips(); saveSelections(); renderPromptPreview();
    });
    // 라디오그룹 방향키 이동
    $('chipGroups').addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const groupEl = e.target.closest('[data-group]');
      if (!groupEl) return;
      e.preventDefault();
      const btns = [...groupEl.querySelectorAll('button')];
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = btns[(btns.indexOf(e.target) + step + btns.length) % btns.length];
      next.click(); next.focus();
    });

    ['subject', 'keywords', 'extra'].forEach((id) => $(id).addEventListener('input', () => {
      if (id === 'keywords') renderKeywordPreview();
      renderControls(); renderPromptPreview();
    }));

    $('output').addEventListener('input', () => { state.output = $('output').value; renderCount(); renderControls(); });
    $('form').addEventListener('submit', (e) => { e.preventDefault(); run(false); });
    $('regenBtn').addEventListener('click', () => run(true));
    $('copyBtn').addEventListener('click', copy);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('generateBtn').disabled) run(false);
    });
  }

  async function init() {
    renderChipGroups();
    bind();
    renderControls();
    renderPromptPreview();
    state.mode = await detectMode();
    renderMode();
  }

  init();
})();
