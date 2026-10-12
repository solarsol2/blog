/**
 * 옵션 정의 + 프롬프트 조립 모듈 — 브라우저(window.PromptBuilder)와 Node(require) 공용.
 *
 * form 구조:
 *   { sel: { [group]: key | key[] }, custom: { [group]: text }, subject, keywords, extra }
 *   key가 CUSTOM이면 custom[group]의 텍스트를 사용한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PromptBuilder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CUSTOM = '__custom';
  const LIMITS = { custom: 120, subject: 80, keywords: 300, extra: 3000, feedback: 400 };

  // ---------- 분야별 강조 포인트 ----------
  const POINTS = {
    it: ['디자인·마감', '성능·속도', '배터리', '휴대성', '소음', '호환성·연결', '소프트웨어·앱', '가성비', '내구성', 'A/S'],
    beauty: ['발림성·제형', '지속력', '향', '피부 타입 적합성', '성분', '발색', '자극 여부', '패키지', '용량 대비 가격'],
    fashion: ['핏·사이즈감', '소재·촉감', '컬러', '코디 활용도', '착용감', '세탁·관리', '가격대'],
    food: ['맛', '양', '가격', '메뉴 구성', '분위기', '서비스·친절도', '웨이팅', '주차·접근성', '청결'],
    cafe: ['커피 맛', '디저트', '인테리어·포토존', '좌석·콘센트', '분위기·소음', '가격', '주차·접근성'],
    travel: ['동선·코스', '숙소 컨디션', '교통', '경비', '포토 스팟', '맛집', '혼잡도', '계절 팁', '아이 동반'],
    living: ['사용 편의성', '디자인', '수납·공간 활용', '청소·관리', '내구성', '안전성', '가성비'],
    kids: ['안전성', '소재·성분', '아이 반응', '세척·관리', '휴대성', '연령 적합성', '가성비'],
    health: ['효과 체감', '사용 난이도', '꾸준히 하기 쉬움', '소음·공간', '성분·원재료', '가격'],
    pet: ['기호성', '성분·원재료', '안전성', '반려동물 반응', '관리 편의', '가성비'],
    book: ['내용 요약', '인상 깊은 문장', '난이도', '실용성', '추천 독자', '저자·강사 신뢰도'],
    finance: ['혜택·수익률', '수수료', '가입 조건', '리스크', '앱 편의성', '대안 비교'],
    car: ['승차감', '연비·전비', '실내 공간', '주행 성능', '편의 옵션', '유지비', '디자인'],
  };

  // 글 유형별 추천 구성
  const SECTION_PRESETS = {
    sponsored: ['firstimpr', 'spec', 'proscons', 'cons', 'target', 'summary'],
    experience: ['firstimpr', 'proscons', 'cons', 'price', 'target', 'summary'],
    visit: ['firstimpr', 'price', 'proscons', 'tips', 'summary'],
    travel: ['firstimpr', 'tips', 'price', 'summary'],
    compare: ['spec', 'compare', 'proscons', 'target', 'summary'],
    guide: ['compare', 'target', 'tips', 'faq', 'summary'],
    howto: ['spec', 'tips', 'faq', 'summary'],
    info: ['tips', 'faq', 'summary'],
    daily: ['firstimpr', 'summary'],
  };

  // 플랫폼별 추천 형식 요소
  const FORMAT_PRESETS = {
    naver: ['images', 'bold', 'hashtags'],
    tistory: ['toc', 'bold', 'table'],
    brunch: ['quote'],
    insta: ['hashtags'],
    wordpress: ['toc', 'table', 'meta'],
  };

  // ---------- 그룹 정의 ----------
  // type: single | multi, step: UI 배치, guide: 프롬프트에 들어갈 구체 지시(null이면 지시 생략)
  const GROUPS = {
    postType: {
      title: '글 유형', type: 'single', step: 'basic', default: 'sponsored',
      placeholder: '예: 신제품 출시 소식, 행사 참가 후기',
      options: {
        sponsored: { label: '제품 협찬 리뷰', icon: '📦', guide: ['실사용 후기 형식. 첫인상 → 핵심 기능 체험 → 장점 → 아쉬운 점 → 추천 대상 흐름.', '글 하단에 "본 포스팅은 업체로부터 제품을 제공받아 작성되었습니다." 고지 문구를 넣는다.'] },
        experience: { label: '서비스 체험단', icon: '🎟️', guide: ['체험 과정을 시간 순서로 생생하게 서술한다. 신청·예약 → 이용 과정 → 인상 깊은 점 → 가성비 → 재이용 의사.', '글 하단에 "본 포스팅은 체험단으로 서비스를 제공받아 작성되었습니다." 고지 문구를 넣는다.'] },
        visit: { label: '방문 후기', icon: '📍', sub: '맛집·카페·매장', guide: ['현장감 있는 방문 후기. 위치·찾아가는 법 → 외관/분위기 → 메뉴·시설·서비스 → 장단점 → 방문 팁.'] },
        travel: { label: '여행기·여행지 추천', icon: '✈️', guide: ['여행 개요(일정·동행) → 코스/동선 → 스팟별 후기 → 경비·교통 → 꿀팁 순으로 작성한다.'] },
        compare: { label: '비교 리뷰', icon: '⚖️', sub: 'A vs B', guide: ['비교 기준을 먼저 제시하고 항목별로 비교한 뒤, 상황별로 어떤 선택이 맞는지 결론을 낸다.'] },
        guide: { label: '구매 가이드·TOP N', icon: '🏆', guide: ['고르는 기준 → 추천 리스트(각 항목 한 줄 요약 + 추천 이유) → 상황별 추천 순으로 작성한다.'] },
        howto: { label: '사용법·튜토리얼', icon: '🛠️', guide: ['준비물/사전 조건 → 단계별 방법(번호 매기기) → 자주 하는 실수 → 응용 팁 순으로 작성한다.'] },
        info: { label: '정보성 포스팅', icon: '💡', guide: ['독자의 궁금증 해결이 목적. 도입(왜 알아야 하는가) → 핵심 정보 3~5개 소제목 → 정리.'] },
        daily: { label: '일상 기록', icon: '📝', guide: ['개인적인 하루/경험을 자연스럽게 기록한다. 대상은 일상 속에 녹여서 소개한다.'] },
      },
    },
    category: {
      title: '분야', type: 'single', step: 'basic', default: 'it',
      placeholder: '예: 캠핑용품, 문구',
      options: {
        it: { label: 'IT·전자기기', icon: '💻' }, beauty: { label: '뷰티', icon: '💄' }, fashion: { label: '패션', icon: '👕' },
        food: { label: '맛집·음식', icon: '🍽️' }, cafe: { label: '카페·디저트', icon: '☕' }, travel: { label: '여행·숙소', icon: '🏨' },
        living: { label: '생활·리빙', icon: '🏠' }, kids: { label: '육아·키즈', icon: '🧸' }, health: { label: '건강·운동', icon: '💪' },
        pet: { label: '반려동물', icon: '🐶' }, book: { label: '도서·교육', icon: '📚' }, finance: { label: '금융·재테크', icon: '💰' },
        car: { label: '자동차', icon: '🚗' },
      },
    },
    platform: {
      title: '플랫폼', type: 'single', step: 'basic', default: 'naver',
      placeholder: '예: 카페 게시글, 사내 뉴스레터',
      options: {
        naver: { label: '네이버 블로그', sub: '이미지+텍스트 반복', guide: ['문단은 2~4문장으로 짧게, 줄바꿈을 자주 해 모바일 가독성을 높인다.', '소제목은 "✔ 소제목" 또는 이모지 + 짧은 문구 형태.'] },
        tistory: { label: '티스토리', sub: '정보 전달형', guide: ['마크다운 소제목(##, ###)으로 계층을 명확히 나눈다.', '첫 문단에 핵심 키워드와 결론을 먼저 제시한다.'] },
        brunch: { label: '브런치', sub: '에세이형', guide: ['잡지 칼럼처럼 긴 호흡의 완성된 문단으로 쓴다. 소제목은 최소화한다.'] },
        insta: { label: '인스타그램', sub: '캡션', guide: ['인스타그램 캡션으로 작성한다. 첫 줄에 시선을 끄는 훅, 짧은 줄바꿈 위주.', '분량 지시와 무관하게 공백 포함 300~800자로 짧게 쓴다.'] },
        wordpress: { label: '워드프레스·구글 SEO', guide: ['H2/H3 계층 구조(## / ###)로 작성하고, 각 섹션 첫 문장에 요점을 둔다.'] },
      },
    },
    length: {
      title: '분량', type: 'single', step: 'basic', default: 'medium',
      placeholder: '예: 2500자, 소제목 5개 분량',
      options: {
        short: { label: '짧게', sub: '1,000자 내외', guide: '공백 포함 약 1,000자(±10%).' },
        medium: { label: '보통', sub: '1,500자 내외', guide: '공백 포함 약 1,500자(±10%).' },
        long: { label: '길게', sub: '2,000자 이상', guide: '공백 포함 2,000~2,500자.' },
        xlong: { label: '아주 길게', sub: '3,000자 이상', guide: '공백 포함 3,000~3,500자. 섹션별로 충분히 구체적으로.' },
      },
    },
    tone: {
      title: '톤앤매너', type: 'single', step: 'basic', default: 'friendly',
      placeholder: '예: 시크한 반말체, 할머니가 손주에게 말하듯',
      options: {
        friendly: { label: '친근한', sub: '해요체', guide: '"~해요" 해요체로, 이웃에게 이야기하듯 편안하게.' },
        professional: { label: '전문적인', sub: '하십시오체', guide: '"~합니다" 하십시오체로, 객관적이고 신뢰감 있게. 감탄사·이모지 자제.' },
        emotional: { label: '감성적인', sub: '에세이톤', guide: '감각적 묘사와 개인적 감상을 담아 잔잔하게. 평서문 위주.' },
        mz: { label: '톡톡 튀는', sub: 'MZ 밈', guide: '짧은 문장, 유행어·밈("갓성비", "찐템" 등)을 문단당 1~2회만 섞어 경쾌하게.' },
        plain: { label: '담백한', sub: '군더더기 없이', guide: '수식어를 줄이고 사실 위주로 간결하게. 해요체.' },
        humor: { label: '유머러스한', sub: '드립 한 스푼', guide: '자연스러운 자기 디스나 상황 유머를 곳곳에 섞되, 정보 전달을 해치지 않는다.' },
        analytic: { label: '꼼꼼한 분석형', sub: '근거 중심', guide: '항목마다 근거·비교 기준을 제시하는 분석적 문체. 해요체.' },
      },
    },

    points: {
      title: '강조 포인트', type: 'multi', step: 'content', hint: '분야에 맞춰 바뀌어요',
      placeholder: '쉼표로 여러 개, 예: 무선 충전, 그립감',
      // options는 분야(category)에 따라 동적으로 생성 → optionsFor()
    },
    sections: {
      title: '포함할 구성', type: 'multi', step: 'content', hint: '글 유형에 맞춰 추천돼요',
      placeholder: '예: 구매 전 체크리스트, 실패담',
      options: {
        firstimpr: { label: '첫인상·언박싱' }, spec: { label: '스펙·기본 정보 표' }, proscons: { label: '장단점 정리' },
        cons: { label: '솔직한 아쉬운 점' }, compare: { label: '경쟁 제품 비교' }, target: { label: '추천/비추천 대상' },
        tips: { label: '활용 팁' }, price: { label: '가격·구매처 정보' }, faq: { label: 'FAQ' },
        rating: { label: '항목별 별점' }, summary: { label: '한 줄 총평' },
      },
    },
    honesty: {
      title: '솔직함 수위', type: 'single', step: 'content', default: 'balanced',
      placeholder: '예: 단점은 언급하지 않기',
      options: {
        positive: { label: '칭찬 위주', guide: '장점 위주로 쓰되, 신뢰를 위해 가벼운 아쉬움 1개만 언급한다.' },
        balanced: { label: '균형 있게', sub: '장점 7 : 단점 3', guide: '장점과 단점을 7:3 비율로 균형 있게 다룬다.' },
        critical: { label: '냉정하게', guide: '단점도 구체적으로 짚는 냉정한 평가. 다만 근거 없는 비난은 하지 않는다.' },
      },
    },
    usage: {
      title: '경험 기간', type: 'single', step: 'content', default: 'none',
      placeholder: '예: 2주간 출퇴근길에 사용',
      options: {
        none: { label: '지정 안 함', guide: null }, first: { label: '첫 사용·개봉 직후' }, week: { label: '1주 사용' },
        month: { label: '1개월 사용' }, long: { label: '3개월 이상' }, again: { label: '재구매·재방문' },
      },
    },

    persona: {
      title: '화자(글쓴이)', type: 'single', step: 'detail', default: 'none',
      placeholder: '예: 재택근무하는 30대 디자이너',
      options: {
        none: { label: '지정 안 함', guide: null }, office: { label: '20~30대 직장인' }, parent: { label: '육아 중인 부모' },
        student: { label: '학생·자취생' }, couple: { label: '신혼·커플' }, middle: { label: '40~50대' },
        expert: { label: '업계 전문가' }, geek: { label: '얼리어답터·덕후' },
      },
    },
    audience: {
      title: '타깃 독자', type: 'multi', step: 'detail', default: ['considering'],
      placeholder: '예: 손목 통증 있는 사람',
      options: {
        beginner: { label: '처음 알아보는 입문자' }, considering: { label: '구매·방문 고민 중' }, value: { label: '가성비 중시' },
        premium: { label: '프리미엄 선호' }, gift: { label: '선물 고민' }, family: { label: '가족 단위' }, solo: { label: '1인 가구' },
      },
    },
    title: {
      title: '제목 스타일', type: 'single', step: 'detail', default: 'seo',
      placeholder: '예: 질문형으로 끝내기',
      options: {
        seo: { label: '키워드 앞배치', sub: 'SEO', guide: '첫 번째 필수 키워드를 제목 맨 앞에 둔다.' },
        curiosity: { label: '궁금증 유발', guide: '결론을 감춰 클릭하고 싶게 만드는 제목.' },
        number: { label: '숫자·리스트형', guide: '"N가지", "TOP N"처럼 숫자를 넣은 제목.' },
        honest: { label: '솔직 후기 강조', guide: '"내돈내산 느낌의 솔직 후기"임이 드러나는 제목(단, 협찬이면 "내돈내산" 표현 금지).' },
        poetic: { label: '감성 문장형', guide: '한 문장의 감성적인 카피 같은 제목.' },
      },
    },
    format: {
      title: '형식 요소', type: 'multi', step: 'detail', hint: '플랫폼에 맞춰 추천돼요',
      placeholder: '예: 마지막에 체크리스트 넣기',
      options: {
        images: { label: '사진 자리표시자', guide: '2~4문장마다 [사진: 촬영할 장면 설명] 자리표시자를 넣는다.' },
        bold: { label: '핵심 문장 굵게', guide: '섹션별 핵심 문장 1개를 **굵게** 표시한다.' },
        hashtags: { label: '해시태그', guide: '본문 끝에 키워드 기반 해시태그를 한 줄로 붙인다(인스타그램은 20~30개, 그 외 5~10개).' },
        table: { label: '표 활용', guide: '스펙·비교·가격 정보는 마크다운 표로 정리한다.' },
        toc: { label: '목차', guide: '도입부 다음에 소제목 목차를 넣는다.' },
        quote: { label: '인용구 강조', guide: '인상 깊은 한 문장을 > 인용구로 강조한다.' },
        titles3: { label: '제목 후보 3개', guide: '제목을 1개가 아니라 서로 다른 스타일의 후보 3개로 제시한다.' },
        meta: { label: '메타 설명', guide: '글 맨 끝에 "메타 설명:"으로 150자 이내 검색 요약문을 별도 제공한다.' },
      },
    },
    emoji: {
      title: '이모지', type: 'single', step: 'detail', default: 'light',
      placeholder: '예: 하트 이모지만',
      options: {
        none: { label: '사용 안 함', guide: '이모지를 전혀 사용하지 않는다.' },
        light: { label: '적당히', guide: '소제목이나 강조 지점에만 이모지를 가볍게 쓴다.' },
        many: { label: '풍부하게', guide: '문장마다 어울리는 이모지를 적극적으로 쓴다.' },
      },
    },
    cta: {
      title: '마무리 유도', type: 'single', step: 'detail', default: 'none',
      placeholder: '예: 다음 편 예고',
      options: {
        none: { label: '없음', guide: null }, comment: { label: '댓글·공감 유도' }, follow: { label: '이웃추가·구독 유도' },
        link: { label: '구매·예약 링크 안내' }, related: { label: '관련 글 안내' },
      },
    },
  };

  const FEEDBACK_CHIPS = {
    shorter: '전체 분량을 약 20~30% 줄인다.',
    longer: '경험 묘사와 디테일을 보강해 분량을 약 30% 늘린다.',
    lessAd: '광고·홍보 느낌이 나는 과장 표현을 줄이고 실제 사용자 말투로 바꾼다.',
    honest: '단점과 아쉬운 점을 더 솔직하고 구체적으로 쓴다.',
    vivid: '구체적인 상황·감각 묘사를 더해 경험담을 생생하게 만든다.',
    shortPara: '문단을 더 잘게 나누고 문장을 짧게 끊는다.',
    keyword: '키워드가 억지로 들어간 부분을 자연스러운 문장으로 고친다.',
    intro: '도입부를 첫 2문장 안에 독자를 붙잡도록 더 강하게 쓴다.',
    ending: '마무리를 더 깔끔하고 여운 있게 정리한다.',
    newTitle: '본문은 유지하고 제목만 더 매력적으로 새로 쓴다.',
  };
  const FEEDBACK_LABELS = {
    shorter: '더 짧게', longer: '더 길게', lessAd: '광고 티 줄이기', honest: '더 솔직하게', vivid: '경험담 생생하게',
    shortPara: '문단 짧게', keyword: '키워드 자연스럽게', intro: '도입부 강하게', ending: '마무리 깔끔하게', newTitle: '제목만 다시',
  };

  // ---------- 유틸 ----------
  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const splitList = (raw) =>
    String(raw || '').split(/[,，\n]/).map((k) => k.trim()).filter(Boolean).filter((k, i, a) => a.indexOf(k) === i);
  const parseKeywords = splitList;
  const asList = (lines) => [].concat(lines).filter(Boolean).map((l) => `- ${l}`).join('\n');
  const slug = (s) => 'p_' + Array.from(s).map((c) => c.charCodeAt(0).toString(36)).join('');

  /** 그룹의 현재 옵션 목록 (강조 포인트는 분야에 따라 동적) */
  function optionsFor(groupKey, sel) {
    if (groupKey !== 'points') return GROUPS[groupKey].options;
    const list = POINTS[sel && sel.category] || ['디자인', '품질', '사용 편의성', '가격·가성비', '내구성'];
    return Object.fromEntries(list.map((label) => [slug(label), { label }]));
  }

  /** 의존 그룹의 추천 기본값 */
  function presetFor(groupKey, sel) {
    if (groupKey === 'sections') return SECTION_PRESETS[sel.postType] || ['proscons', 'summary'];
    if (groupKey === 'format') return FORMAT_PRESETS[sel.platform] || ['bold'];
    if (groupKey === 'points') return Object.keys(optionsFor('points', sel)).slice(0, 3);
    const d = GROUPS[groupKey].default;
    return Array.isArray(d) ? d.slice() : d;
  }

  function defaultSelection() {
    const sel = {};
    for (const key of ['postType', 'category', 'platform']) sel[key] = GROUPS[key].default;
    for (const key of Object.keys(GROUPS)) if (!(key in sel)) sel[key] = presetFor(key, sel);
    return sel;
  }

  /** 선택값을 [{label, guide, custom}]로 해석. 알 수 없는 키는 무시. */
  function resolve(form, groupKey) {
    const g = GROUPS[groupKey];
    const sel = (form.sel || {})[groupKey];
    const opts = optionsFor(groupKey, form.sel || {});
    let keys = [].concat(sel == null ? [] : sel);
    // 다중 선택은 클릭 순서가 아니라 화면에 보이는 순서로(직접 입력은 마지막)
    if (g.type === 'multi') keys = Object.keys(opts).filter((k) => keys.includes(k)).concat(keys.includes(CUSTOM) ? [CUSTOM] : []);
    const out = [];
    for (const k of keys) {
      if (k === CUSTOM) {
        const text = clean((form.custom || {})[groupKey], LIMITS.custom);
        if (!text) continue;
        const items = g.type === 'multi' ? splitList(text) : [text];
        items.forEach((t) => out.push({ label: t, guide: t, custom: true }));
      } else if (opts[k]) {
        const o = opts[k];
        out.push({ label: o.sub ? `${o.label}(${o.sub})` : o.label, guide: o.guide === undefined ? o.label : o.guide });
      }
    }
    return out;
  }
  const labels = (form, key) => resolve(form, key).map((r) => r.label).join(', ');
  const guides = (form, key) => resolve(form, key).flatMap((r) => (r.guide == null ? [] : [].concat(r.guide)));

  /** 입력 검증. 오류 메시지 배열(빈 배열이면 통과). */
  function validate(form) {
    const errors = [];
    if (!clean(form.subject, LIMITS.subject)) errors.push('대상/제품명을 입력해 주세요.');
    for (const key of ['postType', 'category', 'platform', 'length', 'tone']) {
      if (!resolve(form, key).length) errors.push(`'${GROUPS[key].title}'을(를) 선택하거나 직접 입력해 주세요.`);
    }
    return errors;
  }

  // ---------- 프롬프트 ----------
  const SYSTEM = [
    '당신은 10년 차 전문 블로그 콘텐츠 작가이자 SEO 카피라이터입니다.',
    '실제 사람이 쓴 것처럼 자연스럽고, 광고 티가 과하지 않으며, 독자가 끝까지 읽고 싶어지는 글을 씁니다.',
    '사실을 지어내지 말고, 모르는 구체 수치(가격, 스펙, 주소 등)는 [확인 필요]로 남깁니다.',
    '출력은 블로그 글만 작성하며, 앞뒤에 설명이나 인사말을 붙이지 않습니다.',
  ].join('\n');

  function buildPrompt(form) {
    const has = (key) => resolve(form, key).length > 0;
    const keywords = splitList(clean(form.keywords, LIMITS.keywords));
    const extra = clean(form.extra, LIMITS.extra);
    const typeR = resolve(form, 'postType')[0];
    const catR = resolve(form, 'category')[0];
    const usageG = guides(form, 'usage');
    const personaG = guides(form, 'persona');

    const info = [
      `대상/제품명: ${clean(form.subject, LIMITS.subject)}`,
      `글 유형: ${typeR.label}`,
      `분야: ${catR.label} — 이 분야 독자가 중요하게 보는 정보를 우선한다.`,
      `플랫폼: ${labels(form, 'platform')}`,
      has('audience') && `타깃 독자: ${labels(form, 'audience')} — 이 독자의 고민과 상황에 맞춰 설명한다.`,
      usageG.length && `경험 기간: ${usageG.join(', ')} — 이 기간 동안 써 본 사람의 시점으로 쓴다.`,
    ];

    const typeGuide = typeR.custom
      ? [`사용자 지정 글 유형: "${typeR.label}". 이 유형에 가장 적합한 구성을 스스로 설계한다.`]
      : guides(form, 'postType');

    const sections = resolve(form, 'sections');
    const content = [
      sections.length && `다음 구성을 이 순서로 포함한다(소제목은 자연스럽게 바꿔도 됨): ${sections.map((s) => s.label).join(' → ')}`,
      has('points') && `강조 포인트(가장 비중 있게 다룸): ${labels(form, 'points')}`,
      ...guides(form, 'honesty'),
    ];

    const style = [
      ...guides(form, 'tone'),
      personaG.length && `글쓴이는 "${personaG.join(', ')}" 입장이다. 자신의 생활 맥락을 자연스럽게 녹인다.`,
    ];

    const formatting = [...guides(form, 'platform'), ...guides(form, 'format'), ...guides(form, 'emoji')];

    const seo = keywords.length
      ? [
          `필수 키워드: ${keywords.map((k) => `"${k}"`).join(', ')}`,
          '각 키워드를 본문에 2회 이상 자연스럽게 포함한다(억지 나열 금지).',
        ]
      : ['지정 키워드 없음. 대상명을 중심으로 자연스럽게 작성한다.'];

    const cta = guides(form, 'cta');

    const blocks = [
      ['기본 정보', info],
      ['글 유형 가이드', typeGuide],
      ['내용 구성', content],
      ['문체', style],
      ['형식', formatting],
      ['분량', guides(form, 'length')],
      ['제목', guides(form, 'title')],
      ['SEO 키워드', seo],
      ['마무리', cta.length ? [`글 끝에 다음 행동을 자연스럽게 유도한다: ${cta.join(', ')}`] : []],
    ].filter(([, lines]) => lines.filter(Boolean).length);

    let user = '다음 조건에 맞춰 블로그 포스팅을 작성해 주세요.\n\n';
    user += blocks.map(([t, lines], i) => `## ${i + 1}. ${t}\n${asList(lines)}`).join('\n\n');
    user += `\n\n## ${blocks.length + 1}. 특별 요청사항 및 강조점 (최우선 반영)\n`;
    user += extra ? extra.split('\n').map((l) => `> ${l}`).join('\n') : '- 없음';
    user += `\n\n## ${blocks.length + 2}. 출력 형식
- 첫 줄: "제목: ..." (제목 후보를 여러 개 요청받은 경우 "제목 후보:" 아래 목록)
- 이후: 본문
- 특별 요청사항이 다른 조건과 충돌하면 특별 요청사항을 우선한다.`;

    return { system: SYSTEM, user };
  }

  /**
   * 기존 글 수정용 프롬프트.
   * feedback이 비어 있으면 '문장만 다듬기', 있으면 '피드백 반영 수정'.
   */
  function buildRevisePrompt(form, previousText, feedback) {
    const base = buildPrompt(form);
    const chips = [].concat((feedback && feedback.chips) || []).filter((k) => FEEDBACK_CHIPS[k]);
    const note = clean(feedback && feedback.text, LIMITS.feedback);
    const isFeedback = chips.length > 0 || note.length > 0;

    const rules = isFeedback
      ? [
          '아래 피드백을 반드시 반영한다. 피드백이 원래 작성 조건과 충돌하면 피드백을 우선한다.',
          ...chips.map((k) => FEEDBACK_CHIPS[k]),
          note && `사용자 피드백: "${note}"`,
          '피드백과 무관한 부분(구조, 사실관계, 고지 문구, 형식 요소)은 최대한 유지한다.',
        ]
      : [
          '전체 구조, 소제목 순서, 핵심 내용과 사실관계는 그대로 유지한다.',
          '어색한 문장, 반복 표현, 늘어지는 문장만 자연스럽게 고친다.',
          '분량은 초안과 ±10% 이내로 유지하고, 형식 요소는 보존한다.',
        ];

    const user = `${base.user}

---
## [${isFeedback ? '피드백 반영 수정' : '문장 다듬기'} 모드]
아래는 위 조건으로 이미 작성된 글입니다. 다음 규칙에 따라 수정한 전체 글을 출력해 주세요.
${asList(rules)}

### 기존 글
"""
${String(previousText || '').trim()}
"""`;
    return { system: base.system, user };
  }

  return {
    CUSTOM, LIMITS, GROUPS, FEEDBACK_LABELS,
    optionsFor, presetFor, defaultSelection, resolve, parseKeywords, validate, buildPrompt, buildRevisePrompt,
  };
});
