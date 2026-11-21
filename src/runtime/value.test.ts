import { describe, expect, test } from "vitest";
import { fakeValue, fakeWebR } from "../testing/fake-webr.js";
import { evaluateValue, fromR } from "./value.js";
import type { Tree } from "./value.js";

const atomic = (
  type: string,
  values: unknown[],
  names: (string | null)[] | null = null,
): Tree => ({ type, names, values });
const list = (
  values: Tree[],
  names: (string | null)[] | null = null,
): Tree => ({
  type: "list",
  names,
  values,
});
/** The tree that the R side sends for a data frame. */
const frame = (columns: Record<string, Tree>): Tree =>
  list(
    [list(Object.values(columns), Object.keys(columns))],
    ["webr-fiber:rows"],
  );

describe("fromR", () => {
  test("NULL becomes null", () => {
    expect(fromR({ type: "null" })).toBeNull();
  });

  test("a vector becomes an array, also with one element", () => {
    expect(fromR(atomic("double", [2]))).toEqual([2]);
    expect(fromR(atomic("character", ["a", null]))).toEqual(["a", null]);
    expect(fromR(atomic("logical", []))).toEqual([]);
  });

  test("a vector with a name for every element becomes an object", () => {
    expect(
      fromR(atomic("double", [37.3, -5.3], ["(Intercept)", "wt"])),
    ).toEqual({ "(Intercept)": 37.3, wt: -5.3 });
  });

  test.each([
    ["an empty name", ["a", ""]],
    ["a missing name", ["a", null]],
    ["a repeated name", ["a", "a"]],
  ])("a vector with %s stays an array", (_label, names) => {
    expect(fromR(atomic("double", [1, 2], names))).toEqual([1, 2]);
  });

  test("a list becomes an array or an object of converted elements", () => {
    expect(
      fromR(list([atomic("double", [1]), atomic("character", ["a"])])),
    ).toEqual([[1], ["a"]]);
    expect(
      fromR(
        list(
          [atomic("double", [0.93]), list([atomic("character", ["x"])], ["c"])],
          ["p.value", "nested"],
        ),
      ),
    ).toEqual({ "p.value": [0.93], nested: { c: ["x"] } });
  });

  test("a data frame becomes an array of row objects", () => {
    expect(
      fromR(
        frame({
          cyl: atomic("double", [4, 6]),
          model: atomic("character", ["Fiat", null]),
        }),
      ),
    ).toEqual([
      { cyl: 4, model: "Fiat" },
      { cyl: 6, model: null },
    ]);
  });

  test("a data frame without rows or columns becomes an empty array", () => {
    expect(fromR(frame({ cyl: atomic("double", []) }))).toEqual([]);
    expect(fromR(frame({}))).toEqual([]);
  });

  test("a column that is a list, a matrix or a data frame gives one value per row", () => {
    expect(
      fromR(
        frame({
          id: atomic("integer", [1, 2], ["a", "b"]),
          items: list([atomic("double", [1, 2]), atomic("character", ["x"])]),
          tagged: list(
            [atomic("double", [1]), atomic("double", [2])],
            ["a", "b"],
          ),
          stats: list([
            atomic("double", [20, 3], ["mean", "sd"]),
            atomic("double", [15, 2], ["mean", "sd"]),
          ]),
          inner: frame({ n: atomic("double", [7, 8]) }),
        }),
      ),
    ).toEqual([
      {
        id: 1,
        items: [1, 2],
        tagged: [1],
        stats: { mean: 20, sd: 3 },
        inner: { n: 7 },
      },
      {
        id: 2,
        items: ["x"],
        tagged: [2],
        stats: { mean: 15, sd: 2 },
        inner: { n: 8 },
      },
    ]);
  });

  test("a data frame inside a list is converted too", () => {
    expect(
      fromR(list([frame({ n: atomic("double", [1]) })], ["data"])),
    ).toEqual({ data: [{ n: 1 }] });
  });
});

describe("evaluateValue", () => {
  test("runs the code without printing, then converts its result in R", async () => {
    const fake = fakeWebR();
    const result = { r: "result" };
    fake.captureR.mockResolvedValueOnce({ images: [], output: [], result });
    fake.evalR.mockResolvedValueOnce(fakeValue(atomic("double", [2])));
    const rows = [{ wt: 1 }];
    const value = await evaluateValue(fake.webR, {
      code: "mean(.d1$wt)",
      env: { ".d1": rows },
    });
    expect(value).toEqual([2]);
    expect(fake.captureR).toHaveBeenCalledWith("mean(.d1$wt)", {
      env: { ".d1": { r: "data.frame", value: rows } },
      captureGraphics: false,
    });
    expect(fake.evalR).toHaveBeenCalledWith(
      expect.stringContaining("plain(x)"),
      { env: { x: result } },
    );
    expect(fake.purge).toHaveBeenCalledTimes(1);
  });

  test("purges the shelter when the conversion fails", async () => {
    const fake = fakeWebR();
    fake.evalR.mockRejectedValueOnce(new Error("cannot convert"));
    await expect(
      evaluateValue(fake.webR, { code: "sum", env: {} }),
    ).rejects.toThrow("cannot convert");
    expect(fake.purge).toHaveBeenCalledTimes(1);
  });
});
