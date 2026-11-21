import { describe, expect, test } from "vitest";
import { fakeCondition, fakeImage, fakeWebR } from "../testing/fake-webr.js";
import { evaluate } from "./evaluate.js";

/** The objects that the code of the first `captureR` call was evaluated with. */
async function bound(env: Record<string, unknown>) {
  const fake = fakeWebR();
  await evaluate(fake.webR, { code: "x", env }, { width: 600, height: 400 });
  const [, options] = fake.captureR.mock.calls[0] ?? [];
  return { fake, env: (options as { env: Record<string, unknown> }).env };
}

describe("bound objects", () => {
  test("a data frame is passed as it is and any other object as a list", async () => {
    const rows = [{ wt: 1 }, { wt: 2 }];
    const columns = { wt: [1, 2], am: [true, false] };
    const options = { title: "Cars", size: 2 };
    const { fake, env } = await bound({
      ".d1": rows,
      ".d2": columns,
      ".d3": options,
    });
    expect(env).toEqual({
      ".d1": { r: "data.frame", value: rows },
      ".d2": { r: "data.frame", value: columns },
      ".d3": { r: "list", value: options },
    });
    expect(fake.evalR).not.toHaveBeenCalled();
    expect(fake.purge).toHaveBeenCalledTimes(1);
  });

  test("date cells travel as seconds and their columns become date-times", async () => {
    const day = new Date("2026-01-02T00:00:00Z");
    const rows = [
      { day, n: 1, seen: day },
      { day: null, n: 2, seen: new Date(Number.NaN) },
    ];
    const { fake, env } = await bound({ ".d1": rows });
    const frame = {
      r: "data.frame",
      value: [
        { day: 1767312000, n: 1, seen: 1767312000 },
        { day: null, n: 2, seen: null },
      ],
    };
    expect(fake.evalR).toHaveBeenCalledWith(
      expect.stringContaining("lapply(x[columns], as.POSIXct"),
      { env: { x: frame, columns: ["day", "seen"] } },
    );
    expect(env[".d1"]).toBe(await fake.evalR.mock.results[0]?.value);
    expect(rows[0]?.day).toBe(day);
  });

  test("dates in a list travel as seconds and become date-times", async () => {
    const { fake, env } = await bound({
      ".d1": { from: new Date(1500), title: "Cars", steps: [1, 2] },
    });
    expect(fake.evalR).toHaveBeenCalledWith(expect.any(String), {
      env: {
        x: { r: "list", value: { from: 1.5, title: "Cars", steps: [1, 2] } },
        columns: ["from"],
      },
    });
    expect(env[".d1"]).toBe(await fake.evalR.mock.results[0]?.value);
  });

  test("date cells of an object of columns are converted too", async () => {
    const { fake } = await bound({
      ".d1": { day: [new Date(1500), null], n: [1, 2] },
    });
    expect(fake.evalR).toHaveBeenCalledWith(expect.any(String), {
      env: {
        x: { r: "data.frame", value: { day: [1.5, null], n: [1, 2] } },
        columns: ["day"],
      },
    });
  });
});

describe("plots", () => {
  test("returns the last plot at the given size and closes the earlier ones", async () => {
    const fake = fakeWebR();
    const [first, last] = [fakeImage(), fakeImage()];
    fake.captureR.mockResolvedValueOnce({
      images: [first, last],
      output: [],
      result: {},
    });
    const result = await evaluate(
      fake.webR,
      { code: "plot(1)", env: {} },
      { width: 600, height: 400 },
    );
    expect(fake.captureR).toHaveBeenCalledWith("plot(1)", {
      env: {},
      captureGraphics: { width: 600, height: 400, bg: "white" },
      withAutoprint: true,
    });
    expect(result.image).toBe(last);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(last.close).not.toHaveBeenCalled();
  });

  test("does not capture plots without a size", async () => {
    const fake = fakeWebR();
    fake.captureR.mockResolvedValueOnce({ images: [], output: [], result: {} });
    const result = await evaluate(fake.webR, { code: "1", env: {} });
    expect(fake.captureR).toHaveBeenCalledWith("1", {
      env: {},
      captureGraphics: false,
      withAutoprint: true,
    });
    expect(result.image).toBeNull();
  });
});

describe("output", () => {
  test("keeps the order and reads the text of messages and warnings", async () => {
    const fake = fakeWebR();
    fake.captureR.mockResolvedValueOnce({
      images: [],
      output: [
        { type: "stdout", data: "[1] 1" },
        { type: "message", data: fakeCondition("two lines\nof note\n") },
        { type: "stderr", data: "to stderr" },
        { type: "warning", data: fakeCondition("careful") },
        { type: "stdout", data: "" },
        { type: "prompt", data: "> " },
      ],
      result: {},
    });
    const { output } = await evaluate(fake.webR, { code: "x", env: {} });
    expect(output).toEqual([
      { type: "stdout", text: "[1] 1" },
      { type: "message", text: "two lines\nof note" },
      { type: "stderr", text: "to stderr" },
      { type: "warning", text: "careful" },
      { type: "stdout", text: "" },
    ]);
  });

  test("purges the shelter when R fails", async () => {
    const fake = fakeWebR();
    fake.captureR.mockRejectedValueOnce(new Error("boom"));
    await expect(evaluate(fake.webR, { code: "x", env: {} })).rejects.toThrow(
      "boom",
    );
    expect(fake.purge).toHaveBeenCalledTimes(1);
  });
});
