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
import { NotFound } from "./routes/NotFound";
import { Notices } from "./routes/Notices";
import { BoardWrite, NoticeWrite } from "./routes/PostWrite";
import { Profile } from "./routes/Profile";
import { Scheduler } from "./routes/Scheduler";
import { Settings } from "./routes/Settings";
import { Teams } from "./routes/Teams";
import { isSignedIn } from "./lib/pipeline";

/** 로그인 화면 뒤의 7개 화면을 감쌉니다. 로그인 표시 cookie(브라우저가 저장해 요청마다 함께 보내는 값)가 없으면 감싼 화면을
 *  렌더링하지 않고 로그인으로 이동합니다. 서버도 session(서버가 보관하는 로그인 상태) 없는 요청은 401 로 거절하므로,
 *  frontend 에서 먼저 필터링해 빈 화면이 잠깐 표시된 후 이동하는 것을 방지합니다.
 *  ponytail: 표시용 cookie 는 서버가 session 을 취소해도 즉시 삭제되지 않습니다(다른
 *  기기에서 로그아웃한 경우 등). 이 경우 RequireAuth를 통과하지만 이후 요청이
 *  401로 거절됩니다. */
function RequireAuth(props: { children: ReactElement }): ReactElement {
  return isSignedIn() ? props.children : <Navigate to="/login" replace />;
}

// 계정 5개 화면을 layout route 로 묶습니다. 주소는 각각 다르지만 왼쪽 이미지는 다시
// 렌더링되지 않습니다. 부모가 마운트된 상태에서 자식만 변경됩니다.
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
      <Route path="/notices/new" element={<RequireAuth><NoticeWrite /></RequireAuth>} />
      <Route path="/board" element={<RequireAuth><Board /></RequireAuth>} />
      <Route path="/board/:teamId/new" element={<RequireAuth><BoardWrite /></RequireAuth>} />
      <Route path="/teams" element={<RequireAuth><Teams /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      {/* 등록된 주소가 아니면 여기로 옵니다. 이 route 가 없으면 아무것도 렌더링되지 않아 빈 화면이 표시됩니다. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
