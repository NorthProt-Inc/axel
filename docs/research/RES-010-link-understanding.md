# RES-010: Link Understanding 리서치

> Date: 2026-02-09
> Author: Research Division
> Related: FEAT-TOOL-002 (Link Understanding Tool)

## Question

Axel이 대화 중 사용자가 공유한 URL을 자동 감지하고, 해당 웹페이지의 핵심 콘텐츠를 추출하여 대화 컨텍스트에 통합하기 위해 어떤 라이브러리와 아키텍처를 선택해야 하는가? URL 추출, HTML 콘텐츠 정제, DOM 파싱 세 영역에서 최적의 조합을 찾는다.

## Methodology

1. URL 추출 라이브러리 비교 분석
   - linkifyjs: `find()` API, TypeScript 지원, 플러그인 생태계
   - url-regex-safe: regex 기반, ReDoS 보호, 설정 옵션
   - linkify-it (markdown-it 내장): 유니코드 지원, 커스텀 규칙
   - Native URL constructor + regex 직접 구현
2. 콘텐츠 추출/정제 라이브러리 비교
   - Mozilla Readability (`@mozilla/readability`): Firefox Reader View의 standalone 버전
   - Defuddle (`defuddle`): Obsidian Web Clipper 팀의 차세대 추출기
   - 직접 구현 (regex HTML stripping): OpenClaw `web-fetch-utils.ts` 패턴
3. DOM 파서 비교 (Node.js 환경)
   - JSDOM: 가장 완전한 브라우저 에뮬레이션
   - linkedom: 경량 대안, OpenClaw 프로덕션 검증
   - happy-dom: 성능 최적화, vitest 환경에서 인기
4. OpenClaw 코드베이스 분석 (`/home/northprot/projects/openclaw`)
   - `web-fetch.ts`: Readability + linkedom 조합 패턴
   - `web-fetch-utils.ts`: HTML→Markdown 변환, fallback 전략
   - `markdown/ir.ts`: markdown-it `linkify: true` 옵션으로 URL 자동 감지
5. Axel 아키텍처 제약사항 매핑 (TypeScript single stack, pnpm monorepo)

## Findings

### Part 1: URL Extraction

#### Option A: linkifyjs

- **Description**: 플레인 텍스트에서 URL, 이메일, 해시태그, 멘션 등을 감지하는 JavaScript 라이브러리. `find()` API로 프로그래밍적 추출 가능.
- **Version**: 4.x (latest)
- **Size**: ~11kB gzipped
- **TypeScript**: 내장 타입 정의
- **API**:
  ```typescript
  import * as linkify from 'linkifyjs';

  const links = linkify.find("Visit https://example.com for info, email support@test.com");
  // Returns:
  // [
  //   { type: "url", value: "https://example.com", href: "https://example.com", start: 6, end: 26, isLink: true },
  //   { type: "email", value: "support@test.com", href: "mailto:support@test.com", start: 44, end: 60, isLink: true }
  // ]
  ```
- **감지 가능 타입**: URL, email, hashtag (플러그인), mention (플러그인), ticket (플러그인), IPv4 (플러그인), keyword (플러그인)
- **Pros**:
  - 작은 번들 사이즈 (~11kB gzipped)
  - 95%+ 테스트 커버리지
  - 내장 TypeScript 정의
  - `find()` API가 시작/끝 인덱스 포함 — 정밀한 텍스트 위치 추적 가능
  - 플러그인으로 감지 범위 확장 가능 (hashtag, mention 등)
  - 모든 모던 브라우저 + Node.js 호환
- **Cons**:
  - 100% spec-compliant가 아님 — 가끔 false positive/negative 발생
  - 외부 의존성 추가 (core에 불필요한 브라우저 관련 코드 포함)
  - `find()` 이외에 DOM 조작용 API가 대부분 — Axel에서는 `find()`만 필요
