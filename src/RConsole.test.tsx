// @vitest-environment jsdom
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import "./jsx.js";
import { r } from "./codegen/literal.js";
import { RConsole } from "./RConsole.js";
import { WebRProvider } from "./runtime/provider.js";
import { fakeCondition, fakeWebR } from "./testing/fake-webr.js";
import { mount, settle } from "./testing/mount.js";

afterEach(() => {
  vi.restoreAllMocks();
});

type Fake = ReturnType<typeof fakeWebR>;
type Captured = { type: string; data: unknown }[];

const provide = (fake: Fake, children: ReactNode) => (
  <WebRProvider webR={fake.webR}>{children}</WebRProvider>
);

const model = (fake: Fake, digits: number, props: object = {}) =>
  provide(
    fake,
    <RConsole {...props}>
      <print digits={digits}>
        <lm formula={r`mpg ~ wt`} />
      </print>
    </RConsole>,
  );

const prints = (fake: Fake, ...lines: string[]) =>
  fake.captureR.mockResolvedValueOnce({
    images: [],
    output: lines.map((data) => ({ type: "stdout", data })),
    result: {},
  });

/** A `captureR` result that the test settles by hand. */
function defer(fake: Fake, output: Captured = []) {
  let resolve: (() => void) | undefined;
  fake.captureR.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ images: [], output, result: {} });
      }),
  );
  return { resolve: () => resolve?.() };
}

const spans = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("pre span"), (span) => [
    span.getAttribute("data-type"),
    span.textContent,
  ]);

describe("printing", () => {
  test("evaluates the generated code without plots and shows what R printed", async () => {
    const fake = fakeWebR();
    fake.captureR.mockResolvedValueOnce({
      images: [],
      output: [
        { type: "stdout", data: "Coefficients:" },
        { type: "stdout", data: "(Intercept)           wt" },
        { type: "message", data: fakeCondition("a note\n") },
        { type: "warning", data: fakeCondition("careful") },
        { type: "stderr", data: "from stderr" },
      ],
      result: {},
    });
    const { container } = mount(model(fake, 3));
    expect(container.querySelector("pre")?.textContent).toBe("");

    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);
    expect(fake.captureR).toHaveBeenCalledWith(
      "print(lm(formula = mpg ~ wt), digits = 3)",
      { env: {}, captureGraphics: false, withAutoprint: true },
    );
    expect(spans(container)).toEqual([
      ["stdout", "Coefficients:\n"],
      ["stdout", "(Intercept)           wt\n"],
      ["message", "a note\n"],
      ["warning", "Warning: careful\n"],
      ["stderr", "from stderr\n"],
    ]);
    expect(container.querySelector("pre")?.textContent).toBe(
      "Coefficients:\n(Intercept)           wt\na note\nWarning: careful\nfrom stderr\n",
    );
  });

  test("passes other props to the pre element", () => {
    const fake = fakeWebR();
    const { container } = mount(
      model(fake, 3, { className: "output", "aria-label": "Model" }),
    );
    const pre = container.querySelector("pre");
    expect(pre?.className).toBe("output");
    expect(pre?.getAttribute("aria-label")).toBe("Model");
  });

  test("runs again only when the code or the data change", async () => {
    const fake = fakeWebR();
    const rows = [{ wt: 1 }];
    const view = (data: object, label: string) =>
      provide(
        fake,
        <div title={label}>
          <RConsole>
            <str object={data} />
          </RConsole>
        </div>,
      );
    const { render } = mount(view(rows, "a"));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    render(view(rows, "b"));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    render(view([{ wt: 1 }], "b"));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    render(view([{ wt: 2 }], "b"));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(2);
  });

  test("replaces the output with the result of the latest tree", async () => {
    const fake = fakeWebR();
    const first = defer(fake, [{ type: "stdout", data: "first" }]);
    prints(fake, "third");
    const { container, render } = mount(model(fake, 1));
    await settle();
    render(model(fake, 2));
    render(model(fake, 3));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    first.resolve();
    await settle();
    expect(fake.captureR.mock.calls.map(([code]) => code)).toEqual([
      "print(lm(formula = mpg ~ wt), digits = 1)",
      "print(lm(formula = mpg ~ wt), digits = 3)",
    ]);
    expect(spans(container)).toEqual([["stdout", "third\n"]]);
  });

  test("calls onCode for each change of the code and onOutput after each run", async () => {
    const fake = fakeWebR();
    const onCode = vi.fn<(code: string) => void>();
    const onOutput = vi.fn<(output: readonly object[]) => void>();
    prints(fake, "one");
    prints(fake);
    const { render } = mount(
      <StrictMode>{model(fake, 1, { onCode, onOutput })}</StrictMode>,
    );
    await settle();
    render(<StrictMode>{model(fake, 1, { onCode, onOutput })}</StrictMode>);
    render(<StrictMode>{model(fake, 2, { onCode, onOutput })}</StrictMode>);
    await settle();
    expect(onCode.mock.calls).toEqual([
      ["print(lm(formula = mpg ~ wt), digits = 1)"],
      ["print(lm(formula = mpg ~ wt), digits = 2)"],
    ]);
    expect(onOutput.mock.calls).toEqual([
      [[{ type: "stdout", text: "one" }]],
      [[]],
    ]);
  });
});

describe("failures", () => {
  test("keeps the previous output and reports an error of R", async () => {
    const fake = fakeWebR();
    const onError = vi.fn<(error: unknown) => void>();
    const failure = new Error("object 'nope' not found");
    prints(fake, "kept");
    fake.captureR.mockRejectedValueOnce(failure);
    const { container, render } = mount(model(fake, 1, { onError }));
    await settle();
    render(model(fake, 2, { onError }));
    await settle();
    expect(onError.mock.calls).toEqual([[failure]]);
    expect(spans(container)).toEqual([["stdout", "kept\n"]]);
    expect(fake.purge).toHaveBeenCalledTimes(2);
  });

  test("reports a prop that cannot become R code", async () => {
    const fake = fakeWebR();
    const onError = vi.fn<(error: unknown) => void>();
    mount(
      provide(
        fake,
        <RConsole onError={onError}>
          <print x={() => 1} />
        </RConsole>,
      ),
    );
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
    expect(fake.captureR).not.toHaveBeenCalled();
  });

  test("logs to the console without onError", async () => {
    const fake = fakeWebR();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("boom");
    fake.captureR.mockRejectedValueOnce(failure);
    mount(model(fake, 1));
    await settle();
    expect(logged).toHaveBeenCalledWith(failure);
  });

  test("discards the result when it unmounts while R is busy", async () => {
    const fake = fakeWebR();
    const onOutput = vi.fn<(output: readonly object[]) => void>();
    const onError = vi.fn<(error: unknown) => void>();
    const pending = defer(fake, [{ type: "stdout", data: "late" }]);
    const { render, unmount } = mount(model(fake, 1, { onOutput, onError }));
    await settle();
    render(model(fake, 2, { onOutput, onError }));
    unmount();
    pending.resolve();
    await settle();
    expect(onOutput).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(fake.captureR).toHaveBeenCalledTimes(1);
  });

  test("needs a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mount(<RConsole />)).toThrow(
      "webr-fiber needs a <WebRProvider> above",
    );
  });
});
