import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { Field, failures, fieldText } from "../components/Field";
import type { Errors } from "../components/Field";
import { GoogleIcon, KakaoIcon } from "../components/icons";
import { emailMessage, passwordMessage, phoneMessage, strongPasswordMessage } from "../lib/validate";
import { useToast } from "../useToast";
import { usePage } from "../usePage";
import "../styles/account.css";

// 사진은 화면에 붙박이로 두고 오른쪽 서식만 갈아 끼운다. 다섯 화면이 한 자리를 나눠 쓴다.
// 주소가 다섯 개로 나뉘어 있어 뒤로 가기와 링크 보내기가 제대로 동작하고,
// layout route 라 화면을 오갈 때 왼쪽 사진은 다시 그려지지 않는다.
const HEADS: Record<string, { title: string; sub: string }> = {
  "/login": { title: "로그인", sub: "유일무이 버스킹 동아리 여섯줄 안에서." },
  "/signup": { title: "회원가입", sub: "가입에 필요한 양식을 작성해주세요." },
  "/find-id": { title: "아이디 찾기", sub: "가입한 이메일로 찾기" },
  "/find-password": { title: "비밀번호 찾기", sub: "가입한 휴대전화 번호로 찾기" },
  "/reset-password": { title: "비밀번호 재설정", sub: "대소문자, 숫자, 특수기호 포함 8~20자" },
};

type AccountContext = { say: (message: string) => void };

export function AccountLayout() {
  usePage("account");
  const { message, say } = useToast();
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
            <Outlet context={{ say } satisfies AccountContext} />
          </div>

          <div className="legal">
            <a href="#">서비스 이용약관</a>
            <a href="#">개인정보 처리방침</a>
          </div>
        </main>
      </div>

      <div className={message ? "ok on" : "ok"} role="status" aria-live="polite">{message}</div>
    </>
  );
}

/** 검사에 걸리면 사유를 화면에 걸고 멈춘다. 다 통과했을 때만 onPass 로 넘어간다. */
function useSubmit() {
  const [errors, setErrors] = useState<Errors>({});
  const submit =
    (check: (form: HTMLFormElement) => Errors, onPass: (form: HTMLFormElement) => void) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const bad = failures(check(form));
      setErrors(bad);
      if (Object.keys(bad).length === 0) onPass(form);
    };
  return { errors, submit };
}

export function SignIn() {
  const { say } = useOutletContext<AccountContext>();
  const { errors, submit } = useSubmit();

  return (
    <form
      aria-label="로그인"
      noValidate
      onSubmit={submit(
        (form) => ({
          mail: emailMessage(fieldText(form, "mail").trim()),
          pw: passwordMessage(fieldText(form, "pw")),
        }),
        () => say("로그인했어요"),
      )}
    >
      <Field name="mail" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="name@example.com" error={errors.mail} />
      <Field name="pw" label="비밀번호" type="password"
        autoComplete="current-password" placeholder="8자 이상" error={errors.pw} />
      <div className="row">
        <label className="keep"><input type="checkbox" name="keep" /> 로그인 상태 유지</label>
        <span className="links">
          <Link to="/find-id">아이디 찾기</Link>
          <Link to="/find-password">비밀번호 찾기</Link>
        </span>
      </div>
      <button className="go" type="submit">로그인</button>

      <div className="or">또는</div>
      <div className="social">
        <button type="button" className="google" onClick={() => say("구글 계정으로 넘어가요")}>
          <GoogleIcon />구글로 계속하기
        </button>
        <button type="button" className="kakao" onClick={() => say("카카오 계정으로 넘어가요")}>
          <KakaoIcon />카카오로 계속하기
        </button>
      </div>

      <p className="foot">계정이 없으신가요? <Link to="/signup">회원가입</Link></p>
    </form>
  );
}

const POSITIONS = ["보컬", "기타", "베이스", "드럼", "키보드", "서포터즈"];

