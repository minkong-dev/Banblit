// 오래 걸리는 계산을 접수하고 완료될 때까지 다시 조회(refetch: 같은 조회를 다시 보내 값을 갱신하는 것)하는 부분입니다.
// 화면이나 서버와 상호작용하지 않습니다. 실제 조회는 매개변수로 받은 read 가 합니다.
// 호출 순서는 pipeline.ts가 결정합니다.

export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job<T> = {
  id: string;
  status: JobStatus;
  result: T | null;
  error: string | null;
};

/** 다시 조회하는 간격(밀리초)입니다. */
export const JOB_POLL_MS = 700;

/** 서버가 배정 작업 1개에 쓰는 최대 시간(초)입니다. 조율안 상한 300초(resolution.py 의
 *  RESOLUTION_TIME_LIMIT_SECONDS)에 마지막 solver 계산 1회 60초(assignment.py 의
 *  SOLVER_TIME_LIMIT_SECONDS)를 더한 값입니다. 서버의 두 값을 변경하면 이 값도 함께 변경합니다. */
const SERVER_JOB_LIMIT_SECONDS = 300 + 60;

/** 서버 상한에 더하는 여유(초)입니다. 결과 저장과 마지막 조회 간격만큼입니다. */
const DEADLINE_MARGIN_SECONDS = 30;

/** 이 시간까지 끝나지 않으면 대기를 중단합니다(밀리초). 서버 상한보다 먼저 중단하면 화면은 실패를
 *  표시하고 서버는 계산을 계속해 저장하므로, 실패한 배정이 나중에 반영됩니다.
 *  ponytail: queue 대기 시간은 포함하지 않습니다. 동시 작업 수(ASSIGN_MAX_CONCURRENT_JOBS)를 넘겨 접수된
 *  작업은 이 시간을 넘길 수 있습니다. 그 경우가 실제로 발생하면 queued 상태에서는 시간을 세지 않게 변경합니다. */
export const JOB_DEADLINE_MS = (SERVER_JOB_LIMIT_SECONDS + DEADLINE_MARGIN_SECONDS) * 1000;

export async function awaitJob<T>(
  jobId: string,
  read: (id: string) => Promise<{ job: Job<T> }>,
  wait: (ms: number) => Promise<void>,
  now: () => number,
): Promise<T> {
  // jobId를 read에 넣어 상태를 받고, done이면 결과를, failed이면 사유를 발생시킵니다.
  // 그 외에는 wait만큼 기다린 후 다시 조회합니다. now가 지정한 시각을 넘기면 중단합니다.
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
