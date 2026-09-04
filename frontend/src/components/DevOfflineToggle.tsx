import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { setDevOffline } from "../lib/pipeline";


/** 사이드바 맨 아래의 개발용 스위치. 켜면 setDevOffline(true) 로 다음 요청부터 getJSON 이
 *  서버가 끊긴 것처럼 실패하게 하고, invalidateQueries() 로 화면이 가진 쿼리를 다시
 *  돌려 그 실패를 바로 보여준다. 끄면 반대로 되돌린다. 부르는 자리(Scheduler.tsx,
 *  Assignment.tsx)가 import.meta.env.DEV 로 감싸므로 배포 빌드에는 이 파일이 들어가지 않는다. */
export function DevOfflineToggle() {
  const client = useQueryClient();
  const [checked, setChecked] = useState(false);

  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setDevOffline(next);
          void client.invalidateQueries();
        }}
      />
      연결 끊긴 상태로 보기
    </label>
  );
}
