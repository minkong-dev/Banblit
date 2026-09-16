// 설정 화면의 블라인드 구역입니다. 가려 둔 글을 한 표에서 보고 되돌립니다.
// "타 멤버 글 삭제 및 블라인드"(board_moderate) 권한자에게만 이 탭이 표시됩니다.
// 가려진 글은 목록과 상세에서 빠지므로 작성자 본인도 볼 수 없고, 이 표가 그 글을 보는 유일한 자리입니다.
// 서버도 같은 권한으로 조회와 되돌리기를 받습니다(routers/boards.py 의 read_blinded_posts·unblind_post).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card } from "../components/AppShell";
import { reason } from "../lib/api";
import { getJSON, stampLabel } from "../lib/pipeline";
import { say } from "../lib/toast";
import { SectionHead } from "./SettingsForm";
import type { Post } from "../lib/contract";

export const BLINDED_KEY = ["blinded-posts"] as const;

export function BlindedCards() {
  const client = useQueryClient();

  const list = useQuery({
    queryKey: BLINDED_KEY,
    queryFn: () => getJSON<{ posts: Post[] }>("/blinded-posts"),
  });

  const lift = useMutation({
    mutationFn: (post: Post) => getJSON(`/posts/${post.id}/blind`, { method: "DELETE" }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: BLINDED_KEY });
      // 되돌린 글이 원래 목록에 다시 나타나야 합니다. 공지와 팀 게시판 중 어느 쪽인지 여기서
      // 가리지 않고 둘 다 다시 불러옵니다.
      void client.invalidateQueries({ queryKey: ["notices"] });
      void client.invalidateQueries({ queryKey: ["posts"] });
    },
    onSuccess: () => say("블라인드를 해제했어요."),
    onError: (error) => say(reason(error, "블라인드를 해제하지 못했어요.")),
  });

  const posts = list.data?.posts ?? [];

  return (
    <Card>
      <SectionHead title="블라인드" desc="가려 둔 글이에요. 해제하면 원래 게시판으로 돌아가요." />

      <div className="roster">
        {list.isError ? <p className="empty">{reason(list.error)}</p> : null}
        <table>
          <thead>
            <tr>
              <th>글</th>
              <th>작성자</th>
              <th>올린 날</th>
              <th>가린 사람</th>
              <th className="fill" aria-hidden="true" />
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>{post.title}</td>
                <td>{post.author}</td>
                <td>{stampLabel(post.created_at)}</td>
                {/* 가린 사람의 계정이 삭제되면 이름이 비므로, 그때는 줄표를 표시합니다. */}
                <td>{post.blinded_by ?? "—"}</td>
                <td className="fill" />
                <td>
                  <button
                    className="btn"
                    type="button"
                    // 해제 중인 행만 비활성화합니다. 전부 막으면 어느 글을 처리 중인지 알 수 없습니다.
                    disabled={lift.isPending && lift.variables?.id === post.id}
                    aria-label={`${post.title} 블라인드 해제`}
                    onClick={() => lift.mutate(post)}
                  >
                    해제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isPending ? <p className="empty">가려 둔 글을 불러오고 있어요.</p> : null}
        {list.isSuccess && posts.length === 0 ? <p className="empty">가려 둔 글이 없어요</p> : null}
      </div>
    </Card>
  );
}
