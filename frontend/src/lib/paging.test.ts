import { describe, expect, test } from "vitest";

import { PER_PAGE, clampPage, pageCount, pageSlice, pageWindow } from "./paging";

const rows = Array.from({ length: 23 }, (_, index) => index + 1);

describe("pageCount", () => {
  test("딱 나누어떨어지면 그 몫이 쪽 수다", () => {
    expect(pageCount(20, 10)).toBe(2);
  });

  test("남는 것이 있으면 한 쪽을 더 둔다", () => {
    expect(pageCount(23, 10)).toBe(3);
  });

  test("글이 하나도 없어도 쪽은 하나다 — 빈 목록을 보여줄 자리가 필요하다", () => {
    expect(pageCount(0, 10)).toBe(1);
  });
});

describe("pageSlice", () => {
  test("첫 쪽은 앞에서부터 끊는다", () => {
    expect(pageSlice(rows, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("마지막 쪽은 남은 것만 준다", () => {
    expect(pageSlice(rows, 3, 10)).toEqual([21, 22, 23]);
  });

  test("범위를 벗어난 쪽은 빈 목록이다", () => {
    expect(pageSlice(rows, 9, 10)).toEqual([]);
  });
});

describe("clampPage", () => {
  test("글이 줄어 쪽이 사라지면 마지막 쪽으로 당긴다", () => {
    // 3쪽을 보고 있는데 글이 지워져 2쪽까지만 남은 경우다.
    expect(clampPage(3, 2)).toBe(2);
  });

  test("1보다 작은 쪽은 1로 올린다", () => {
    expect(clampPage(0, 5)).toBe(1);
  });

  test("범위 안이면 그대로 둔다", () => {
    expect(clampPage(2, 5)).toBe(2);
  });
});

describe("pageWindow", () => {
  test("쪽이 적으면 전부 보여준다", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  test("쪽이 많으면 지금 쪽 둘레만 보여준다", () => {
    expect(pageWindow(6, 20)).toEqual([4, 5, 6, 7, 8]);
  });

  test("앞쪽 끝에서는 뒤로 밀어 다섯 개를 채운다", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
  });

  test("뒤쪽 끝에서는 앞으로 당겨 다섯 개를 채운다", () => {
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
  });
});

describe("PER_PAGE", () => {
  test("한 쪽에 열 개를 둔다", () => {
    expect(PER_PAGE).toBe(10);
  });
});
