/**
 * 프롬프트 조립 모듈 — 브라우저(window.PromptBuilder)와 Node(require) 양쪽에서 사용.
 * 버튼 선택값(key)을 LLM이 실행 가능한 구체적 지시문으로 변환한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PromptBuilder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPTIONS = {
    postType: {
      sponsored: {
        label: '제품 협찬 리뷰',
        guide: [
          '제품을 직접 사용해 본 실사용 후기 형식으로 작성한다.',
          '구성: 첫인상/언박싱 → 핵심 기능 체험 → 장점 → 아쉬운 점(1개 이상, 솔직하게) → 추천 대상.',
          '글 하단에 "본 포스팅은 업체로부터 제품을 제공받아 작성되었습니다." 고지 문구를 반드시 넣는다.',
        ],
      },
      experience: {
        label: '서비스 체험단',
        guide: [
          '서비스를 체험한 과정을 시간 순서로 생생하게 서술한다.',
          '구성: 신청/예약 과정 → 이용 과정 → 인상 깊었던 포인트 → 가격·가성비 → 재이용 의사.',
          '글 하단에 "본 포스팅은 체험단으로 서비스를 제공받아 작성되었습니다." 고지 문구를 반드시 넣는다.',
        ],
      },
      info: {
        label: '정보성 포스팅',
        guide: [
          '독자의 궁금증을 해결하는 정보 전달이 최우선 목적이다.',
          '구성: 도입(왜 알아야 하는가) → 핵심 정보 3~5개 소제목 → 비교/팁 → 요약 정리.',
          '사실 확인이 필요한 수치는 단정하지 말고 "확인 필요" 수준으로 표현한다.',
        ],
      },
      visit: {
        label: '방문 후기',
        guide: [
          '직접 방문한 장소의 후기를 현장감 있게 작성한다.',
          '구성: 위치·찾아가는 법 → 외관/분위기 → 메뉴·시설·서비스 → 장단점 → 방문 팁(주차, 웨이팅, 추천 시간대).',
        ],
      },
    },
    tone: {
      friendly: { label: '친근한(해요체)', guide: '"~해요", "~했어요" 해요체로, 이웃에게 이야기하듯 편안하게 쓴다.' },
      professional: { label: '전문적인(하십시오체)', guide: '"~합니다", "~입니다" 하십시오체로, 객관적이고 신뢰감 있게 쓴다. 감탄사·이모지는 쓰지 않는다.' },
      emotional: { label: '감성적인(에세이톤)', guide: '에세이처럼 감각적 묘사와 개인적 감상을 담아 잔잔하게 쓴다. 평서문 위주.' },
      mz: { label: '톡톡 튀는(MZ 밈)', guide: '짧은 문장, 적절한 유행어·밈(예: "킹받는", "갓성비", "찐템")과 이모지를 활용해 경쾌하게 쓴다. 과하지 않게, 문단당 1~2회.' },
    },
    platform: {
      naver: {
        label: '네이버 블로그',
        guide: [
          '이미지와 텍스트가 반복되는 구조로 작성한다.',
          '2~4문장마다 [사진: 촬영할 장면 설명] 형태의 이미지 자리표시자를 넣는다.',
          '문단은 짧게, 줄바꿈을 자주 사용해 모바일 가독성을 높인다.',
          '본문 끝에 필수 키워드 기반 해시태그 5~10개를 한 줄로 붙인다.',
        ],
      },
      tistory: {
        label: '티스토리',
        guide: [
          '검색 유입(SEO)을 고려한 정보 전달형 구조로 작성한다.',
          '마크다운 소제목(##, ###)으로 계층을 명확히 나눈다.',
          '필요한 곳에 목록(-)이나 표를 사용하고, 마지막에 "## 한눈에 정리" 요약 섹션을 둔다.',
          '첫 문단에 핵심 키워드와 글의 결론을 먼저 제시한다.',
        ],
      },
    },
    length: {
      short: { label: '짧게', guide: '공백 포함 약 1,000자(±10%) 분량.' },
      medium: { label: '보통', guide: '공백 포함 약 1,500자(±10%) 분량.' },
      long: { label: '길게', guide: '공백 포함 2,000자 이상(2,000~2,500자) 분량.' },
    },
  };

  const DEFAULT_STATE = { postType: 'sponsored', tone: 'friendly', platform: 'naver', length: 'medium' };

  const parseKeywords = (raw) =>
    String(raw || '')
      .split(/[,，\n]/)
      .map((k) => k.trim())
      .filter(Boolean)
      .filter((k, i, arr) => arr.indexOf(k) === i);

  const asList = (lines) => [].concat(lines).map((l) => `- ${l}`).join('\n');

  function pick(group, key) {
    const opt = OPTIONS[group][key];
    if (!opt) throw new Error(`알 수 없는 옵션: ${group}=${key}`);
    return opt;
  }

  /** 입력 검증. 오류 메시지 배열 반환(빈 배열이면 통과). */
  function validate(form) {
    const errors = [];
    if (!String(form.subject || '').trim()) errors.push('대상/제품명을 입력해 주세요.');
    for (const group of Object.keys(OPTIONS)) {
      if (!OPTIONS[group][form[group]]) errors.push(`${group} 옵션을 선택해 주세요.`);
    }
    return errors;
  }

  /** 신규 생성용 프롬프트 → { system, user } */
  function buildPrompt(form) {
    const type = pick('postType', form.postType);
    const tone = pick('tone', form.tone);
    const platform = pick('platform', form.platform);
    const length = pick('length', form.length);
    const keywords = parseKeywords(form.keywords);
    const extra = String(form.extra || '').trim();

    const system = [
      '당신은 10년 차 전문 블로그 콘텐츠 작가이자 SEO 카피라이터입니다.',
      '실제 사람이 쓴 것처럼 자연스럽고, 광고 티가 과하지 않으며, 독자가 끝까지 읽고 싶어지는 글을 씁니다.',
      '사실을 지어내지 말고, 모르는 구체 수치(가격, 스펙 등)는 [확인 필요] 표시로 남깁니다.',
      '출력은 블로그 본문만 작성하며, 글 앞뒤에 설명이나 인사말을 붙이지 않습니다.',
    ].join('\n');

    const user = `다음 조건에 맞춰 블로그 포스팅을 작성해 주세요.

## 1. 기본 정보
- 대상/제품명: ${String(form.subject).trim()}
- 글 유형: ${type.label}
- 플랫폼: ${platform.label}

## 2. 글 유형 가이드
${asList(type.guide)}

## 3. 톤앤매너
${asList(tone.guide)}

## 4. 플랫폼 형식
${asList(platform.guide)}

## 5. 분량
${asList(length.guide)}

## 6. SEO 키워드
${
  keywords.length
    ? asList([
        `필수 키워드: ${keywords.map((k) => `"${k}"`).join(', ')}`,
        '각 키워드를 본문에 최소 2회 이상 자연스럽게 포함한다(억지 나열 금지).',
        `제목에는 "${keywords[0]}"를 반드시 포함한다.`,
      ])
    : '- 지정 키워드 없음. 대상명을 중심으로 자연스럽게 작성한다.'
}

## 7. 특별 요청사항 및 강조점 (최우선 반영)
${extra ? extra.split('\n').map((l) => `> ${l}`).join('\n') : '- 없음'}

## 8. 출력 형식
- 첫 줄: 클릭을 부르는 제목 1개 (형식: "제목: ...")
- 이후: 본문
- 위 모든 조건 중 7번 요청사항이 다른 조건과 충돌하면 7번을 우선한다.`;

    return { system, user };
  }

  /** '다시 생성하기'용: 기존 글의 구조·맥락을 유지한 채 표현만 다듬는 프롬프트 */
  function buildRefinePrompt(form, previousText) {
    const base = buildPrompt(form);
    const user = `${base.user}

---
## [리라이팅 모드]
아래는 이미 작성된 초안입니다. 다음 규칙으로 다듬어 주세요.
- 전체 구조, 소제목 순서, 핵심 내용과 사실관계는 그대로 유지한다.
- 어색한 문장, 반복 표현, 늘어지는 문장만 자연스럽게 고친다.
- 분량은 초안과 ±10% 이내로 유지한다.
- 이미지 자리표시자, 고지 문구, 해시태그 등 형식 요소는 보존한다.

### 초안
"""
${String(previousText || '').trim()}
"""`;
    return { system: base.system, user };
  }

  return { OPTIONS, DEFAULT_STATE, parseKeywords, validate, buildPrompt, buildRefinePrompt };
});
