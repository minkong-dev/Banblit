// 오래 걸리는 계산을 접수하고 완료될 때까지 다시 조회(refetch: 같은 조회를 다시 보내 값을 갱신하는 것)하는 부분입니다.
// 화면이나 서버와 상호작용하지 않습니다. 실제 조회는 매개변수로 받은 read 가 합니다.
// 호출 순서는 pipeline.ts가 정합니다.

export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job<T> = {
  id: string;
  status: JobStatus;
  result: T | null;
  error: string | null;
};

/** 다시 조회하는 간격(밀리초)입니다. */
export const JOB_POLL_MS = 700;

/** 이 시간까지 끝나지 않으면 대기를 중단합니다(밀리초).
 *  배정안까지 계산하는 데 최대 22초가 측정된 적이 있어 그 약 3배인 60초로 설정합니다. */
export const JOB_DEADLINE_MS = 60000;

export async function awaitJob<T>(
  jobId: string,
  read: (id: string) => Promise<{ job: Job<T> }>,
  wait: (ms: number) => Promise<void>,
  now: () => number,
): Promise<T> {
  // jobId를 read에 넣어 상태를 받고, done이면 결과를, failed이면 사유를 발생시킵니다.
  // 그 외에는 wait만큼 기다린 후 다시 조회합니다. now가 정해둔 시각을 넘기면 중단합니다.
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
