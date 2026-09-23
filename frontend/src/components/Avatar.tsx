// 사람 한 명을 나타내는 동그라미입니다. 프로필 사진이 있으면 사진을, 없으면 이름 앞 두 글자를
// 표시합니다. 사진이 있는지는 서버에 따로 묻지 않고 주소를 그대로 표시해 봅니다 — 없으면 404 가
// 오고 그때 이름으로 바꿉니다. 응답마다 있음·없음을 싣는 것보다 고치는 곳이 적습니다.

import { useEffect, useState } from "react";

import { apiUrl } from "../lib/api";

export function Avatar({ id, name, className = "face", photo }: {
  /** 계정 번호입니다. 번호를 모르는 자리(작성자 이름만 받은 목록 등)는 null 을 넣습니다. */
  id: number | null;
  name: string;
  /** 동그라미의 크기·색을 정하는 기존 스타일 이름입니다. 자리마다 다른 크기를 씁니다. */
  className?: string;
  /** 사진의 저장 파일명입니다. 사진을 바꾸면 이 값이 바뀌어 다시 불러옵니다. 사진 주소는 계정
   *  번호로 고정이라, 이 값이 없으면 올린 뒤에도 브라우저가 옛 사진이나 빈 자리를 계속 표시합니다. */
  photo?: string | null;
}) {
  const [missing, setMissing] = useState(false);

  // 사진이 바뀌면 "없음"으로 판정했던 것을 취소하고 다시 불러옵니다.
  useEffect(() => { setMissing(false); }, [id, photo]);

  if (id === null || missing) {
    return <span className={className} aria-hidden="true">{name.slice(0, 2)}</span>;
  }
  return (
    <img
      className={className}
      src={apiUrl(`/members/${id}/avatar`) + (photo ? `?v=${photo}` : "")}
      alt=""
      onError={() => setMissing(true)}
    />
  );
}
