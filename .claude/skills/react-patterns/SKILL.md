---
name: react-patterns
description: React 18/19 patterns including hooks discipline, server/client component boundaries, Suspense + error boundaries, form actions, data fetching, state management decision trees, and accessibility-first composition. Use when writing or reviewing React components.
metadata:
  origin: ECC
---

# React Patterns

Idiomatic React 18/19 patterns for building robust, accessible, performant component trees.

## When to Activate

- Writing or modifying React function components, custom hooks, or component trees
- Reviewing JSX/TSX files
- Designing state shape or component composition
- Migrating class components or older `forwardRef`/`useEffect`-heavy code
- Choosing between local state, lifted state, context, and external stores
- Working with Server Components / Client Components (Next.js App Router, RSC)
- Implementing forms with React 19 actions or controlled inputs
- Wiring data fetching with TanStack Query / SWR / RSC

## Core Principles

### 1. Render is a Pure Function of Props and State

```tsx
// Good: derive during render
function Cart({ items }: { items: CartItem[] }) {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return <span>{formatMoney(total)}</span>;
}

// Bad: derived state stored separately
function Cart({ items }: { items: CartItem[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((sum, i) => sum + i.price * i.qty, 0));
  }, [items]);
  return <span>{formatMoney(total)}</span>;
}
```

Derived state in `useEffect` adds a render cycle, can desync, and obscures the data flow.

### 2. Side Effects Outside Render

Effects, mutations, network calls, and subscriptions live in event handlers or `useEffect` — never in the render body.

### 3. Composition Over Inheritance

React has no inheritance model for components. Compose with `children`, render props, or component props.

## Hooks Discipline

아래 "ECC rules 에서 흡수" 절의 Hook 항목이 전체 규칙입니다. 요약:

- Top-level only, never conditional
- Cleanup every subscription, interval, listener
- Functional updater (`setX(prev => prev + 1)`) when new state depends on old
- Default position: do not memoize — add `useMemo`/`useCallback` only when a profiler or a dependency chain proves it matters
- Extract a custom hook only when the same hook sequence appears in 2+ components

## State Location Decision Tree

```
Used by one component?
  -> useState inside it

Used by parent + a few descendants?
  -> lift to nearest common ancestor

Used across distant branches AND low-frequency reads (theme, auth, locale)?
  -> React Context

High-frequency updates shared across the tree?
  -> external store (Zustand, Jotai, Redux Toolkit)

Derived from a server?
  -> server-state library (TanStack Query, SWR, RSC fetch)
```

Most pages do not need context or a global store. Resist abstraction until duplicated lifting becomes painful.

## Server / Client Components (RSC)

```tsx
// Server Component - default, async, never ships JS for itself
export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await db.product.findUnique({ where: { id: params.id } });
  if (!product) notFound();
  return <ProductView product={product} />;
}

// Client Component - opt in with "use client"
"use client";
export function AddToCartButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => addToCart(productId))}
    >
      {pending ? "Adding..." : "Add to cart"}
    </button>
  );
}
```

Boundaries:

- Server -> Client: pass serializable props or `children`
- Client -> Server: invoke Server Actions via `<form action={...}>` or imperatively from event handlers
- Never `import` a Server Component from a Client Component file — compose them via `children` instead

## Suspense + Error Boundaries

```tsx
<ErrorBoundary fallback={<ErrorView />}>
  <Suspense fallback={<UserSkeleton />}>
    <UserDetail id={id} />
  </Suspense>
</ErrorBoundary>
```

- Place Suspense boundaries close to the data, not at the route root — progressively reveal content
- Error Boundary remains a class API; use `react-error-boundary` for a hook-friendly wrapper
- A boundary catches errors thrown during render, lifecycle, and constructors of its children — NOT in event handlers or async code

## Forms

### React 19 form actions (preferred for new code)

```tsx
"use client";
import { useActionState } from "react";

const initial = { error: null as string | null };

async function updateUserAction(_prev: typeof initial, formData: FormData) {
  "use server";
  const parsed = UserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };
  await db.user.update({ where: { id: parsed.data.id }, data: parsed.data });
  return { error: null };
}

export function UserForm() {
  const [state, formAction, pending] = useActionState(updateUserAction, initial);
  return (
    <form action={formAction}>
      <input name="name" required />
      <button type="submit" disabled={pending}>Save</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

### Controlled inputs

Use controlled when the value drives other UI, formats on every keystroke, or implements real-time validation.

### Complex forms

For multi-step forms, dynamic field arrays, or cross-field validation: use a library (React Hook Form, TanStack Form). Roll-your-own state management for forms past trivial complexity is a maintenance trap.

## Data Fetching Decision Matrix

| Need | Tool |
|---|---|
| Per-request data in Next.js App Router | RSC `await fetch()` |
| Client-side cache + mutations + invalidation | TanStack Query |
| Lightweight client cache + revalidation | SWR |
| Real-time subscriptions | Server-Sent Events, WebSockets, or the lib's subscription API |
| One-off fire-and-forget | `fetch()` in an event handler |

Avoid `useEffect` + `fetch` for application data — race conditions, no cache, no retry, no Suspense integration.

## Composition Recipes

### Slot via `children`

```tsx
<Layout>
  <Header />
  <Main>{content}</Main>
