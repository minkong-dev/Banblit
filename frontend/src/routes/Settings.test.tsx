// AdminArea 는 관리 메뉴 주소마다 권한을 확인합니다. 권한이 없으면 /settings 로 이동시키고(Navigate) 구역을 그리지 않습니다.
// /me 응답은 ME_KEY cache 에 미리 넣고 react-dom/server 로 렌더링합니다. Navigate 는 effect 에서 이동하므로 문자열에는 아무것도 남지 않습니다.

import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ME_KEY } from "../components/queries";
import type { Account, Me, Permission } from "../lib/contract";
import { AdminArea } from "./Settings";

function render(permissions: Permission[] | null): string {
  const client = new QueryClient();
  if (permissions !== null) {
    const account: Account = {
      id: 1, name: "김민수", email: "a@b.c", login_id: "minsu1", avatar: null, role: "member",
      permissions, permission_sets: [], cohort: 46, department: null,
    };
    client.setQueryData<Me>(ME_KEY, { account, teams: [], linked_social: [] });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminArea section="rooms"><p>합주실 구역</p></AdminArea>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminArea — 관리 메뉴 권한 확인", () => {
  it("구역의 권한 중 하나라도 있으면 구역을 그린다", () => {
    expect(render(["room_edit"])).toContain("합주실 구역");
  });

  it("권한이 없으면 구역을 그리지 않는다", () => {
    expect(render(["board_moderate"])).not.toContain("합주실 구역");
  });

  it("계정을 아직 받지 못했으면 구역을 그린다. 서버가 요청마다 권한을 다시 검증한다", () => {
    expect(render(null)).toContain("합주실 구역");
  });
});
