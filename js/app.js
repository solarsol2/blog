(function () {
  'use strict';
  const PB = window.PromptBuilder;
  const { CUSTOM, GROUPS, FEEDBACK_LABELS, optionsFor, presetFor, defaultSelection, resolve, parseKeywords, validate, buildPrompt } = PB;
  const { detectMode, generatePost } = window.BlogAPI;
  const STORAGE_KEY = 'blog-writer:v2';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 상위 선택이 바뀌면 추천값을 따라가는 그룹 (사용자가 직접 건드리면 고정)
  const DEPENDENTS = { category: 'points', postType: 'sections', platform: 'format' };

  const state = {
    sel: defaultSelection(), custom: {}, dirty: {},
    fbChips: new Set(), versions: [], vIndex: -1,
    mode: 'mock', loading: false,
  };

  // ---------- 저장 ----------
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      Object.assign(state.custom, saved.custom || {});
      Object.assign(state.dirty, saved.dirty || {});
      // 순서 중요: 상위 그룹(분야 등)을 먼저 복원해야 강조 포인트 옵션이 맞게 생성됨
      for (const key of ['postType', 'category', 'platform', ...Object.keys(GROUPS)]) {
        const v = (saved.sel || {})[key];
        if (v == null) continue;
        const valid = Object.keys(optionsFor(key, state.sel)).concat(CUSTOM);
        if (GROUPS[key].type === 'multi') state.sel[key] = [].concat(v).filter((k) => valid.includes(k));
        else if (valid.includes(v)) state.sel[key] = v;
      }
    } catch { /* 저장소 사용 불가 시 기본값 */ }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sel: state.sel, custom: state.custom, dirty: state.dirty })); } catch {}
  }

  // ---------- 칩 그룹 ----------
  const PILL = 'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200';
  const PILL_ON = 'border-indigo-600 bg-indigo-600 text-white shadow-sm';
  const PILL_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50';
  const CUSTOM_OFF = 'border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-600';

  const isOn = (key, value) => [].concat(state.sel[key]).includes(value);

  function groupHTML(key) {
    const g = GROUPS[key];
    const multi = g.type === 'multi';
    const chips = Object.entries(optionsFor(key, state.sel)).map(([value, o]) => {
      const on = isOn(key, value);
      return `<button type="button" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" data-value="${value}" class="${PILL} ${on ? PILL_ON : PILL_OFF}">
        ${multi && on ? '<span aria-hidden="true">✓</span>' : o.icon ? `<span aria-hidden="true">${o.icon}</span>` : ''}
        <span class="font-medium">${esc(o.label)}</span>${o.sub ? `<span class="text-xs opacity-70">${esc(o.sub)}</span>` : ''}
      </button>`;
    }).join('');
    const customOn = isOn(key, CUSTOM);
    return `
      <div class="mb-2 flex items-baseline gap-2">
        <p class="text-sm font-semibold">${g.title}</p>
        ${g.hint ? `<p class="text-xs text-slate-400">${g.hint}</p>` : ''}
      </div>
      <div class="flex flex-wrap gap-1.5" role="${multi ? 'group' : 'radiogroup'}" aria-label="${g.title}">
        ${chips}
        <button type="button" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${customOn}" data-value="${CUSTOM}" class="${PILL} ${customOn ? PILL_ON : CUSTOM_OFF}">✏️ 직접 입력</button>
      </div>
      ${customOn ? `<input data-custom="${key}" type="text" maxlength="${PB.LIMITS.custom}" value="${esc(state.custom[key] || '')}" placeholder="${esc(g.placeholder || '직접 입력')}"
        class="mt-2 w-full rounded-lg border border-indigo-300 bg-indigo-50/40 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />` : ''}`;
  }

  function renderGroup(key) {
    const el = document.querySelector(`[data-group="${key}"]`);
    if (el) el.innerHTML = groupHTML(key);
  }

  function renderAllGroups() {
    document.querySelectorAll('[data-step]').forEach((stepEl) => {
      stepEl.innerHTML = Object.keys(GROUPS).filter((k) => GROUPS[k].step === stepEl.dataset.step)
        .map((k) => `<div data-group="${k}"></div>`).join('');
    });
    Object.keys(GROUPS).forEach(renderGroup);
  }

  function selectChip(key, value) {
    const g = GROUPS[key];
    if (g.type === 'single') {
      if (state.sel[key] === value) return;
      state.sel[key] = value;
    } else {
      const cur = new Set(state.sel[key]);
      cur.has(value) ? cur.delete(value) : cur.add(value);
      state.sel[key] = [...cur];
      state.dirty[key] = true;
    }
    renderGroup(key);

    // 상위 선택 변경 → 의존 그룹 추천값 갱신
    const dep = DEPENDENTS[key];
    if (dep) {
      const valid = Object.keys(optionsFor(dep, state.sel)).concat(CUSTOM);
      const kept = state.sel[dep].filter((k) => valid.includes(k));
      state.sel[dep] = state.dirty[dep] && kept.length ? kept : presetFor(dep, state.sel);
      renderGroup(dep);
    }

    if (value === CUSTOM && isOn(key, CUSTOM)) {
      const input = document.querySelector(`[data-custom="${key}"]`);
      if (input) input.focus();
    }
    save();
    refresh();
  }

  // ---------- 폼/미리보기 ----------
  function readForm() {
    return {
      sel: JSON.parse(JSON.stringify(state.sel)), custom: { ...state.custom },
      subject: $('subject').value, keywords: $('keywords').value, extra: $('extra').value,
    };
  }

  function renderKeywordPreview() {
    $('keywordPreview').innerHTML = parseKeywords($('keywords').value)
      .map((k) => `<span class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">#${esc(k)}</span>`).join('');
  }

  function renderDetailSummary() {
    const form = readForm();
    $('detailSummary').textContent = Object.keys(GROUPS).filter((k) => GROUPS[k].step === 'detail')
      .map((k) => `${GROUPS[k].title.replace(/\(.*\)/, '')}: ${resolve(form, k).map((r) => r.label).join(', ') || '없음'}`).join(' · ');
  }

  function renderPromptPreview() {
    const form = readForm();
    if (!form.subject.trim()) form.subject = '(대상/제품명)';
    const errors = validate(form);
    if (errors.length) { $('promptView').textContent = `⚠️ ${errors[0]}`; return; }
    const { system, user } = buildPrompt(form);
    $('promptView').textContent = `[SYSTEM]\n${system}\n\n[USER]\n${user}`;
  }

  // ---------- 결과/피드백 ----------
  const current = () => (state.vIndex >= 0 ? state.versions[state.vIndex] : '');

  function renderFeedbackChips() {
    $('feedbackChips').innerHTML = Object.entries(FEEDBACK_LABELS).map(([k, label]) => {
      const on = state.fbChips.has(k);
      return `<button type="button" data-fb="${k}" aria-pressed="${on}" class="${PILL} !py-1 !text-xs ${on ? PILL_ON : PILL_OFF}">${on ? '✓ ' : ''}${label}</button>`;
    }).join('');
  }

  function renderResult() {
    const text = current();
    const has = text.trim().length > 0;
    $('output').value = text;
    $('charCount').textContent = has
      ? `공백 포함 ${text.length.toLocaleString()}자 · 공백 제외 ${text.replace(/\s/g, '').length.toLocaleString()}자`
      : '아직 생성된 글이 없어요';
    $('versionLabel').textContent = state.versions.length > 1 ? `v${state.vIndex + 1} / ${state.versions.length}` : '';
  }

  function renderControls() {
    const ready = $('subject').value.trim().length > 0;
    const has = current().trim().length > 0;
    const hasFeedback = state.fbChips.size > 0 || $('feedback').value.trim().length > 0;
    const busy = state.loading;
    $('generateBtn').disabled = !ready || busy;
    $('generateLabel').textContent = busy ? '생성 중…' : !ready ? '대상/제품명을 입력하세요' : has ? '✨ 새로 생성하기' : '✨ 글 생성하기';
    $('copyBtn').disabled = !has || busy;
    $('polishBtn').disabled = !has || busy;
    $('reviseBtn').disabled = !has || !hasFeedback || busy;
    $('prevBtn').disabled = busy || state.vIndex <= 0;
    $('nextBtn').disabled = busy || state.vIndex >= state.versions.length - 1;
    $('output').readOnly = busy || !has;
    $('feedbackBox').classList.toggle('opacity-50', !has);
    $('loading').classList.toggle('hidden', !busy);
    $('loading').classList.toggle('flex', busy);
  }

  function refresh() {
    renderDetailSummary();
    renderPromptPreview();
    renderControls();
  }

  function renderMode(info) {
    const live = info.mode === 'live';
    $('modeBadge').textContent = live ? `● LLM 연결됨 · ${info.model}` : '● 데모 모드 (더미 데이터)';
    $('modeBadge').className = `rounded-full px-3 py-1 text-xs font-medium ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('opacity-0', '-translate-y-2');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('opacity-0', '-translate-y-2'), 2000);
  }

  // ---------- 액션 ----------
  // kind: 'new' | 'polish' | 'revise'
  async function run(kind) {
    const form = readForm();
    const errors = validate(form);
    if (errors.length) { toast(errors[0]); return; }

    const feedback = kind === 'revise' ? { chips: [...state.fbChips], text: $('feedback').value } : null;
    state.loading = true;
    $('loadingText').textContent = { new: '글을 쓰고 있어요…', polish: '문맥은 그대로, 문장만 다듬는 중…', revise: '피드백을 반영하는 중…' }[kind];
    renderControls();
    try {
      const { text } = await generatePost(form, { mode: state.mode, previousText: kind === 'new' ? null : current(), feedback });
      // 이전 버전으로 돌아간 상태에서 새로 만들면 그 뒤 버전은 버림
      state.versions = state.versions.slice(0, state.vIndex + 1).concat(text);
      state.vIndex = state.versions.length - 1;
      if (kind === 'revise') { state.fbChips.clear(); $('feedback').value = ''; renderFeedbackChips(); }
      renderResult();
      $('output').scrollTop = 0;
      toast({ new: '생성 완료!', polish: '다듬기 완료!', revise: '피드백 반영 완료!' }[kind]);
      if (window.innerWidth < 1024 && kind === 'new') $('resultPanel').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      state.loading = false;
      renderControls();
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(current()); }
    catch { $('output').select(); document.execCommand('copy'); }
    toast('📋 클립보드에 복사했어요');
  }

  function resetOptions() {
    state.sel = defaultSelection(); state.custom = {}; state.dirty = {};
    save(); renderAllGroups(); refresh();
    toast('옵션을 기본값으로 되돌렸어요');
  }

  // ---------- 이벤트 ----------
  function bind() {
    $('form').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-group] button[data-value]');
      if (btn) selectChip(btn.closest('[data-group]').dataset.group, btn.dataset.value);
    });
    $('form').addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.custom;
      if (key) { state.custom[key] = e.target.value; save(); refresh(); }
    });
    // 단일 선택 그룹: 방향키로 이동
    $('form').addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key) || !e.target.matches('[role=radio]')) return;
      const btns = [...e.target.parentElement.querySelectorAll('button')];
      const next = btns[(btns.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
      e.preventDefault();
      const key = e.target.closest('[data-group]').dataset.group;
      selectChip(key, next.dataset.value);
      const again = document.querySelector(`[data-group="${key}"] [data-value="${next.dataset.value}"]`);
      if (again && next.dataset.value !== CUSTOM) again.focus();
    });

    ['subject', 'keywords', 'extra'].forEach((id) => $(id).addEventListener('input', () => {
      if (id === 'keywords') renderKeywordPreview();
      refresh();
    }));

    $('feedbackChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fb]');
      if (!btn) return;
      const k = btn.dataset.fb;
      state.fbChips.has(k) ? state.fbChips.delete(k) : state.fbChips.add(k);
      renderFeedbackChips(); renderControls();
    });
    $('feedback').addEventListener('input', renderControls);
    $('feedback').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !$('reviseBtn').disabled) { e.preventDefault(); run('revise'); }
    });

    $('output').addEventListener('input', () => {
      if (state.vIndex >= 0) state.versions[state.vIndex] = $('output').value;
      renderResult(); renderControls();
    });
    $('form').addEventListener('submit', (e) => { e.preventDefault(); run('new'); });
    $('reviseBtn').addEventListener('click', () => run('revise'));
    $('polishBtn').addEventListener('click', () => run('polish'));
    $('copyBtn').addEventListener('click', copy);
    $('prevBtn').addEventListener('click', () => { state.vIndex--; renderResult(); renderControls(); });
    $('nextBtn').addEventListener('click', () => { state.vIndex++; renderResult(); renderControls(); });
    $('resetBtn').addEventListener('click', resetOptions);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('generateBtn').disabled) { e.preventDefault(); run('new'); }
    });
  }

  async function init() {
    load();
    renderAllGroups();
    renderFeedbackChips();
    bind();
    renderResult();
    refresh();
    const info = await detectMode();
    state.mode = info.mode;
    renderMode(info);
  }

  init();
})();