</Layout>
```

### Named slots

```tsx
<Page header={<Nav />} sidebar={<Filters />}>
  <Results />
</Page>
```

### Compound components (shared state via Context)

```tsx
<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="profile"><Profile /></Tabs.Panel>
  <Tabs.Panel value="settings"><Settings /></Tabs.Panel>
</Tabs>
```

### Render prop / function-as-child

Useful when the parent needs to pass parameters to the rendered output:

```tsx
<DataLoader id={id}>
  {({ data, isLoading }) => isLoading ? <Spinner /> : <UserCard user={data} />}
</DataLoader>
```

Modern alternative: a hook (`useData(id)`) returning the same shape — usually cleaner.

## Performance

### When `React.memo` Actually Helps

Wrap a component in `React.memo` only when:

1. It re-renders frequently
2. Its props are usually the same between renders
3. Its render is measurably expensive

`React.memo` adds an equality check on every render. If props differ on most renders, the check is pure overhead.

### Avoiding Render Cascades

- Lift state down rather than up where possible
- Split context: one context per concern, so a change to `themeContext` does not re-render auth consumers
- Use `useSyncExternalStore` for external state libraries — required for safe concurrent rendering

### Lists

- Provide stable `key` props (database id, not array index)
- Virtualize long lists with `@tanstack/react-virtual` or `react-window` once visible item count exceeds ~50 with non-trivial rows

## Accessibility-First Composition

- Always render semantic HTML (`<button>`, `<a>`, `<nav>`, `<main>`) before reaching for `role` attributes
- Every interactive element must be reachable by keyboard
- Form inputs need labels — `<label htmlFor>` or `aria-label` if visually labeled by an icon
- Manage focus on route changes and modal open/close
- Run `axe` in component tests (see [skills/react-testing](../react-testing/SKILL.md))
- Cross-link: [skills/accessibility/SKILL.md](../accessibility/SKILL.md) covers WCAG criteria and pattern libraries

## Routing

This skill is router-agnostic. The patterns above work with React Router, TanStack Router, Next.js App Router, Remix Router. Router-specific patterns (loaders, actions, nested layouts) follow the router's documentation — those are framework concerns layered on top of React core.

## Out of Scope (Pointer Sections)

- **Next.js specifics**: App Router data loading, Route Handlers, Middleware, Parallel Routes — separate concern, use Next.js docs
- **React Native**: Platform-specific patterns differ enough to warrant a separate `react-native-patterns` skill (not present yet)
- **Remix**: Loader/action conventions overlap with RSC but follow Remix docs

## Related

- Rules: 아래 "ECC rules 에서 흡수 (2026-10-08)" 절
- Skills: [react-performance](../react-performance/SKILL.md) for the Vercel-derived performance ruleset, [frontend-patterns](../frontend-patterns/SKILL.md) for cross-framework UI concerns, [accessibility](../accessibility/SKILL.md), [angular-developer](../angular-developer/SKILL.md) for framework comparison
- Agents: `react-reviewer` for code review, `react-build-resolver` for build/bundler errors
- Commands: `/react-review`, `/react-build`, `/react-test`

## Examples

### Custom hook for debounced search

```tsx
function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchBox() {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchApi(debounced),
    enabled: debounced.length > 0,
  });
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <Results items={data ?? []} />
    </>
  );
}
```

### Optimistic UI with React 19 `useOptimistic`

```tsx
"use client";
import { useOptimistic } from "react";

