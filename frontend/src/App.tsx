import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import {
  AccountLayout,
  FindId,
  FindPassword,
  ResetPassword,
  SignIn,
  SignUp,
} from "./routes/Account";
import { Assignment } from "./routes/Assignment";
import { Board } from "./routes/Board";
import { Landing } from "./routes/Landing";
import { Notices } from "./routes/Notices";
import { Profile } from "./routes/Profile";
import { Scheduler } from "./routes/Scheduler";
import { Settings } from "./routes/Settings";
import { Teams } from "./routes/Teams";
import { isSignedIn } from "./lib/pipeline";

/** 로그인 화면 뒤쪽 일곱 화면을 감싼다. 로그인 표시 쿠키가 없으면 그 화면을
 *  그리지 않고 로그인으로 보낸다 — 서버도 세션 없는 요청은 401로 거절하니,
 *  화면에서 먼저 걸러 빈 화면이 잠깐 보였다 튕기는 것을 막는다.
 *  ponytail: 표시용 쿠키는 서버가 세션을 취소해도 곧바로 사라지지 않는다(다른
 *  기기에서 로그아웃한 경우 등). 그때는 여기를 통과하지만 뒤이은 요청이
 *  401로 거절된다. */
function RequireAuth(props: { children: ReactElement }): ReactElement {
  return isSignedIn() ? props.children : <Navigate to="/login" replace />;
}

// 계정 다섯 벌은 layout route 로 묶는다. 주소는 따로 갖되 왼쪽 사진은 다시 그려지지
// 않는다 — 부모가 마운트된 채 자식만 바뀐다.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AccountLayout />}>
        <Route path="/login" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/find-id" element={<FindId />} />
        <Route path="/find-password" element={<FindPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>
      <Route path="/scheduler" element={<RequireAuth><Scheduler /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><Assignment /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/notices" element={<RequireAuth><Notices /></RequireAuth>} />
      <Route path="/board" element={<RequireAuth><Board /></RequireAuth>} />
      <Route path="/teams" element={<RequireAuth><Teams /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
    </Routes>
  );
}
