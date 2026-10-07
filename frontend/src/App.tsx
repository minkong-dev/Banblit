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
import { SettingsIndex, SettingsPage } from "./routes/Settings";
import { Teams } from "./routes/Teams";
import { AppShell } from "./components/AppShell";
import { ADMIN_MENU } from "./lib/adminMenu";
import { isSignedIn } from "./lib/pipeline";

/** 로그인 뒤 화면들을 감쌉니다. 로그인 표시 cookie(브라우저가 저장해 요청마다 함께 보내는 값)가 없으면 감싼 화면을
 *  렌더링하지 않고 로그인으로 이동합니다. 서버도 session(서버가 보관하는 로그인 상태) 없는 요청은 401 로 거절하므로,
 *  frontend 에서 먼저 필터링해 빈 화면이 잠깐 표시된 후 이동하는 것을 방지합니다.
 *  ponytail: 표시용 cookie 는 서버가 session 을 취소해도 즉시 삭제되지 않습니다(다른
 *  기기에서 로그아웃한 경우 등). 이 경우 RequireAuth를 통과하지만 이후 요청이
 *  401로 거절됩니다. */
function RequireAuth(props: { children: ReactElement }): ReactElement {
  return isSignedIn() ? props.children : <Navigate to="/login" replace />;
}

/** RequireAuth 의 반대입니다. 로그인 표시 cookie 가 있으면 랜딩·로그인 화면 대신 대시보드로 보냅니다.
 *  이 이동이 없으면 로그인 상태 유지로 cookie 가 살아 있어도 다시 들어왔을 때 로그인 화면이 보입니다.
 *  ponytail: cookie 는 남았는데 서버 session 이 취소된 경우(다른 기기에서 비밀번호 변경 등) 로그인 화면으로
 *  갈 수 없고 대시보드의 요청이 401 로 거절됩니다. 프로필 카드의 로그아웃이 cookie 를 삭제하므로 빠져나올 수 있습니다.
 *  자주 생기면 401 응답에서 cookie 를 삭제하고 로그인으로 보내는 처리를 추가합니다. */
function SkipIfSignedIn(props: { children: ReactElement }): ReactElement {
  return isSignedIn() ? <Navigate to="/scheduler" replace /> : props.children;
}

// 계정 5개 화면을 layout route 로 묶습니다. 주소는 각각 다르지만 왼쪽 이미지는 다시
// 렌더링되지 않습니다. 부모가 마운트된 상태에서 자식만 변경됩니다.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<SkipIfSignedIn><Landing /></SkipIfSignedIn>} />
      <Route element={<AccountLayout />}>
        <Route path="/login" element={<SkipIfSignedIn><SignIn /></SkipIfSignedIn>} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/find-id" element={<FindId />} />
        <Route path="/find-password" element={<FindPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>
      {/* 상단바·사이드바를 layout route 로 둡니다. 화면을 이동해도 AppShell 은 유지되고 Outlet 안의 화면만 교체됩니다. */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/admin" element={<Assignment />} />
        {/* 관리자 메뉴 6개입니다. 주소와 필요 권한은 lib/adminMenu.ts 에 작성되어 있는 내용을 기준으로 하고, 권한이 없는
            사람이 주소로 바로 들어오면 SettingsPage 가 /settings 로 돌려보냅니다. */}
        {ADMIN_MENU.map((item) => (
          // element 의 key 는 구역을 옮길 때 화면을 새로 마운트합니다. 모두 같은 SettingsPage 라 key 가 없으면
          // React 가 같은 자리의 같은 컴포넌트로 보고 이전 구역의 state(검색어 등)를 그대로 넘깁니다.
          <Route key={item.key} path={item.to} element={<SettingsPage key={item.key} section={item.key} />} />
        ))}
        {/* 관리자 메뉴를 구역별 주소로 분리하기 전의 주소입니다. 저장해 둔 링크가 끊기지 않게 둡니다. */}
        <Route path="/settings" element={<SettingsIndex />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="/notices/new" element={<NoticeWrite />} />
        <Route path="/board" element={<Board />} />
        <Route path="/board/:teamId/new" element={<BoardWrite />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      {/* 등록된 주소가 아니면 여기로 옵니다. 이 route 가 없으면 아무것도 렌더링되지 않아 빈 화면이 표시됩니다. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