- **Sources**:
  - [linkifyjs npm](https://www.npmjs.com/package/linkifyjs)
  - [linkifyjs Documentation](https://linkify.js.org/docs/linkifyjs.html)
  - [GitHub: nfrasser/linkifyjs](https://github.com/nfrasser/linkifyjs)

#### Option B: url-regex-safe

- **Description**: URL 매칭 정규식. url-regex의 보안 강화 fork (CVE-2020-7661 해결). re2 지원으로 ReDoS 방어.
- **Version**: 4.x (latest)
- **TypeScript**: `@types/url-regex-safe` 패키지 필요 (별도 설치)
- **API**:
  ```typescript
  import urlRegexSafe from 'url-regex-safe';

  const regex = urlRegexSafe({ strict: false, localhost: true });
  const text = "Visit https://example.com and http://localhost:3000";
  const matches = text.match(regex);
  // ["https://example.com", "http://localhost:3000"]
  ```
- **설정 옵션**: `exact`, `strict`, `auth`, `localhost`, `parens`, `apostrophes`, `trailingPeriod`, `ipv4`, `ipv6`, `tlds`, `returnString`
- **Pros**:
  - CVE-2020-7661 해결 (url-regex 대비 보안 강화)
  - re2 옵셔널 피어 의존성으로 ReDoS 완전 방어 가능
  - 세밀한 설정 옵션 (auth, localhost, IPv4/IPv6 등)
  - `strict: false`가 기본값 — protocol 없는 URL도 감지
- **Cons**:
  - 타입 정의 별도 패키지 (`@types/url-regex-safe`)
  - `match()` 결과에 시작/끝 인덱스 없음 — 위치 추적 불가 (별도 처리 필요)
  - URL만 감지 (이메일, 멘션 등 미지원)
  - re2 네이티브 모듈 — C++ 컴파일 필요 (CI/CD 환경에서 빌드 시간 증가)
- **Sources**:
  - [url-regex-safe npm](https://www.npmjs.com/package/url-regex-safe)
  - [GitHub: spamscanner/url-regex-safe](https://github.com/spamscanner/url-regex-safe)

#### Option C: linkify-it (markdown-it 내장)

- **Description**: markdown-it의 링크 감지 엔진. 풀 유니코드 지원, 커스텀 규칙 확장 가능.
- **TypeScript**: 내장 타입 정의
- **API**:
  ```typescript
  import LinkifyIt from 'linkify-it';

  const linkify = new LinkifyIt();
  const matches = linkify.match("Visit github.com and test@email.com");
  // [{ schema: "", index: 6, lastIndex: 16, raw: "github.com", text: "github.com", url: "http://github.com" }, ...]
  ```
- **OpenClaw 사용 사례**: `markdown/ir.ts`에서 `markdown-it({ linkify: true })`로 활용 — 메시지 렌더링 시 자동 링크 변환
- **Pros**:
  - 풀 유니코드 지원 (국제화 도메인, astral characters)
  - 커스텀 스키마 규칙 추가 가능
  - markdown-it과 통합 시 추가 의존성 없음
  - fuzzyEmail 기본 활성화
- **Cons**:
  - markdown-it 생태계에 종속 (standalone 사용 시 오버헤드)
  - linkifyjs 대비 플러그인 생태계 제한적
  - API가 markdown-it 파이프라인에 최적화 — 독립 사용 시 보일러플레이트 필요
- **Sources**:
  - [GitHub: markdown-it/linkify-it](https://github.com/markdown-it/linkify-it)
  - [linkify-it Demo](https://markdown-it.github.io/linkify-it/)

#### Option D: Native URL + Regex 직접 구현

- **Description**: `new URL()` constructor + 커스텀 regex로 URL 추출. 외부 의존성 없음.
- **API**:
  ```typescript
  // Simple regex-based approach
  const URL_REGEX = /https?:\/\/[^\s<>\"')\]]+/gi;

  function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX) ?? [];
    return matches.filter(url => {
      try { new URL(url); return true; }
      catch { return false; }
    });
  }
  ```
- **OpenClaw 참조**: `web-fetch.ts` line 391-398에서 `new URL(params.url)`로 URL 유효성 검증
- **Pros**:
  - 외부 의존성 제로
  - 번들 사이즈 영향 없음
  - 완전한 제어 (regex 커스터마이징 자유)
  - `new URL()` 사용 시 RFC 3986 준수 검증
- **Cons**:
  - Protocol 없는 URL 감지 어려움 (`github.com` 같은 bare domain)
  - Edge case 처리 부담 (괄호 내 URL, 문장 끝 마침표, 유니코드 도메인)
  - 이메일 주소 감지 별도 구현 필요
  - ReDoS 취약점 직접 관리해야 함
- **Sources**:
  - [MDN: URL constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL)
  - OpenClaw: `/home/northprot/projects/openclaw/src/agents/tools/web-fetch.ts` (lines 390-398)

### Part 2: Content Extraction / Readability

#### Option A: Mozilla Readability (`@mozilla/readability`)

- **Description**: Firefox Reader View의 standalone JavaScript 라이브러리. 2015년부터 유지보수, Mozilla 공식 프로젝트.
- **Version**: 0.6.0 (latest, 2025년 4월)
- **npm**: `@mozilla/readability`
- **Weekly Downloads**: ~321 의존 프로젝트
- **DOM 의존성**: 필수 — JSDOM, linkedom, happy-dom 등 외부 DOM 구현 필요
- **API**:
  ```typescript
  import { Readability } from '@mozilla/readability';
  import { parseHTML } from 'linkedom';

  const { document } = parseHTML(html);
  const reader = new Readability(document, { charThreshold: 0 });
  const article = reader.parse();
  // { title, content (HTML), textContent, length, excerpt, byline, dir, siteName, publishedTime }
  ```
- **주요 옵션**: `debug`, `maxElemsToParse`, `charThreshold` (기본 500), `classesToPreserve`, `keepClasses`, `serializer`, `disableJSONLD`, `allowedVideoRegex`
- **OpenClaw 사용**: `web-fetch-utils.ts` line 97-121에서 Readability + linkedom 조합으로 HTML 추출
  ```typescript
  // OpenClaw pattern
  const [{ Readability }, { parseHTML }] = await Promise.all([
    import("@mozilla/readability"),
    import("linkedom"),
  ]);
  const { document } = parseHTML(params.html);
  const reader = new Readability(document, { charThreshold: 0 });
  const parsed = reader.parse();
  ```
- **Pros**:
  - **Production-proven**: Firefox Reader View 수억 명 사용자 기반
  - OpenClaw에서 프로덕션 검증 완료 (linkedom 조합)
  - 안정적인 API — 2015년부터 유지보수
  - `charThreshold` 등 튜닝 옵션
  - MIT 라이센스
  - 최소한의 의존성 (DOM 구현만 필요)
- **Cons**:
  - **보수적 추출**: 콘텐츠가 충분하지 않다고 판단하면 null 반환 (charThreshold 500 기본값)
  - Markdown 출력 미지원 — HTML만 반환, 별도 변환 필요
  - 메타데이터 추출 제한적 (schema.org 미지원)
  - DOM 구현 외부 의존성 필수
  - 최근 업데이트 빈도 낮음 (0.6.0 이후 10개월+)
- **Sources**:
  - [@mozilla/readability npm](https://www.npmjs.com/package/@mozilla/readability)
  - [GitHub: mozilla/readability](https://github.com/mozilla/readability)
  - [Readability API Docs](https://github.com/mozilla/readability#api-reference)

#### Option B: Defuddle

- **Description**: Obsidian Web Clipper 팀이 개발한 차세대 웹 콘텐츠 추출기. Readability의 한계를 극복하기 위해 설계. Multi-pass detection, 모바일 스타일 인식, Markdown 직접 출력 지원.
- **Version**: 0.6.6 (latest, 2026년 2월)
- **npm**: `defuddle`
- **Author**: kepano (Obsidian CEO Steph Ango)
- **DOM 의존성**: Node.js 번들(`defuddle/node`)은 JSDOM 필수
- **API**:
  ```typescript
  import { JSDOM } from 'jsdom';
  import { Defuddle } from 'defuddle/node';

  // From HTML string
  const result = await Defuddle(html);

  // From URL via JSDOM
  const dom = await JSDOM.fromURL('https://example.com/article');
  const result = await Defuddle(dom, url, {
    debug: false,
    markdown: true,  // HTML→Markdown 자동 변환
  });

  // result: { title, content, author, description, domain, favicon, image,
  //           published, site, schemaOrgData, wordCount, parseTime, metaTags }
  ```
- **주요 옵션**: `debug`, `url`, `markdown` (Markdown 출력), `separateMarkdown`, `removeExactSelectors`, `removePartialSelectors`, `removeImages`
- **세 가지 번들**:
  - `defuddle` (core): 브라우저용, 의존성 없음
  - `defuddle/full`: 수학 수식 파싱 추가
  - `defuddle/node`: Node.js용, JSDOM 기반, Markdown 변환 포함
- **Pros**:
  - **Multi-pass detection**: 첫 번째 시도 실패 시 대안 전략으로 자동 재시도
  - **Markdown 직접 출력**: `markdown: true`로 HTML→Markdown 변환 내장 (Turndown 기반)
  - **Rich metadata**: schema.org, author, published, description, favicon, image 등 포괄적 추출
  - **모바일 스타일 인식**: CSS `@media` 쿼리로 모바일에서 숨겨지는 불필요 요소 제거
  - HTML 표준화: heading normalization, code block 정제, footnote 변환
  - Readability 대비 더 관대한 추출 — 콘텐츠 유실 가능성 낮음
  - 활발한 개발 (Obsidian Web Clipper에서 프로덕션 사용)
  - MIT 라이센스
- **Cons**:
  - **JSDOM 의존성** (Node.js 번들): JSDOM은 ~13MB 설치 크기, 50-65MB RAM 사용, 느린 파싱
  - 상대적으로 신생 프로젝트 (2025년 5월 공개) — 엣지 케이스 커버리지 미검증
  - 공식 벤치마크/테스트 데이터셋 미제공
  - linkedom 미지원 — JSDOM 전용 (Node.js 번들)
  - `"type": "module"` 필수 — CJS 프로젝트와의 호환성 주의
  - OpenClaw에서 미사용 — 프로덕션 검증 부족
- **Sources**:
  - [defuddle npm](https://www.npmjs.com/package/defuddle)
  - [GitHub: kepano/defuddle](https://github.com/kepano/defuddle)
  - [Defuddle — Steph Ango](https://stephango.com/defuddle)
  - [Defuddle vs Readability — BigGo News](https://biggo.com/news/202505240122_Defuddle_Web_Content_Extractor)
  - [Defuddle HN Discussion](https://news.ycombinator.com/item?id=44067409)
  - [Defuddle vs Postlight Parser Comparison](https://jocmp.com/2025/07/12/full-content-extractors-comparing-defuddle/)

#### Option C: 직접 구현 (Regex HTML Stripping)

- **Description**: OpenClaw `web-fetch-utils.ts`의 패턴. regex로 script/style 제거, HTML 태그→Markdown 변환, entity 디코딩.
- **OpenClaw 구현**:
  ```typescript
  // web-fetch-utils.ts — htmlToMarkdown()
  function htmlToMarkdown(html: string): { text: string; title?: string } {
    // 1. title 추출
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    // 2. script, style, noscript 제거
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    // 3. <a> → [label](href) 변환
    text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, ...);
    // 4. <h1>-<h6> → # heading 변환
    // 5. <li> → - item 변환
    // 6. 나머지 태그 strip
    text = stripTags(text);
    return { text: normalizeWhitespace(text), title };
  }
  ```
- **Pros**:
  - 외부 의존성 제로 (DOM 파서 불필요)
  - 매우 빠른 실행 속도 (regex만 사용)
  - 완전한 제어 — Axel 요구사항에 정확히 맞춤 가능
  - OpenClaw에서 Readability fallback으로 프로덕션 검증
- **Cons**:
  - 정확도 낮음: 네비게이션, 사이드바, 광고 등 구분 불가 (main content 식별 불가)
  - 복잡한 HTML 구조 처리 한계 (nested elements, malformed HTML)
  - Edge case 축적 — 유지보수 부담 증가
  - Readability/Defuddle 대비 추출 품질 크게 열위
- **Sources**:
  - OpenClaw: `/home/northprot/projects/openclaw/src/agents/tools/web-fetch-utils.ts`

### Part 3: DOM Parser (Node.js)

#### Option A: JSDOM

- **Description**: 가장 완전한 브라우저 에뮬레이션. 다양한 웹 표준 구현.
- **Version**: 26.x (latest)
- **npm**: `jsdom`
- **설치 크기**: ~13MB (의존성 포함 ~22MB)
- **메모리**: require 시 50-65MB RAM 할당, 대용량 문서에서 1GB+ 가능
- **Pros**:
  - 가장 높은 브라우저 호환성 (CSS, Layout 부분 지원)
  - Defuddle `defuddle/node`의 필수 의존성
  - 가장 많은 npm 의존 프로젝트 (사실상 표준)
  - 풍부한 문서와 커뮤니티
- **Cons**:
  - **심각한 성능 문제**: 12MB HTML에서 9초 파싱, 1GB 힙 사용
  - 50-65MB 기본 메모리 할당 — 서버 환경에서 부담
  - 설치 크기 ~13MB
  - Readability에는 과도한 스펙 — DOM Level 4 대부분 불필요
- **Sources**:
  - [jsdom npm](https://www.npmjs.com/package/jsdom)
  - [GitHub: jsdom/jsdom](https://github.com/jsdom/jsdom)
  - [jsdom Bundlephobia](https://bundlephobia.com/package/jsdom)

#### Option B: linkedom

- **Description**: Triple-linked list 기반 경량 DOM 구현. JSDOM의 1/3 시간, 1/3 힙으로 동일 작업 수행.
- **Version**: 0.18.12 (latest)
- **npm**: `linkedom`
- **성능**: JSDOM 대비 childNodes 크롤 10x 빠름 (230ms vs 2.5s), div 제거 5000x 빠름 (2.6ms vs 15s)
- **OpenClaw 사용**: `web-fetch-utils.ts`에서 Readability와 조합
  ```typescript
  const { parseHTML } = await import("linkedom");
  const { document } = parseHTML(html);
  const reader = new Readability(document, { charThreshold: 0 });
  ```
- **Pros**:
  - **JSDOM 대비 3-10x 빠름**, 1/3 메모리 사용
  - OpenClaw에서 Readability와 프로덕션 검증 완료
  - DOMParser API 기반 — 표준적인 인터페이스
  - 설치 크기 JSDOM 대비 매우 작음
  - 327 npm 의존 프로젝트
- **Cons**:
  - 100% 브라우저 호환이 아님 — 최소/빠른 접근 우선
  - CSS 파싱 미지원 (Defuddle의 모바일 스타일 감지에 영향)
  - Defuddle `defuddle/node`와 호환 불가 (JSDOM 전용)
  - 일부 DOM API 미구현
- **Sources**:
  - [linkedom npm](https://www.npmjs.com/package/linkedom)
  - [GitHub: WebReflection/linkedom](https://github.com/WebReflection/linkedom)
  - [LinkeDOM: A JSDOM Alternative](https://webreflection.medium.com/linkedom-a-jsdom-alternative-53dd8f699311)

#### Option C: happy-dom

- **Description**: 성능 최적화 브라우저 에뮬레이션. vitest에서 JSDOM 대안으로 인기.
- **Version**: 20.5.3 (latest, 2026년 2월)
- **npm**: `happy-dom`
- **Pros**:
  - JSDOM 대비 빠른 DOM 조작
  - 활발한 개발 (매일 업데이트)
  - Custom Elements, Shadow DOM, Fetch API 지원
  - vitest에서 검증된 호환성
- **Cons**:
  - 기능 누락 다수 (HTMLOptionElement 등 trivial API 미구현)
  - DOM 이벤트 순서 불일치 — 프로덕션 환경에서 예기치 못한 동작
  - Readability와의 호환성 미검증 (OpenClaw 미사용)
  - Defuddle과 호환 불가
- **Sources**:
  - [happy-dom npm](https://www.npmjs.com/package/happy-dom)
  - [GitHub: capricorn86/happy-dom](https://github.com/capricorn86/happy-dom)

## Comparison Matrix

### URL Extraction

| Criterion | linkifyjs | url-regex-safe | linkify-it | Native regex |
|-----------|-----------|----------------|------------|--------------|
| **Bundle size** | ~11kB gzip | ~5kB | ~15kB (with markdown-it) | 0kB |
| **TypeScript** | 내장 | `@types` 별도 | 내장 | N/A |
| **URL 감지** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **이메일 감지** | ⭐⭐⭐⭐⭐ | ❌ | ⭐⭐⭐⭐ | 별도 구현 |
| **위치 정보** | ✅ (start/end) | ❌ | ✅ (index/lastIndex) | 별도 구현 |
| **ReDoS 방어** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (re2) | ⭐⭐⭐⭐ | ⭐⭐ (직접 관리) |
| **유니코드** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **확장성** | 플러그인 | 설정 옵션 | 커스텀 규칙 | 자유도 최대 |
| **의존성** | 0 | re2 (optional) | 0 | 0 |

### Content Extraction

| Criterion | Readability | Defuddle | Regex stripping |
|-----------|-------------|----------|-----------------|
| **추출 품질** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Markdown 출력** | ❌ (HTML only) | ✅ (내장) | ⭐⭐ (수동) |
| **메타데이터** | 제한적 | 풍부 (schema.org) | 최소 |
| **DOM 의존** | 필수 | 필수 (JSDOM only) | 불필요 |
| **프로덕션 검증** | ⭐⭐⭐⭐⭐ (Firefox) | ⭐⭐⭐ (Obsidian) | ⭐⭐⭐⭐ (OpenClaw) |
| **Multi-pass** | ❌ | ✅ | ❌ |
| **linkedom 호환** | ✅ | ❌ | N/A |
| **안정성** | ⭐⭐⭐⭐⭐ (10년+) | ⭐⭐⭐ (신생) | ⭐⭐⭐⭐ |
| **번들 크기** | ~50kB | ~100kB + JSDOM 13MB | 0kB |
| **RAM 사용** | linkedom 기준 낮음 | JSDOM 기준 50MB+ | 최소 |

### DOM Parser

| Criterion | JSDOM | linkedom | happy-dom |
|-----------|-------|----------|-----------|
| **파싱 속도** | 느림 (기준) | 3-10x 빠름 | 2-5x 빠름 |
| **메모리** | 50-65MB 기본 | 1/3 JSDOM | JSDOM 이하 |
| **설치 크기** | ~13MB | ~1MB | ~3MB |
| **브라우저 호환** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Readability 호환** | ✅ | ✅ (OpenClaw 검증) | ⚠️ (미검증) |
| **Defuddle 호환** | ✅ (필수) | ❌ | ❌ |
| **OpenClaw 사용** | ❌ | ✅ | ❌ |

## OpenClaw Implementation Patterns

OpenClaw의 Link Understanding 관련 구현을 분석한 결과:

### 1. Readability + linkedom 조합 (검증된 패턴)

```typescript
// web-fetch-utils.ts — extractReadableContent()
const [{ Readability }, { parseHTML }] = await Promise.all([
  import("@mozilla/readability"),  // dynamic import
  import("linkedom"),               // dynamic import
]);
const { document } = parseHTML(params.html);
const reader = new Readability(document, { charThreshold: 0 });
const parsed = reader.parse();
```

**핵심 결정**:
- **linkedom 선택** (JSDOM 대신): 성능 우선, Readability에 JSDOM 수준의 DOM 불필요
- **Dynamic import**: 런타임에 lazy-load하여 초기 부팅 속도 보존
- **`charThreshold: 0`**: Readability의 보수적 필터링 해제, 짧은 콘텐츠도 추출

### 2. Fallback 전략 (3단계)

```
1. Readability + linkedom → 성공 시 사용
2. Readability 실패 → Firecrawl API fallback
3. Firecrawl 미설정/실패 → htmlToMarkdown() regex fallback
```

- Readability가 null 반환 시 Firecrawl SaaS API로 폴백
- Firecrawl도 실패 시 regex 기반 `htmlToMarkdown()` 최후 수단

### 3. External Content Wrapping (Security)

```typescript
import { wrapWebContent } from "../../security/external-content.js";

const wrapped = wrapWebFetchContent(text, params.maxChars);
// <<<EXTERNAL_UNTRUSTED_CONTENT>>> markers
```

- 모든 외부 웹 콘텐츠에 `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` 마커 적용
- Prompt injection 방어 (ADR-019와 일치)

### 4. markdown-it linkify (URL 자동 감지)

```typescript
// markdown/ir.ts
const md = new MarkdownIt({
  html: false,
  linkify: true,  // linkify-it 내장 URL 감지
  breaks: false,
  typographer: false,
});
```

- 메시지 렌더링 파이프라인에서 `linkify: true`로 URL 자동 링크화
- 별도의 URL 추출 라이브러리 미사용 — markdown-it 내장 linkify-it 활용

## Axel Integration Design

### Package Ownership

```
packages/core/src/
├── types/
│   └── link.ts              // LinkInfo, ExtractedContent 타입 정의
├── link/
│   ├── url-extractor.ts     // URL 추출 로직 (순수 함수)
│   └── url-extractor.test.ts
│
packages/infra/src/
├── web/
│   ├── content-extractor.ts     // Readability + linkedom 통합
│   ├── content-extractor.test.ts
│   ├── html-to-markdown.ts      // HTML→Markdown 변환 (fallback)
│   └── html-to-markdown.test.ts
├── tools/
│   ├── link-understand.ts       // Tool 정의 (defineTool)
│   └── link-understand.test.ts
├── security/
│   └── external-content.ts      // wrapExternalContent()
```

**패키지 분리 근거**:
- **packages/core**: URL 추출은 순수 함수, I/O 없음, 도메인 로직
- **packages/infra**: HTTP fetch, DOM 파싱, 외부 라이브러리 의존 — 인프라 레이어

### 타입 정의 (packages/core)

```typescript
// packages/core/src/types/link.ts

/** URL 추출 결과 */
interface ExtractedUrl {
  readonly url: string;
  readonly start: number;
  readonly end: number;
  readonly type: 'url' | 'email';
}

/** 웹 콘텐츠 추출 결과 */
interface ExtractedContent {
  readonly url: string;
  readonly finalUrl: string;
  readonly title: string | undefined;
  readonly content: string;         // Markdown or plain text
  readonly extractMode: 'markdown' | 'text';
  readonly extractor: 'readability' | 'regex-fallback';
  readonly author: string | undefined;
  readonly description: string | undefined;
  readonly publishedAt: string | undefined;
  readonly wordCount: number;
  readonly truncated: boolean;
  readonly fetchedAt: string;       // ISO 8601
  readonly tookMs: number;
}
```

### Data Flow

```
User message
  │
  ├─ 1. URL Extraction (packages/core)
  │     linkifyjs find() → ExtractedUrl[]
  │
  ├─ 2. Content Fetch (packages/infra)
  │     HTTP GET → HTML response
  │
  ├─ 3. Content Extraction (packages/infra)
  │     Readability + linkedom → ExtractedContent
  │     (fallback: regex HTML stripping)
  │
  ├─ 4. Security Wrapping (packages/infra)
  │     wrapExternalContent() → <<<EXTERNAL>>>
  │
  └─ 5. Context Integration (packages/core)
        ExtractedContent → conversation context
```

## Recommendation

### Primary: Readability + linkedom (OpenClaw 검증 패턴)

**콘텐츠 추출 스택**:
- **Content extraction**: `@mozilla/readability` (0.6.0)
- **DOM parser**: `linkedom` (0.18.12)
- **Fallback**: 직접 구현 regex HTML stripping (OpenClaw `htmlToMarkdown()` 패턴)

**근거**:
1. **OpenClaw 프로덕션 검증**: 동일한 Readability + linkedom 조합이 OpenClaw에서 실사용 중
2. **성능**: linkedom은 JSDOM 대비 3-10x 빠르고 1/3 메모리 — 단일 서버 환경에 적합
3. **안정성**: Readability는 Firefox Reader View 기반 10년+ 프로덕션 경험
4. **경량**: linkedom ~1MB vs JSDOM ~13MB, RAM 1/3
5. **Axel 제약 일치**: TypeScript, 최소 의존성, 성능 우선

**URL 추출**: `linkifyjs` (find() API)

**근거**:
1. 내장 TypeScript 정의 — 별도 `@types` 불필요
2. `find()` API가 start/end 인덱스 포함 — 정밀 위치 추적
3. URL + 이메일 동시 감지
4. ~11kB gzipped — 최소 번들 영향
5. 플러그인으로 미래 확장 (멘션, 해시태그)

### Defuddle 채택 보류 이유

Defuddle이 기술적으로 우수한 점이 있지만 현재 단계에서 보류하는 근거:

1. **JSDOM 필수 의존성**: `defuddle/node`는 JSDOM만 지원. JSDOM은 50-65MB RAM, ~13MB 설치 크기로 Axel의 경량 원칙에 반함
2. **프로덕션 미검증**: OpenClaw에서 미사용, 공식 벤치마크 데이터 없음
3. **신생 프로젝트 리스크**: 2025년 5월 공개, 아직 메이저 버전 미달 (0.6.x)
4. **linkedom 비호환**: Axel이 채택할 linkedom과 호환 불가 — Defuddle core 번들은 DOM 직접 제공이므로 별도 포크 또는 adapter 필요
5. **OpenClaw 패턴 검증**: Readability + linkedom이 이미 동일 유스케이스에서 검증됨

**재평가 시점**: Defuddle이 1.0에 도달하고 linkedom 지원을 추가하거나, JSDOM 의존성을 제거할 때 재검토. 또는 Readability의 보수적 추출이 Axel 사용 시 문제가 되는 경우.

### Phase별 구현 계획

#### Phase 1: MVP (FEAT-TOOL-002)

```
의존성:
  - linkifyjs (URL 추출)
  - @mozilla/readability (콘텐츠 추출)
  - linkedom (DOM 파싱)

구현 범위:
  - [ ] packages/core/src/types/link.ts — ExtractedUrl, ExtractedContent 타입
  - [ ] packages/core/src/link/url-extractor.ts — linkifyjs find() wrapper
  - [ ] packages/infra/src/web/content-extractor.ts — Readability + linkedom
  - [ ] packages/infra/src/web/html-to-markdown.ts — regex fallback (OpenClaw 참조)
  - [ ] packages/infra/src/tools/link-understand.ts — defineTool() + Zod schema
  - [ ] packages/infra/src/security/external-content.ts — <<<EXTERNAL>>> wrapping
  - [ ] Cache layer (in-memory Map, TTL 60min)
  - [ ] SSRF guard (private IP range 차단)
```

#### Phase 2: 품질 개선

```
  - [ ] Readability charThreshold 튜닝 (사용 패턴 기반)
  - [ ] 특정 사이트 커스텀 규칙 (GitHub, YouTube, Twitter 등)
  - [ ] Content summarization (LLM 기반 요약)
  - [ ] 이미지/미디어 URL 메타데이터 추출
```

#### Phase 3: 고급 기능 (선택적)

```
  - [ ] Defuddle 재평가 (1.0 + linkedom 지원 시)
  - [ ] PDF/문서 콘텐츠 추출
  - [ ] 동적 페이지 지원 (Playwright headless browser)
  - [ ] 캐시 PostgreSQL 영속화
```

## Implementation Notes

### Zod Schema (Tool Definition)

```typescript
// packages/infra/src/tools/link-understand.ts
const LinkUnderstandInputSchema = z.object({
  url: z.string().url().describe("HTTP or HTTPS URL to fetch and extract content from."),
  extractMode: z.enum(["markdown", "text"]).default("markdown")
    .describe('Extraction mode: "markdown" returns formatted Markdown, "text" returns plain text.'),
  maxChars: z.number().int().min(100).max(100_000).default(50_000)
    .describe("Maximum characters to return. Content is truncated when exceeded."),
});
```

### Security Considerations

1. **SSRF Guard**: Private IP range 차단 (OpenClaw `fetchWithSsrFGuard` 패턴 참조)
2. **External Content Wrapping**: 모든 추출 결과에 `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` 마커
3. **URL Validation**: `new URL()` constructor로 프로토콜 검증 (`http:` / `https:` only)
4. **Timeout**: 기본 10초, 설정 가능
5. **Max Redirects**: 기본 3회, 무한 리디렉션 방지
6. **Content Size Limit**: 50KB 기본, 설정 가능 — 메모리 폭발 방지

### Config Schema

```typescript
const LinkUnderstandConfigSchema = z.object({
  enabled: z.boolean().default(true),
  readability: z.boolean().default(true),
  maxChars: z.number().int().min(100).default(50_000),
  maxCharsCap: z.number().int().min(100).default(100_000),
  maxRedirects: z.number().int().nonneg().default(3),
  timeoutSeconds: z.number().int().positive().default(10),
  cacheTtlMinutes: z.number().nonneg().default(60),
  userAgent: z.string().default(
    "Mozilla/5.0 (compatible; Axel/1.0; +https://github.com/northprot/axel)"
  ),
});
```

## References

### Libraries

- [linkifyjs npm](https://www.npmjs.com/package/linkifyjs)
- [linkifyjs Documentation](https://linkify.js.org/docs/linkifyjs.html)
- [GitHub: nfrasser/linkifyjs](https://github.com/nfrasser/linkifyjs)
- [url-regex-safe npm](https://www.npmjs.com/package/url-regex-safe)
- [GitHub: spamscanner/url-regex-safe](https://github.com/spamscanner/url-regex-safe)
- [linkify-it GitHub](https://github.com/markdown-it/linkify-it)
- [@mozilla/readability npm](https://www.npmjs.com/package/@mozilla/readability)
- [GitHub: mozilla/readability](https://github.com/mozilla/readability)
- [defuddle npm](https://www.npmjs.com/package/defuddle)
- [GitHub: kepano/defuddle](https://github.com/kepano/defuddle)
- [Defuddle — Steph Ango](https://stephango.com/defuddle)
- [linkedom npm](https://www.npmjs.com/package/linkedom)
- [GitHub: WebReflection/linkedom](https://github.com/WebReflection/linkedom)
- [jsdom npm](https://www.npmjs.com/package/jsdom)
- [happy-dom npm](https://www.npmjs.com/package/happy-dom)
- [Turndown (HTML→Markdown)](https://github.com/mixmark-io/turndown)

### Articles & Comparisons

- [Defuddle Emerges as Modern Alternative to Readability](https://biggo.com/news/202505240122_Defuddle_Web_Content_Extractor)
- [Defuddle HN Discussion](https://news.ycombinator.com/item?id=44067409)
- [Defuddle vs Postlight Parser Comparison](https://jocmp.com/2025/07/12/full-content-extractors-comparing-defuddle/)
- [LinkeDOM: A JSDOM Alternative](https://webreflection.medium.com/linkedom-a-jsdom-alternative-53dd8f699311)
- [jsdom vs happy-dom (vitest Discussion)](https://github.com/vitest-dev/vitest/discussions/1607)
- [Web Content Extraction Algorithms Comparison](https://chuniversiteit.nl/papers/comparison-of-web-content-extraction-algorithms)
- [URL Regex JavaScript and Node.js 2026](https://forwardemail.net/en/blog/docs/url-regex-javascript-node-js)

### OpenClaw Implementation References

- `/home/northprot/projects/openclaw/src/agents/tools/web-fetch.ts` — Readability + linkedom integration, Firecrawl fallback, SSRF guard, caching
- `/home/northprot/projects/openclaw/src/agents/tools/web-fetch-utils.ts` — `extractReadableContent()`, `htmlToMarkdown()`, `markdownToText()`
- `/home/northprot/projects/openclaw/src/agents/tools/web-shared.ts` — Cache utilities, timeout, TTL
- `/home/northprot/projects/openclaw/src/markdown/ir.ts` — markdown-it with `linkify: true` for auto URL detection
- `/home/northprot/projects/openclaw/src/security/external-content.ts` — `wrapExternalContent()`, `wrapWebContent()`

### Security

- ADR-019: Auth Strategy (external content wrapping)
- [MDN: URL constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL)
- [CVE-2020-7661 (url-regex ReDoS)](https://github.com/spamscanner/url-regex-safe)
