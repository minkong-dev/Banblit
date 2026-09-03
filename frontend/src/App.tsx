import { Route, Routes } from "react-router-dom";

import {
  AccountLayout,
  FindId,
  FindPassword,
  ResetPassword,
  SignIn,
  SignUp,
} from "./routes/Account";
import { Assignment } from "./routes/Assignment";
import { Landing } from "./routes/Landing";
import { Scheduler } from "./routes/Scheduler";

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
      <Route path="/scheduler" element={<Scheduler />} />
      <Route path="/admin" element={<Assignment />} />
    </Routes>
  );
}
