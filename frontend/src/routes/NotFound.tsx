// 등록되지 않은 주소로 들어왔을 때 표시합니다. 이 화면이 없으면 React Router 가 아무것도
// 렌더링하지 않아 빈 화면이 표시되고, 사용자는 주소가 틀린 것인지 서비스가 정지한 것인지
// 구분할 수 없습니다.

import { Link } from "react-router-dom";

import { ArrowIcon } from "../components/icons";
import "../styles/fallback.css";

export function NotFound() {
  return (
    <div className="fallback lost">
      <h1>Oops!</h1>
      <p>존재하지 않는 페이지에요</p>
      {/* 장식 그림이라 읽어 줄 내용이 없습니다. */}
      <img src="/images/lost.svg" alt="" />
      {/* 로그인한 사람은 /login 에서 대시보드로 이동합니다(App.tsx 의 SkipIfSignedIn). */}
      <Link className="go" to="/login">로그인으로 돌아가기<ArrowIcon /></Link>
    </div>
  );
}