export function MessageList({ messages }: { messages: Message[] }) {
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage],
  );

  async function send(formData: FormData) {
    const text = String(formData.get("text"));
    addOptimistic({ id: "pending", text, sender: "me" });
    await saveMessage(text);
  }

  return (
    <>
      <ul>{optimistic.map((m) => <li key={m.id}>{m.text}</li>)}</ul>
      <form action={send}>
        <input name="text" />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
```

### Splitting context to avoid render cascades

```tsx
// Two contexts: one rarely changes, one frequently
const ThemeContext = createContext<Theme>("light");
const NotificationsContext = createContext<Notification[]>([]);

// A component that only consumes ThemeContext does NOT re-render when notifications change
```

## ECC rules 에서 흡수 (2026-10-08)

### 파일과 이름

- JSX 가 1줄이라도 있는 파일은 `.tsx`, 로직·타입·JSX 없는 hook 은 `.ts`, 테스트는 원본 파일 이름에 `.test.tsx` / `.test.ts` 를 붙입니다.
- Context 는 `<Domain>Context`, provider 컴포넌트는 `<Domain>Provider`, 소비 hook 은 `use<Domain>` 으로 이름을 붙입니다.
- 컴포넌트 안의 이벤트 처리 함수는 `handleClick`, `handleSubmit`, 그 함수를 받는 prop 은 `onClick`, `onSubmit` 으로 이름을 붙입니다.
- boolean prop 은 `isLoading`, `hasError`, `canSubmit` 처럼 `is`·`has`·`can` 을 앞에 붙입니다. `loading`, `error` 만으로 boolean 을 표현하지 않습니다.
- `enum` 대신 문자열 리터럴 union(`type Role = 'admin' | 'member'`)을 씁니다.
- 외부에서 들어오는 값(API 응답, 오류 객체)은 `any` 가 아니라 `unknown` 으로 받고 `instanceof`·타입 가드로 좁힌 뒤 씁니다.
- `console.log` 를 production 코드에 남기지 않습니다.

### 컴포넌트 형태

- prop 타입은 `type Props = { ... }` 로 선언하고, 매개변수에서 구조 분해합니다. 본문에서 `props.user` 로 접근하지 않습니다. `React.FC` 는 쓰지 않습니다.
- 자식이 없는 태그는 self-close(`<img />`)하고, DOM 요소가 필요 없는 묶음은 `<>...</>` 를 씁니다.
- JSX 안의 식이 2줄 이상이 될 경우 return 위에서 const 로 계산한 뒤 넣습니다.

```tsx
const greeting = user.isAdmin ? "Welcome, admin" : `Hello ${user.name}`;
return <h1>{greeting}</h1>;
```

- import 순서는 react, 외부 라이브러리, 절대 경로, 상대 경로입니다. 타입만 쓰는 import 는 `import type { ReactNode } from "react"` 로 분리합니다.
- 데이터 조회·상태·부수효과는 container 컴포넌트가 갖고, presentational 컴포넌트는 prop 만 받아 렌더링합니다.
- modal, tooltip, toast 처럼 부모의 `overflow: hidden`·`z-index` 밖으로 나가야 하는 요소는 `createPortal` 로 `index.html` 의 고정 DOM 노드에 렌더링합니다.
- React 19 부터 함수 컴포넌트는 `ref` 를 일반 prop 으로 받습니다. `forwardRef` 는 React 18 이하에서만 씁니다.

### Hook

- `useEffect` 를 다음 용도로 쓰지 않습니다. 파생 상태와 렌더링용 데이터 변환은 렌더 중에 계산하고, prop 변경 시 상태 초기화는 부모의 `key` 로 하고, 부모에게 상태 변경을 알리는 것은 이벤트 핸들러에서 콜백을 호출하고, 앱 전역 1회 초기화는 `main.tsx` 에서 합니다.
- 의존성 배열에는 effect·callback 안에서 참조하는 반응형 값을 전부 넣습니다. `react-hooks/exhaustive-deps` 경고를 주석 없이 끄지 않습니다. 배열이 길어질 경우 effect 를 분리합니다.
- `useMemo`·`useCallback` 은 값이 `React.memo` 자식의 prop 이거나, 다른 hook 의 의존성이거나, 계산 비용을 측정해 확인한 경우에만 씁니다.
- 초기 상태 계산 비용이 클 경우 `useState(() => computeInitial(prop))` 로 함수를 전달합니다. 이전 상태에 의존하는 갱신은 `setCount(c => c + 1)` 로 합니다. 상태 전이가 이전 상태에 따라 분기하거나 관련 값이 3개 이상이면 `useReducer` 를 씁니다.
- `useRef` 는 DOM 참조와 재렌더링을 일으키지 않는 값(timer id, 이전 값)에 씁니다. `ref.current` 를 렌더 중에 읽거나 쓰지 않습니다.
- 비동기 핸들러와 interval 은 생성된 렌더의 값을 캡처합니다(stale closure). 함수형 updater 를 쓰거나, 값을 의존성 배열에 넣어 핸들러를 다시 만들거나, ref 에서 읽습니다.

### 보안

- `href`·`src` 에 사용자 값이 들어갈 경우 `new URL()` 로 파싱해 protocol 이 `http:`·`https:`·`mailto:` 일 때만 씁니다. `javascript:`·`data:` URL 은 코드를 실행합니다.
- `target="_blank"` 에는 `rel="noopener noreferrer"` 를 붙입니다.
- `VITE_` 접두사가 붙은 환경변수는 client 번들에 포함됩니다. 비밀값에 이 접두사를 붙이지 않습니다.
- 신뢰하지 않는 JSON 을 `setState({ ...state, ...update })` 로 직접 펼치지 않습니다. 허용 키만 골라낸 뒤 펼칩니다. `__proto__` 키가 들어올 수 있습니다.
- production 빌드는 source map 을 공개 번들에 포함하지 않습니다.
