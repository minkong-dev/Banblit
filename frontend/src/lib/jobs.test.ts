import { describe, expect, it, vi } from "vitest";

import { JOB_DEADLINE_MS, awaitJob } from "./jobs";
import type { Job } from "./jobs";

function job(status: Job<string>["status"], extra: Partial<Job<string>> = {}): { job: Job<string> } {
  return { job: { id: "j1", status, result: null, error: null, ...extra } };
}

describe("awaitJob", () => {
  const nowait = () => Promise.resolve();

  it("끝난 작업의 결과를 돌려준다", async () => {
    const read = vi.fn().mockResolvedValue(job("done", { result: "결과" }));
    await expect(awaitJob("j1", read, nowait, () => 0)).resolves.toBe("결과");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("끝날 때까지 되묻는다", async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(job("queued"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("done", { result: "결과" }));
    await expect(awaitJob("j1", read, nowait, () => 0)).resolves.toBe("결과");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("실패하면 서버가 준 사유를 그대로 올린다", async () => {
    const read = vi.fn().mockResolvedValue(job("failed", { error: "자리를 못 찾았습니다" }));
    await expect(awaitJob("j1", read, nowait, () => 0)).rejects.toThrow("자리를 못 찾았습니다");
  });

  it("사유 없이 실패하면 사람이 읽을 문장을 대신 올린다", async () => {
    const read = vi.fn().mockResolvedValue(job("failed"));
    await expect(awaitJob("j1", read, nowait, () => 0)).rejects.toThrow("계산하지 못했습니다");
  });

  it("정해둔 시각을 넘기면 기다리기를 그만둔다", async () => {
    const read = vi.fn().mockResolvedValue(job("running"));
    let clock = 0;
    const tick = () => { clock += JOB_DEADLINE_MS / 2; return Promise.resolve(); };
    await expect(awaitJob("j1", read, tick, () => clock)).rejects.toThrow(
      `계산이 ${JOB_DEADLINE_MS / 1000}초 안에 끝나지 않았습니다`,
    );
  });

  it("결과가 비어 있는 done 은 결과 없음으로 올린다", async () => {
    const read = vi.fn().mockResolvedValue(job("done"));
    await expect(awaitJob("j1", read, nowait, () => 0)).rejects.toThrow("계산 결과가 비어 있습니다");
  });
});
