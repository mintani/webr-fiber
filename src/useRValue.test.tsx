// @vitest-environment jsdom
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { r } from "./codegen/literal.js";
import type { RExpression } from "./codegen/literal.js";
import { WebRProvider } from "./runtime/provider.js";
import { fakeValue, fakeWebR } from "./testing/fake-webr.js";
import { mount, settle } from "./testing/mount.js";
import { useRValue } from "./useRValue.js";
import type { RValue } from "./useRValue.js";

afterEach(() => {
  vi.restoreAllMocks();
});

type Fake = ReturnType<typeof fakeWebR>;

const numbers = (...values: number[]) =>
  fakeValue({ type: "double", names: null, values });

function Bare(): ReactNode {
  useRValue(r`1`);
  return null;
}

/** Renders the hook and records what it returns on each render. */
function probe(fake: Fake) {
  const seen: RValue<unknown>[] = [];
  function Reader({ expression }: { expression: RExpression }): ReactNode {
    seen.push(useRValue(expression));
    return null;
  }
  const view = (expression: RExpression) => (
    <WebRProvider webR={fake.webR}>
      <Reader expression={expression} />
    </WebRProvider>
  );
  return { seen, view, last: () => seen.at(-1) };
}

/** An evaluation that the test settles by hand. */
function defer(fake: Fake) {
  let resolve: (() => void) | undefined;
  fake.captureR.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ images: [], output: [], result: {} });
      }),
  );
  return { resolve: () => resolve?.() };
}

describe("useRValue", () => {
  test("is loading until R returns the value", async () => {
    const fake = fakeWebR();
    const rows = [{ mpg: 21 }, { mpg: 23 }];
    fake.evalR.mockResolvedValueOnce(numbers(22));
    const { view, last, seen } = probe(fake);
    mount(view(r`mean(${rows}$mpg)`));
    expect(last()).toEqual({ status: "loading", value: undefined });

    await settle();
    expect(last()).toEqual({ status: "ready", value: [22] });
    expect(seen.every((state) => state.status !== "error")).toBe(true);
    expect(fake.captureR).toHaveBeenCalledTimes(1);
    expect(fake.captureR).toHaveBeenCalledWith("mean(.d1$mpg)", {
      env: { ".d1": { r: "data.frame", value: rows } },
      captureGraphics: false,
    });
  });

  test("does not evaluate again for the same code and data", async () => {
    const fake = fakeWebR();
    const rows = [{ mpg: 21 }];
    const { view, last } = probe(fake);
    const { render } = mount(<StrictMode>{view(r`nrow(${rows})`)}</StrictMode>);
    await settle();
    render(<StrictMode>{view(r`nrow(${rows})`)}</StrictMode>);
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);
    expect(last()?.status).toBe("ready");

    render(
      <StrictMode>{view(r`nrow(${rows.filter(() => true)})`)}</StrictMode>,
    );
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);
    expect(last()?.status).toBe("ready");

    render(<StrictMode>{view(r`nrow(${[{ mpg: 22 }]})`)}</StrictMode>);
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(2);
  });

  test("keeps the previous value while the next one is loading", async () => {
    const fake = fakeWebR();
    fake.evalR.mockResolvedValueOnce(numbers(1));
    const { view, last } = probe(fake);
    const { render } = mount(view(r`f(${1})`));
    await settle();
    expect(last()).toEqual({ status: "ready", value: [1] });

    const pending = defer(fake);
    fake.evalR.mockResolvedValueOnce(numbers(2));
    render(view(r`f(${2})`));
    await settle();
    expect(last()).toEqual({ status: "loading", value: [1] });

    pending.resolve();
    await settle();
    expect(last()).toEqual({ status: "ready", value: [2] });
  });

  test("evaluates only the latest expression after R was busy", async () => {
    const fake = fakeWebR();
    const first = defer(fake);
    const { view, last } = probe(fake);
    const { render } = mount(view(r`f(${1})`));
    await settle();
    render(view(r`f(${2})`));
    render(view(r`f(${3})`));
    await settle();
    first.resolve();
    await settle();
    expect(fake.captureR.mock.calls.map(([code]) => code)).toEqual([
      "f(1)",
      "f(3)",
    ]);
    expect(last()?.status).toBe("ready");
  });

  test("reports an error of R and keeps the previous value", async () => {
    const fake = fakeWebR();
    const failure = new Error("object 'nope' not found");
    fake.evalR.mockResolvedValueOnce(numbers(1));
    const { view, last } = probe(fake);
    const { render } = mount(view(r`f(${1})`));
    await settle();

    fake.captureR.mockRejectedValueOnce(failure);
    render(view(r`nope`));
    await settle();
    expect(last()).toEqual({ status: "error", value: [1], error: failure });

    fake.evalR.mockResolvedValueOnce(numbers(3));
    render(view(r`f(${3})`));
    await settle();
    expect(last()).toEqual({ status: "ready", value: [3] });
  });

  test("reports a value that R cannot convert", async () => {
    const fake = fakeWebR();
    const failure = new Error("cannot convert an R value of class function");
    fake.evalR.mockRejectedValueOnce(failure);
    const { view, last } = probe(fake);
    mount(view(r`sum`));
    await settle();
    expect(last()).toEqual({
      status: "error",
      value: undefined,
      error: failure,
    });
  });

  test("reports an expression that cannot become R code", async () => {
    const fake = fakeWebR();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { view, last } = probe(fake);
    mount(view(r`f(${() => 1})`));
    await settle();
    expect(last()?.status).toBe("error");
    expect(last()?.error).toBeInstanceOf(TypeError);
    expect(fake.captureR).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  test("reports that webR failed to start", async () => {
    const fake = fakeWebR();
    const failure = new Error("no network");
    fake.init.mockRejectedValueOnce(failure);
    const { view, last } = probe(fake);
    mount(view(r`1`));
    await settle();
    expect(last()).toEqual({
      status: "error",
      value: undefined,
      error: failure,
    });
    expect(fake.captureR).not.toHaveBeenCalled();
  });

  test("drops the result when it unmounts while R is busy", async () => {
    const fake = fakeWebR();
    const pending = defer(fake);
    const { view, seen } = probe(fake);
    const { render, unmount } = mount(view(r`f(${1})`));
    await settle();
    render(view(r`f(${2})`));
    const renders = seen.length;
    unmount();
    pending.resolve();
    await settle();
    expect(seen).toHaveLength(renders);
    expect(fake.captureR).toHaveBeenCalledTimes(1);
  });

  test("needs a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mount(<Bare />)).toThrow(
      "webr-fiber needs a <WebRProvider> above",
    );
  });
});
