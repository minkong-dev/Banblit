// 설정 화면의 블라인드 구역입니다. 블라인드한 글을 표 1개로 표시하고 블라인드를 해제합니다.
// "타 멤버 글 삭제 및 블라인드"(board_moderate) 권한자에게만 이 탭이 표시됩니다.
// 가려진 글은 목록과 상세에서 빠지므로 작성자 본인도 볼 수 없고, 이 표가 그 글을 보는 유일한 자리입니다.
// 서버도 같은 권한으로 조회와 되돌리기를 받습니다(routers/boards.py 의 read_blinded_posts, unblind_post).

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, Empty } from "../components/controls";
import { Card, SectionHead } from "../components/Layout";
import { reason } from "../lib/api";
import { say } from "../components/toast";
import { loadState } from "../lib/loading";
import type { Post } from "../lib/contract";
import { BLINDED_KEY, BOARD_KEY, useBlindedPosts } from "../components/queries";
import { unblindPost } from "../lib/pipeline";
import { stampLabel } from "../lib/calendar";

export function BlindedCards() {
  const client = useQueryClient();

  const list = useBlindedPosts();

  const lift = useMutation({
    mutationFn: (post: Post) => unblindPost(post.id),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: BLINDED_KEY });
      // 해제한 글이 원래 목록에 다시 나타나야 합니다. 공지와 팀 게시판 중 어느 쪽인지 여기서
      // 구분하지 않고 게시판 query 전부를 다시 조회합니다.
      void client.invalidateQueries({ queryKey: BOARD_KEY });
    },
    onSuccess: () => say("블라인드를 해제했어요."),
    onError: (error) => say(reason(error, "블라인드를 해제하지 못했어요.")),
  });

  const posts = list.data ?? [];
  const state = loadState(list);

  return (
    <Card>
      <SectionHead title="블라인드" desc="블라인드한 글이에요. 해제하면 원래 게시판에 다시 표시돼요." />

      <div className="roster">
        {state.kind === "failed" ? <Empty text={state.why} /> : null}
        <table>
          <thead>
            <tr>
              <th>글</th>
              <th>작성자</th>
              <th>작성일</th>
              <th>블라인드한 멤버</th>
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
                {/* 블라인드한 멤버의 계정이 삭제되면 이름이 비므로, 그때는 줄표를 표시합니다. */}
                <td>{post.blinded_by ?? "—"}</td>
                <td className="fill" />
                <td>
                  <Button
                    kind="ghost"
                    // 해제 중인 행만 비활성화합니다. 전부 막으면 어느 글을 처리 중인지 알 수 없습니다.
                    disabled={lift.isPending && lift.variables?.id === post.id}
                    aria-label={`${post.title} 블라인드 해제`}
                    onClick={() => lift.mutate(post)}
                  >
                    해제
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.kind !== "failed" && posts.length === 0 ? (
          <Empty state={state} text="블라인드한 글이 존재하지 않아요" />
        ) : null}
      </div>
    </Card>
  );
}