export function SignUp() {
  const { say } = useOutletContext<AccountContext>();
  const { errors, submit } = useSubmit();
  const [positions, setPositions] = useState<string[]>([]);

  const toggle = (name: string) =>
    setPositions((chosen) =>
      chosen.includes(name) ? chosen.filter((item) => item !== name) : [...chosen, name],
    );

  return (
    <form
      aria-label="회원가입"
      noValidate
      onSubmit={submit(
        (form) => {
          const password = fieldText(form, "pw2");
          return {
            nm: fieldText(form, "nm").trim() ? "" : "이름을 입력해 주세요.",
            mail2: emailMessage(fieldText(form, "mail2").trim()),
            pw2: passwordMessage(password),
            pw3: fieldText(form, "pw3") === password ? "" : "비밀번호가 일치하지 않아요.",
            // 포지션은 입력칸이 아니라 누름 단추라 사유를 서식 아래에 따로 띄운다.
            positions: positions.length ? "" : "포지션을 하나 이상 골라 주세요.",
          };
        },
        (form) => say(`${fieldText(form, "nm").trim()}님, 가입됐어요 · ${positions.join(", ")}`),
      )}
    >
      <Field name="nm" label="이름" type="text"
        autoComplete="name" placeholder="이름을 입력해주세요." error={errors.nm} />
      <Field name="mail2" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="name@example.com" error={errors.mail2} />
      <Field name="pw2" label="비밀번호" type="password" autoComplete="new-password"
        placeholder="비밀번호는 8자 이상 입력해주세요." error={errors.pw2} />
      <Field name="pw3" label="비밀번호 확인" type="password" autoComplete="new-password"
        placeholder="비밀번호를 한 번 더 입력해주세요." error={errors.pw3} />

      <p className="cap">담당 세션 <small>여러 포지션을 고를 수 있어요</small></p>
      <div className="picks" role="group" aria-label="포지션">
        {POSITIONS.map((name) => (
          <button key={name} type="button" aria-pressed={positions.includes(name)}
            onClick={() => toggle(name)}>{name}</button>
        ))}
      </div>
      <p className={errors.positions ? "posbad on" : "posbad"}>포지션을 하나 이상 골라 주세요.</p>

      <button className="go" type="submit" style={{ marginTop: 22 }}>가입하기</button>
      <p className="foot">이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
    </form>
  );
}

export function FindId() {
  const { say } = useOutletContext<AccountContext>();
  const { errors, submit } = useSubmit();

  return (
    <form
      aria-label="아이디 찾기"
      noValidate
      onSubmit={submit(
        (form) => ({
          fidName: fieldText(form, "fidName").trim() ? "" : "이름을 입력해주세요.",
          fidMail: emailMessage(fieldText(form, "fidMail").trim()),
        }),
        () => say("가입한 이메일로 아이디를 보냈어요"),
      )}
    >
      <Field name="fidName" label="이름" type="text"
        autoComplete="name" placeholder="이름을 입력해주세요." error={errors.fidName} />
      <Field name="fidMail" label="이메일" type="email" inputMode="email"
        autoComplete="email" placeholder="name@example.com" error={errors.fidMail} />
      <button className="go" type="submit" style={{ marginTop: 22 }}>아이디 찾기</button>
      <p className="foot">
        <Link to="/find-password">비밀번호 찾기</Link> · <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}

export function FindPassword() {
  const { say } = useOutletContext<AccountContext>();
  const { errors, submit } = useSubmit();
  const navigate = useNavigate();

  return (
    <form
      aria-label="비밀번호 찾기"
      noValidate
      onSubmit={submit(
        (form) => ({
          fpwId: fieldText(form, "fpwId").trim() ? "" : "아이디를 입력해주세요.",
          fpwTel: phoneMessage(fieldText(form, "fpwTel")),
        }),
        () => {
          // 본인 확인이 끝나야 재설정 화면으로 넘어간다. 서버가 생기면 이 자리에서
          // 받은 토큰을 주소에 실어 넘긴다 — 지금은 확인만 하고 넘긴다.
          say("본인 확인이 끝났어요 · 새 비밀번호를 정해주세요");
          navigate("/reset-password");
        },
      )}
    >
      <Field name="fpwId" label="아이디" type="text"
        autoComplete="username" placeholder="아이디를 입력해주세요." error={errors.fpwId} />
      <Field name="fpwTel" label="전화번호" type="tel" inputMode="tel"
        autoComplete="tel" placeholder="숫자만 입력해주세요." error={errors.fpwTel} />
      <button className="go" type="submit" style={{ marginTop: 22 }}>휴대전화 인증</button>
      <p className="foot">
        <Link to="/find-id">아이디 찾기</Link> · <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}

export function ResetPassword() {
  const { say } = useOutletContext<AccountContext>();
  const { errors, submit } = useSubmit();
  const navigate = useNavigate();

  return (
    <form
      aria-label="비밀번호 재설정"
      noValidate
      onSubmit={submit(
        (form) => {
          const fresh = fieldText(form, "rpwNew");
          const again = fieldText(form, "rpwAgain");
          return {
            rpwNew: strongPasswordMessage(fresh),
            rpwAgain: !again
              ? "비밀번호를 다시 한 번 입력해주세요."
              : again === fresh
                ? ""
                : "비밀번호가 일치하지 않아요.",
          };
        },
        () => {
          say("비밀번호를 바꿨어요 · 새 비밀번호로 로그인해주세요");
          navigate("/login");
        },
      )}
    >
      <Field name="rpwNew" label="새 비밀번호" type="password" autoComplete="new-password"
        placeholder="새 비밀번호를 입력해주세요." error={errors.rpwNew} />
      <Field name="rpwAgain" label="비밀번호 확인" type="password" autoComplete="new-password"
        placeholder="비밀번호를 다시 한 번 입력해주세요." error={errors.rpwAgain} />
      <button className="go" type="submit" style={{ marginTop: 22 }}>비밀번호 재설정</button>
      <p className="foot"><Link to="/login">로그인으로 돌아가기</Link></p>
    </form>
  );
}
