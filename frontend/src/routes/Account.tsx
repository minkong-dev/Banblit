import { useActionState } from "react";
import type { FormEvent } from "react";
import { reason } from "../lib/api";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { Field, failures, fieldText } from "../components/Field";
import type { Errors } from "../components/Field";
import { GoogleIcon, KakaoIcon } from "../components/icons";

import { usePage } from "../components/hooks";
import { say, useToast } from "../lib/toast";
import "../styles/account.css";
import {
  cohortMessage,
  emailMessage,
  findId,
  logIn,
  passwordMessage,
  signupPasswordMessage,
  requestPasswordReset,
  resetPassword,
  signUp,
  strongPasswordMessage,
} from "../lib/pipeline";


// 사진은 화면에 붙박이로 두고 오른쪽 서식만 갈아 끼운다. 다섯 화면이 한 자리를 나눠 쓴다.
// 주소가 다섯 개로 나뉘어 있어 뒤로 가기와 링크 보내기가 제대로 동작하고,
// layout route 라 화면을 오갈 때 왼쪽 사진은 다시 그려지지 않는다.
const HEADS: Record<string, { title: string; sub: string }> = {
  "/login": { title: "로그인", sub: "유일무이 버스킹 동아리 여섯줄 안에서." },
  "/signup": { title: "회원가입", sub: "가입에 필요한 정보를 작성해주세요." },
  "/find-id": { title: "아이디 찾기", sub: "가입한 이메일로 찾기" },
  "/find-password": { title: "비밀번호 찾기", sub: "가입한 이메일로 비밀번호 찾기" },
  "/reset-password": { title: "비밀번호 재설정", sub: "대소문자, 숫자, 특수기호 포함 8~20자" },
};

export function AccountLayout() {
  usePage("account");
  const message = useToast();
  const head = HEADS[useLocation().pathname] ?? HEADS["/login"];

  return (
    <>
      <div className="split">
        <section className="stage">
          <span className="mark">BANBLIT</span>
          <div className="say">
            <h1>합주시간 배정,<br />어렵지 않을 때도 됐으니까.<br />지금, <em>BANBLIT.</em></h1>
            <p>IN SIX STRINGS, SINCE 1981.</p>
          </div>
        </section>

        <main className="form">
          <div className="inner">
            <div className="head">
              <h2>{head.title}</h2>
              <p>{head.sub}</p>
            </div>
            <Outlet />
          </div>

          <div className="legal">
            {/* 아직 만들지 않은 페이지다 — 진짜 없는 곳으로 보내는 대신 눌리지 않는 글로 둔다. */}
            <button type="button" disabled>서비스 이용약관</button>
            <button type="button" disabled>개인정보 처리방침</button>
          </div>
        </main>
      </div>

      <div className={message ? "ok on" : "ok"} role="status" aria-live="polite">{message}</div>
    </>
  );
}

/** 검사에 걸리면 사유를 화면에 걸고 멈춘다. 다 통과했을 때만 send 로 넘어간다.
 *  send 가 끝날 때까지 pending 이 켜져 있어 그동안 단추를 잠글 수 있다.
 *  send 는 서버를 부르는 자리라 실패를 그 안에서 직접 잡아 처리해야 한다. */
function useFormAction(
  check: (data: FormData) => Errors,
  send: (data: FormData) => Promise<void>,
): { errors: Errors; onSubmit: (event: FormEvent<HTMLFormElement>) => void; isPending: boolean } {
  const [errors, dispatch, isPending] = useActionState<Errors, FormData>(
    async (_previous, data) => {
      const bad = failures(check(data));
      if (Object.keys(bad).length > 0) return bad;
      await send(data);
      return {};
    },
    {},
  );

  // <form action={dispatch}> 로 걸지 않는다 — React 는 action 이 끝나면 서식을 비우는데,
  // 검사에 걸려 사유만 돌려준 경우에도 비워져 사람이 처음부터 다시 적어야 한다.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch(new FormData(event.currentTarget));
  };
  return { errors, onSubmit, isPending };
}

