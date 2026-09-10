// 오래 걸리는 계산을 접수하고 끝날 때까지 되묻는 부분. 화면도 서버도 건드리지 않는다 —
// 실제로 묻는 일은 넘겨받은 read 가 한다. 부르는 순서는 pipeline.ts 가 정한다.

export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job<T> = {
  id: string;
  status: JobStatus;
  result: T | null;
  error: string | null;
};

/** 되묻는 간격(밀리초). */
export const JOB_POLL_MS = 700;

/** 여기까지도 안 끝나면 기다리기를 그만둔다(밀리초).
 *  조율안까지 20초대가 나온 적이 있어 그 세 배쯤을 둔다. */
export const JOB_DEADLINE_MS = 60000;

export async function awaitJob<T>(
  jobId: string,
  read: (id: string) => Promise<{ job: Job<T> }>,
  wait: (ms: number) => Promise<void>,
  now: () => number,
): Promise<T> {
  // jobId 를 read 에 넣어 상태를 받고, done 이면 결과를, failed 면 사유를 올린다.
  // 그 밖이면 wait 만큼 쉬었다 다시 묻는다. now 가 정해둔 시각을 넘기면 그만둔다.
  const until = now() + JOB_DEADLINE_MS;
  for (;;) {
    const { job } = await read(jobId);
    if (job.status === "done") {
      if (job.result === null) throw new Error("연산된 결과를 받지 못했어요.");
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error ?? "연산을 진행하지 못했어요.");
    }
    if (now() >= until) {
      throw new Error(`스케줄링 엔진이 ${JOB_DEADLINE_MS / 1000}초 안에 연산되지 않았어요.`);
    }
    await wait(JOB_POLL_MS);
  }
}
