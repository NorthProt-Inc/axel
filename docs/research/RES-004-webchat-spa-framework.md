# RES-004: WebChat SPA Framework — React vs Svelte vs SolidJS

> Date: 2026-02-07
> Author: Research Division (Claude Sonnet 4.5)
> Related: ADR-001 (TypeScript single stack)

## Question

Which JavaScript framework should Axel use for the WebChat SPA frontend: React, Svelte 5, or SolidJS? Consider bundle size, performance, TypeScript support, ecosystem maturity, and real-time chat requirements.

## Methodology

1. **Performance benchmarks** from FrontendTools.tech and community comparisons (2025-2026)
2. **npm download statistics** from npm registry API (weekly downloads)
3. **Ecosystem analysis** of UI libraries, tooling, and community size
4. **WebSearch** for latest framework updates (Svelte 5 runes, React 19, SolidJS v1.9)

## Findings

### Option A: React 19

#### Description
The dominant JavaScript library for building user interfaces, maintained by Meta/Facebook with a massive ecosystem and virtual DOM architecture.

#### Specifications
```
Version: 19.2.4 (released Jan 26, 2026)
Runtime: 42 KB (React + ReactDOM, minified+gzipped)
Reactivity: Virtual DOM with hooks
TypeScript: Native support
Weekly downloads: 86.5 million
```

#### Setup
```bash
npm create vite@latest axel-webchat -- --template react-ts
cd axel-webchat
npm install
```

#### Pros
- **Massive ecosystem**: 86.5M weekly downloads, 8,548 developer respondents (State of JS 2024)
- **Mature UI libraries**: Material-UI (4.5M weekly downloads, 97K GitHub stars), shadcn/ui (560K weekly downloads, 104K stars), Ant Design, Chakra UI
- **Production-proven**: Used by Spotify, Amazon, Netflix, Meta — battle-tested at scale
- **Chat-specific libraries**: Stream Chat React, React ChatGPT, SendBird UIKit
- **Developer talent pool**: Largest hiring market, easy onboarding for contributors
- **Rich tooling**: React DevTools, Next.js SSR, Vite, extensive ESLint rules
- **TypeScript integration**: First-class TS support, extensive type definitions
- **React 19 features**: Compiler, Server Components, Suspense improvements

#### Cons
- **Large bundle size**: 42 KB (React + ReactDOM) vs 7 KB (SolidJS) / 1.6 KB (Svelte runtime)
- **Slower performance**: Virtual DOM overhead — 1,100ms render time vs 800ms for Svelte on 3G
- **Complexity**: Hooks dependency arrays, useEffect pitfalls, manual optimization (memo, useMemo)
- **Re-render overhead**: Component re-renders by default, requiring optimization
- **Lower developer satisfaction**: 83% satisfaction vs 89.7% (Svelte) in State of JS

#### Performance Numbers
| Metric | Value |
|--------|-------|
| Bundle size (min+gzip) | 42 KB |
| Lighthouse score | ~85-90 |
| Render time (3G, mid-range) | 1,100ms |
| VDOM overhead | Moderate |
| Weekly npm downloads | 86,477,138 |