export function SignIn() {
  const navigate = useNavigate();
  const { errors, onSubmit, isPending } = useFormAction(
    (data) => ({
      mail: emailMessage(fieldText(data, "mail").trim()),
      pw: passwordMessage(fieldText(data, "pw")),
    }),
    async (data) => {
      try {
        await logIn(
          fieldText(data, "mail").trim(),
          fieldText(data, "pw"),
          // 체크박스는 켜졌을 때만 값을 낸다. 안 켜졌으면 빈 문자열이다.
          fieldText(data, "keep") !== "",
        );
        say("로그인했어요");
        void navigate("/scheduler");
      } catch (error) {
        say(reason(error));
      }
    },
  );

  return (
    <form aria-label="로그인" noValidate onSubmit={onSubmit}>
      <Field name="mail" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="이메일을 입력해주세요" error={errors.mail} />
      <Field name="pw" label="비밀번호" type="password"
        autoComplete="current-password" placeholder="비밀번호를 입력해주세요" error={errors.pw} />
      <div className="row">
        <label className="keep"><input type="checkbox" name="keep" /> 로그인 상태 유지</label>
        <span className="links">
          <Link to="/find-id">아이디 찾기</Link>
          <Link to="/find-password">비밀번호 찾기</Link>
        </span>
      </div>
      <button className="go" type="submit" disabled={isPending}>
        {isPending ? "로그인 중…" : "로그인"}
      </button>

      <div className="or">또는</div>
      <div className="social">
        {/* 구글·카카오 로그인은 외부 서비스 등록과 키가 있어야 한다 — 아직 없어 눌리지
            않는 상태로 둔다. AccountLayout 아래쪽의 "서비스 이용약관"과 같은 방식이다. */}
        <button type="button" className="google" disabled>
          <GoogleIcon />구글로 계속하기
        </button>
        <button type="button" className="kakao" disabled>
          <KakaoIcon />카카오로 계속하기
        </button>
      </div>

      <p className="foot">계정이 없으신가요? <Link to="/signup">회원가입</Link></p>
    </form>
  );
}

export function SignUp() {
  const navigate = useNavigate();
  const { errors, onSubmit, isPending } = useFormAction(
    (data) => {
      const password = fieldText(data, "pw2");
      return {
        nm: fieldText(data, "nm").trim() ? "" : "이름을 입력해 주세요.",
        dept: fieldText(data, "dept").trim() ? "" : "학과를 입력해 주세요.",
        sno: fieldText(data, "sno").trim() ? "" : "학번을 입력해 주세요.",
        mail2: emailMessage(fieldText(data, "mail2").trim()),
        pw2: signupPasswordMessage(password),
        pw3: fieldText(data, "pw3") === password ? "" : "비밀번호가 일치하지 않아요.",
        cohort: cohortMessage(fieldText(data, "cohort")),
      };
    },
    async (data) => {
      try {
        const account = await signUp({
          name: fieldText(data, "nm").trim(),
          department: fieldText(data, "dept").trim(),
          student_no: fieldText(data, "sno").trim(),
          email: fieldText(data, "mail2").trim(),
          password: fieldText(data, "pw2"),
          cohort: Number(fieldText(data, "cohort")),
        });
        say(`${account.name}님, 가입이 완료되었습니다`);
        void navigate("/scheduler");
      } catch (error) {
        say(reason(error));
      }
    },
  );

  return (
    <form aria-label="회원가입" noValidate onSubmit={onSubmit}>
      <Field name="nm" label="이름" type="text"
        autoComplete="name" placeholder="이름을 입력해주세요." error={errors.nm} />
      <Field name="dept" label="학과" type="text"
        autoComplete="organization" placeholder="학과를 입력해주세요" error={errors.dept} />
      <Field name="sno" label="학번" type="text" inputMode="numeric"
        autoComplete="off" placeholder="학번을 입력해주세요" error={errors.sno} />
      <Field name="mail2" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="이메일을 입력해주세요" error={errors.mail2} />
      <Field name="pw2" label="비밀번호" type="password" autoComplete="new-password"
        placeholder="대소문자·숫자·특수기호 포함 8~20자" error={errors.pw2} />
      <Field name="pw3" label="비밀번호 확인" type="password" autoComplete="new-password"
        placeholder="비밀번호를 한 번 더 입력해주세요." error={errors.pw3} />

      <Field name="cohort" label="기수" type="number" inputMode="numeric"
        autoComplete="off" placeholder="예: 46" error={errors.cohort} />

      <button className="go" type="submit" style={{ marginTop: 22 }} disabled={isPending}>
        {isPending ? "가입 중…" : "가입하기"}
      </button>
      <p className="foot">이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
    </form>
  );
}

// 계정이 있든 없든 같은 문구를 보여준다. 갈라 보여주면 그 이메일이 가입돼 있는지를
// 알려주는 셈이 된다 — 서버도 같은 이유로 같은 응답을 준다.
const MAIL_SENT = "메일을 보냈어요 · 전송된 메일을 확인해주세요";

