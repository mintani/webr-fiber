import { describe, expect, test } from "vitest";
import { fakeWebR } from "../testing/fake-webr.js";
import { evaluate } from "./evaluate.js";

/** The objects that the code of the first `captureR` call was evaluated with. */
async function bound(env: Record<string, unknown>) {
  const fake = fakeWebR();
  await evaluate(fake.webR, { code: "x", env }, 600, 400);
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
      'x[columns] <- lapply(x[columns], as.POSIXct, tz = "UTC")\nx',
      { env: { x: frame, columns: ["day", "seen"] } },
    );
    expect(env[".d1"]).toBe(await fake.evalR.mock.results[0]?.value);
    expect(rows[0]?.day).toBe(day);
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