#### Source
[React npm](https://www.npmjs.com/package/react), [14 Best React UI Libraries 2026](https://www.untitledui.com/blog/react-component-libraries), [Svelte vs React | DreamHost](https://www.dreamhost.com/blog/svelte-vs-react/)

---

### Option B: Svelte 5 (with Runes)

#### Description
Compiler-first framework that shifts work to build time, introduced "runes" in v5 for explicit, fine-grained reactivity without virtual DOM.

#### Specifications
```
Version: 5.x (released 2025)
Runtime: 1.6 KB (Svelte compiler output has no runtime framework)
Reactivity: Fine-grained reactivity with runes (compile-time)
TypeScript: Native support, enhanced in v5
Weekly downloads: 2.7 million
```

#### Setup
```bash
npm create svelte@latest axel-webchat
cd axel-webchat
npm install
```

#### Runes Example
```typescript
<script lang="ts">
  let count = $state(0); // Replaces reactive declarations
  let doubled = $derived(count * 2); // Automatic dependency tracking
  
  function increment() {
    count += 1; // Direct assignment, no setCount()
  }
</script>
```

#### Pros
- **Smallest bundle**: 1.6 KB runtime vs 42 KB (React) — 6.8 KB vs 40.1 KB in real-world apps (6x smaller)
- **Superior performance**: 30% faster load times, 800ms render vs 1,100ms (React) on 3G
- **Lighthouse score 96**: Second only to SolidJS (98) in benchmarks
- **No virtual DOM**: Direct DOM manipulation via compiled code
- **Better DX**: 89.7% developer satisfaction (highest among major frameworks)
- **Svelte 5 runes**: Predictable reactivity, no dependency arrays, automatic tracking
- **TypeScript native**: No preprocessor needed in v5
- **Growing ecosystem**: shadcn-svelte, Skeleton, Flowbite Svelte, Bits UI, SVAR components
- **SvelteKit**: Full-stack framework with routing, SSR, API routes (like Next.js for React)

#### Cons
- **Smaller ecosystem**: 2.7M weekly downloads vs 86.5M (React) — 32x smaller
- **Fewer UI libraries**: Maturing but less choice than React (no MUI equivalent)
- **Smaller talent pool**: 1.2% developer usage (2024) vs React's dominance
- **Learning curve**: Compile-time magic can be opaque; v5 runes change mental model
- **Less enterprise adoption**: Fewer Fortune 500 companies compared to React
- **Chat libraries**: Limited — must build custom or adapt generic WebSocket libraries

#### Performance Numbers
| Metric | Value |
|--------|-------|
| Bundle size (min+gzip) | 1.6 KB (runtime) / 6.8 KB (real app) |
| Lighthouse score | 96 |
| Render time (3G, mid-range) | 800ms |
| VDOM overhead | None (compiled away) |
| Weekly npm downloads | 2,699,962 |
| Developer satisfaction | 89.7% |

#### Source
[Svelte 5 vs React | SvelteJobs](https://sveltejobs.com/blog/svelte-5-vs-react), [Top 10 Svelte UI Libraries 2025](https://www.wearedevelopers.com/en/magazine/250/top-svelte-ui-libraries), [React vs Svelte | LogRocket](https://blog.logrocket.com/react-vs-svelte/)

---

### Option C: SolidJS

#### Description
Fine-grained reactive library with React-like syntax but no virtual DOM, using Signals for precise, surgical DOM updates.

#### Specifications
```
Version: 1.9.10 (released Dec 24, 2025)
Runtime: 7 KB (minified+gzipped)
Reactivity: Fine-grained reactivity with Signals
TypeScript: Native support
Weekly downloads: 1.5 million
```

#### Setup
```bash
npm init solid axel-webchat
cd axel-webchat
npm install
```

#### Signals Example
```typescript
import { createSignal, createEffect } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);
  
  createEffect(() => {
    console.log("Count:", count()); // Automatically tracks dependencies
  });
  
  return <button onClick={() => setCount(count() + 1)}>Count: {count()}</button>;
}
```

#### Pros
- **Best performance**: Lighthouse score 98 (highest), fastest runtime in benchmarks
- **Fine-grained reactivity**: Only updates exact DOM nodes, no re-renders
- **Small bundle**: 7 KB vs 42 KB (React) — 6x smaller
- **React-like DX**: JSX syntax, familiar patterns for React developers
- **No virtual DOM**: Direct reactive updates via Signals
- **TypeScript support**: First-class TS integration
- **Growing ecosystem**: SolidUI, shadcn-solid, Solid Bootstrap, Corvu, Hope UI
- **Production-ready**: v1.9.10 stable, v2.0 with official roadmap

#### Cons
- **Smallest ecosystem**: 1.5M weekly downloads vs 2.7M (Svelte) / 86.5M (React)
- **Niche community**: 1.2% developer usage (2024), similar to Svelte but less mindshare
- **Limited UI libraries**: Fewer enterprise-grade component libraries than React/Svelte
- **Less mature tooling**: Fewer IDE extensions, debugging tools vs React
- **Small talent pool**: Hardest to hire for among the three options
- **No full-stack framework**: No equivalent to Next.js or SvelteKit (SolidStart is experimental)
- **Chat libraries**: Minimal — must build from scratch

#### Performance Numbers
| Metric | Value |
|--------|-------|
| Bundle size (min+gzip) | 7 KB |
| Lighthouse score | 98 (best) |
| Render speed | Fastest (benchmark leader) |
| VDOM overhead | None (fine-grained) |
| Weekly npm downloads | 1,475,803 |

#### Source
[SolidJS vs React | Aalpha](https://www.aalpha.net/blog/solidjs-vs-react-comparison/), [SolidJS Ecosystem](https://www.solidjs.com/ecosystem), [Best SolidJS UI Libraries](https://yon.fun/solidjs-ui-libs/)

---

## Comparison Matrix

| Criterion | React 19 | Svelte 5 | SolidJS |
|-----------|----------|----------|---------|
| **Bundle Size** | 42 KB | 1.6 KB (runtime) / 6.8 KB (app) | 7 KB |
| **Lighthouse Score** | 85-90 | 96 | 98 |
| **Render Time (3G)** | 1,100ms | 800ms | ~750ms (estimated) |
| **Reactivity Model** | Virtual DOM + Hooks | Compile-time runes | Fine-grained Signals |
| **Weekly Downloads** | 86.5M | 2.7M | 1.5M |
| **Developer Satisfaction** | 83% | 89.7% | Not ranked (niche) |
| **Ecosystem Maturity** | Massive (8+ years) | Growing (5+ years) | Emerging (3+ years) |
| **UI Libraries** | MUI, shadcn, Ant Design, 14+ | shadcn-svelte, Skeleton, Flowbite, Bits UI | SolidUI, shadcn-solid, Hope UI |
| **Chat Libraries** | Stream Chat, SendBird, custom | Limited (build custom) | Minimal (build custom) |
| **TypeScript Support** | Native (first-class) | Native (v5 improved) | Native (first-class) |
| **Full-Stack Framework** | Next.js (mature) | SvelteKit (mature) | SolidStart (experimental) |
| **Talent Pool** | Largest (8,548 devs) | Small (niche) | Smallest (niche) |
| **Production Adoption** | Spotify, Meta, Amazon | Growing (Vercel, others) | Niche startups |
| **Learning Curve** | Moderate (hooks complexity) | Low (intuitive) | Low (React-like) |

## Recommendation

**Use Svelte 5 for Axel's WebChat SPA.**

### Rationale

1. **Performance is critical for real-time chat**: Svelte's 30% faster load times and 96 Lighthouse score provide the best user experience for a chat interface. Real-time message rendering benefits from fine-grained reactivity (no VDOM overhead).

2. **Bundle size matters for self-hosted agent**: Axel is self-hosted initially, potentially on low-resource servers. Svelte's 6.8 KB bundle vs React's 40.1 KB (6x smaller) reduces bandwidth and improves mobile experience.

3. **Ecosystem is sufficient for Axel's needs**: Axel's WebChat is relatively simple:
   - Text messages with Markdown rendering
   - Streaming LLM responses
   - File uploads (images, PDFs)
   - Chat history sidebar
   
   Svelte's UI libraries (shadcn-svelte, Skeleton) provide all required primitives. No need for complex enterprise components.

4. **TypeScript single-stack alignment**: Svelte 5 has native TypeScript support without preprocessors, matching ADR-001's preference for TS everywhere.

5. **Developer experience**: 89.7% satisfaction (highest) means faster iteration during Axel's development phase. Svelte 5 runes eliminate React's hook pitfalls (dependency arrays, stale closures).

6. **SvelteKit for full-stack**: SvelteKit provides routing, SSR, and API endpoints — equivalent to Next.js but with better performance. Axel can colocate frontend and backend logic if needed.

7. **React's advantages don't apply to Axel**:
   - **Massive ecosystem**: Overkill for a single-user chat interface
   - **Large talent pool**: Axel is open-source but not enterprise; contributors can learn Svelte (documentation is excellent)
   - **Enterprise adoption**: Irrelevant for Axel's self-hosted, single-user Phase 1

8. **SolidJS's performance edge is marginal**: SolidJS's 98 Lighthouse (vs Svelte's 96) is negligible in practice. Svelte's larger ecosystem (2.7M vs 1.5M downloads) and SvelteKit maturity outweigh the 2-point difference.

### Implementation Pattern

**Project structure**:
```
axel-webchat/
├── src/
│   ├── routes/               # SvelteKit file-based routing
│   │   ├── +page.svelte     # Main chat interface
│   │   ├── +layout.svelte   # App shell
│   │   └── api/
│   │       └── chat/+server.ts  # SSR API endpoints
│   ├── lib/
│   │   ├── components/      # Chat UI components
│   │   │   ├── MessageList.svelte
│   │   │   ├── MessageInput.svelte
│   │   │   └── ChatSidebar.svelte
│   │   ├── stores/          # Global state (WebSocket, chat history)
│   │   └── utils/           # Markdown, syntax highlighting
│   └── app.html             # HTML shell
├── static/                  # Public assets
└── svelte.config.js
```

**UI library choice**:
```bash
npm install -D shadcn-svelte
```
Use shadcn-svelte (copy-paste components) for chat UI primitives: buttons, inputs, scrollable areas, dropdowns. Tailwind CSS for styling.

**Real-time WebSocket**:
```typescript
// src/lib/stores/chat.ts
import { writable } from 'svelte/store';

export const messages = writable<Message[]>([]);
export const ws = writable<WebSocket | null>(null);

export function connectWebSocket(url: string) {
  const socket = new WebSocket(url);
  
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    messages.update(msgs => [...msgs, msg]);
  };
  
  ws.set(socket);
}
```

**Streaming LLM responses** (SSE or WebSocket):
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  
  let streamContent = $state('');
  
  onMount(() => {
    const eventSource = new EventSource('/api/chat/stream');
    
    eventSource.onmessage = (event) => {
      streamContent += event.data;
    };
    
    return () => eventSource.close();
  });
</script>

<div class="message streaming">
  {streamContent}
</div>
```

**Markdown rendering**:
```bash
npm install marked highlight.js
```

```typescript
// src/lib/utils/markdown.ts
import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return code;
  }
});

export function renderMarkdown(text: string): string {
  return marked.parse(text);
}
```

### When to Use React Instead

Consider React if:
- **Enterprise contract work**: Client requires React (corporate standard)
- **Chat component library needed**: Using Stream Chat React or SendBird UIKit saves weeks of development
- **Large team onboarding**: Hiring 5+ frontend developers immediately (React talent pool advantage)
- **Complex state management**: Requiring Redux, Zustand, or other React-specific libraries

For Axel's Phase 1 (single developer, simple chat UI), these scenarios don't apply.

### When to Use SolidJS Instead

Consider SolidJS if:
- **Absolute performance is critical**: Need every millisecond for high-frequency updates (e.g., real-time collaboration, gaming)
- **React developer** who wants performance without learning Svelte's compiler model
- **No full-stack needs**: Building a client-only SPA (no SSR/routing required)

SolidJS's 98 Lighthouse score is impressive, but Svelte's 96 + mature SvelteKit ecosystem is the better trade-off for Axel.

---

## Sources

- [React vs Vue vs Svelte vs SolidJS 2025-2026: Performance Benchmarks | FrontendTools](https://www.frontendtools.tech/blog/best-frontend-frameworks-2025-comparison)
- [Svelte vs React: The Ultimate JavaScript Framework Showdown | DreamHost](https://www.dreamhost.com/blog/svelte-vs-react/)
- [Svelte 5 Runes vs React Hooks: A Deep Dive | Medium](https://medium.com/@mparundhathi/svelte-5-runes-vs-react-hooks-a-deep-dive-into-modern-reactivity-d866d9e701a9)
- [SolidJS vs ReactJS | Makers' Den](https://makersden.io/blog/solidjs-vs-react-pros-and-cons)
- [14 Best React UI Component Libraries in 2026 | Untitled UI](https://www.untitledui.com/blog/react-component-libraries)
- [Top 10 Svelte UI Libraries in 2025 | WeAreDevelopers](https://www.wearedevelopers.com/en/magazine/250/top-svelte-ui-libraries)
- [SolidJS Ecosystem](https://www.solidjs.com/ecosystem)
- [React npm](https://www.npmjs.com/package/react)
- [Svelte npm downloads](https://www.npmjs.com/package/svelte)
- [SolidJS npm downloads](https://www.npmjs.com/package/solid-js)