export function FindId() {
  const { errors, onSubmit, isPending } = useFormAction(
    (data) => ({
      fidName: fieldText(data, "fidName").trim() ? "" : "이름을 입력해주세요.",
      fidMail: emailMessage(fieldText(data, "fidMail").trim()),
    }),
    async (data) => {
      try {
        await findId(fieldText(data, "fidName").trim(), fieldText(data, "fidMail").trim());
        say(MAIL_SENT);
      } catch (error) {
        say(reason(error));
      }
    },
  );

  return (
    <form aria-label="아이디 찾기" noValidate onSubmit={onSubmit}>
      <Field name="fidName" label="이름" type="text"
        autoComplete="name" placeholder="이름을 입력해주세요." error={errors.fidName} />
      <Field name="fidMail" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="이메일을 입력해주세요" error={errors.fidMail} />
      <button className="go" type="submit" style={{ marginTop: 22 }} disabled={isPending}>
        {isPending ? "찾는 중…" : "아이디 찾기"}
      </button>
      <p className="foot">
        <Link to="/find-password">비밀번호 찾기</Link> · <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}

export function FindPassword() {
  const { errors, onSubmit, isPending } = useFormAction(
    (data) => ({
      fpwMail: emailMessage(fieldText(data, "fpwMail").trim()),
    }),
    async (data) => {
      try {
        // 재설정 화면으로 바로 넘기지 않는다. 토큰은 메일로 가고, 그 메일의 링크가
        // 토큰을 주소에 달고 재설정 화면을 연다.
        await requestPasswordReset(fieldText(data, "fpwMail").trim());
        say(MAIL_SENT);
      } catch (error) {
        say(reason(error));
      }
    },
  );

  return (
    <form aria-label="비밀번호 찾기" noValidate onSubmit={onSubmit}>
      <Field name="fpwMail" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="이메일을 입력해주세요" error={errors.fpwMail} />
      <button className="go" type="submit" style={{ marginTop: 22 }} disabled={isPending}>
        {isPending ? "보내는 중…" : "재설정 메일 받기"}
      </button>
      <p className="foot">
        <Link to="/find-id">아이디 찾기</Link> · <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  // 메일의 링크가 /reset-password?token=... 으로 들어온다. 입력칸으로 받지 않는다 —
  // 43글자짜리 무작위 문자열을 사람이 옮겨 적을 자리가 아니다.
  const token = useSearchParams()[0].get("token") ?? "";

  const { errors, onSubmit, isPending } = useFormAction(
    (data) => {
      const fresh = fieldText(data, "rpwNew");
      const again = fieldText(data, "rpwAgain");
      return {
        rpwNew: strongPasswordMessage(fresh),
        rpwAgain: !again
          ? "비밀번호를 다시 한 번 입력해주세요."
          : again === fresh
            ? ""
            : "비밀번호가 일치하지 않아요.",
      };
    },
    async (data) => {
      if (!token) {
        say("재설정 메일 링크에 문제가 있는 것 같아요 · 비밀번호 찾기를 다시 시도해주세요");
        return;
      }
      try {
        await resetPassword(token, fieldText(data, "rpwNew"));
        say("비밀번호를 변경했어요 · 새 비밀번호로 로그인해주세요");
        // navigate 는 viewTransition 옵션을 줄 때만 Promise 를 돌려준다. 이 화면은
        // 그 옵션을 쓰지 않아 실제로는 항상 void 라 명시적으로 무시한다.
        void navigate("/login");
      } catch (error) {
        // 만료됐거나 이미 쓴 링크는 입력이 틀린 것이 아니라 서버가 거절한 것이다 —
        // 로그인 화면이 서버 거절을 알리는 자리와 같은 자리에 띄운다.
        say(reason(error));
      }
    },
  );

  return (
    <form aria-label="비밀번호 재설정" noValidate onSubmit={onSubmit}>
      <Field name="rpwNew" label="새 비밀번호" type="password" autoComplete="new-password"
        placeholder="새 비밀번호를 입력해주세요." error={errors.rpwNew} />
      <Field name="rpwAgain" label="비밀번호 확인" type="password" autoComplete="new-password"
        placeholder="비밀번호를 다시 한 번 입력해주세요." error={errors.rpwAgain} />
      <button className="go" type="submit" style={{ marginTop: 22 }} disabled={isPending}>
        {isPending ? "바꾸는 중…" : "비밀번호 재설정"}
      </button>
      <p className="foot"><Link to="/login">로그인으로 돌아가기</Link></p>
    </form>
  );
}
