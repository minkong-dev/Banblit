// 등록되지 않은 주소로 들어왔을 때 표시합니다. 이 화면이 없으면 React Router 가 아무것도
// 렌더링하지 않아 빈 화면이 표시되고, 사용자는 주소가 틀린 것인지 서비스가 정지한 것인지
// 구분할 수 없습니다.

import { Link } from "react-router-dom";

import "../styles/fallback.css";

export function NotFound() {
  return (
    <div className="fallback">
      <div className="box">
        <h1>없는 주소예요</h1>
        <p>주소가 변경되었거나 삭제된 화면이에요.</p>
        <div className="act">
          <Link className="go" to="/scheduler">합주실 예약으로</Link>
          <Link to="/">처음 화면으로</Link>
        </div>
      </div>
    </div>
  );
}
