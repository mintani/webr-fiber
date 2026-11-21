import { describe, expect, test } from "vitest";
import { sameJob } from "./runner.js";

const job = (data: unknown, extra: object = {}) => ({
  code: "f(.d1)",
  env: { ".d1": data },
  ...extra,
});
const day = (iso: string) => new Date(iso);
const rows = [{ wt: 1, model: "a" }];
const buffer = new Float64Array([1, 2]);

describe("sameJob", () => {
  test("nothing equals the first job", () => {
    expect(sameJob(null, job(rows))).toBe(false);
  });

  test.each([
    ["the same object", rows, rows],
    ["a new array of the same rows", rows, rows.filter(() => true)],
    ["equal rows", rows, [{ wt: 1, model: "a" }]],
    ["equal columns", { wt: [1, 2] }, { wt: [1, 2] }],
    ["equal dates", [{ at: day("2026-01-02") }], [{ at: day("2026-01-02") }]],
    ["invalid dates", [day("x")], [day("y")]],
    ["equal nested lists", { a: { b: [1, null] } }, { a: { b: [1, null] } }],
    ["NaN", [{ x: Number.NaN }], [{ x: Number.NaN }]],
    ["the same typed array", { x: buffer }, { x: buffer }],
  ])("%s is the same data", (_label, a, b) => {
    expect(sameJob(job(a), job(b))).toBe(true);
  });

  test.each([
    ["another value", rows, [{ wt: 2, model: "a" }]],
    ["another row count", rows, [...rows, ...rows]],
    ["another column", rows, [{ wt: 1, model: "a", hp: 1 }]],
    ["a missing column", [{ wt: 1, hp: 1 }], [{ wt: 1 }]],
    ["another date", [day("2026-01-02")], [day("2026-01-03")]],
    ["rows instead of columns", [{ wt: 1 }], { wt: [1] }],
    ["an equal typed array", new Float64Array([1]), new Float64Array([1])],
    ["null instead of an object", { a: null }, { a: {} }],
  ])("%s is other data", (_label, a, b) => {
    expect(sameJob(job(a), job(b))).toBe(false);
  });

  test("the code, the names of the objects and the options count", () => {
    const base = job(rows, { width: 600 });
    expect(sameJob(base, job(rows, { width: 600 }))).toBe(true);
    expect(sameJob(base, job(rows, { width: 300 }))).toBe(false);
    expect(sameJob(base, { ...base, code: "g(.d1)" })).toBe(false);
    expect(sameJob(base, { ...base, env: { ".d2": rows } })).toBe(false);
    expect(sameJob(base, { ...base, env: {} })).toBe(false);
  });
});
