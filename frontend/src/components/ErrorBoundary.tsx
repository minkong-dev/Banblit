// 렌더링 중 발생한 error 를 잡아 대체 화면을 표시합니다. 이 컴포넌트가 없으면 React 가 전체 트리를
// unmount 해 사용자는 빈 화면만 보게 되고, 무엇이 일어났는지도 표시되지 않습니다.
//
// class 로 작성한 이유는 componentDidCatch 와 getDerivedStateFromError 를 hook 으로 대체할 수
// 없기 때문입니다. 이 저장소에서 class 컴포넌트는 이 파일 하나입니다.
//
// 이 컴포넌트는 조회도 router 도 사용하지 않습니다. AppShell 안에서 발생한 error 도 잡아야 하므로,
// 대체 화면이 의존하는 것이 많을수록 그 대체 화면마저 렌더링하지 못할 가능성이 커집니다.

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { crashDetail } from "../lib/fallback";
import "../styles/fallback.css";

type Props = { children: ReactNode };
type State = { detail: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { detail: null };

  static getDerivedStateFromError(error: unknown): State {
    return { detail: crashDetail(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 개발자 도구에 남깁니다. 화면에는 한 줄만 표시하므로 어느 컴포넌트에서 발생했는지는 여기에만 남습니다.
    console.error("화면을 렌더링하지 못했습니다", error, info.componentStack);
  }

  render(): ReactNode {
    const { detail } = this.state;
    if (detail === null) return this.props.children;

    return (
      <div className="fallback">
        <div className="box" role="alert">
          <h1>화면을 표시하지 못했어요</h1>
          <p>새로고침하면 대부분 다시 열려요. 같은 화면이 계속 나오면 운영진에게 알려주세요.</p>
          <div className="act">
            <button type="button" className="go" onClick={() => { window.location.reload(); }}>
              새로고침
            </button>
          </div>
          {detail === "" ? null : (
            <details>
              <summary>오류 내용</summary>
              <pre>{detail}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
