// @vitest-environment jsdom
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "./jsx.js";
import { RCanvas } from "./RCanvas.js";
import { WebRProvider } from "./runtime/provider.js";
import { fakeCondition, fakeImage, fakeWebR } from "./testing/fake-webr.js";
import { mount, settle } from "./testing/mount.js";

const drawImage = vi.fn<CanvasRenderingContext2D["drawImage"]>();

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  drawImage.mockReset();
});

type Fake = ReturnType<typeof fakeWebR>;

const provide = (fake: Fake, children: ReactNode) => (
  <WebRProvider webR={fake.webR}>{children}</WebRProvider>
);

const plot = (fake: Fake, size: number, props: object = {}) =>
  provide(
    fake,
    <RCanvas width={600} height={400} {...props}>
      <ggplot>
        <geom_point size={size} />
      </ggplot>
    </RCanvas>,
  );

/** A `captureR` result that the test settles by hand. */
function defer(fake: Fake) {
  const image = fakeImage();
  let resolve: (() => void) | undefined;
  fake.captureR.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ images: [image], output: [], result: {} });
      }),
  );
  return { image, resolve: () => resolve?.() };
}

describe("drawing", () => {
  test("evaluates the generated code and draws the plot at twice the size", async () => {
    const fake = fakeWebR();
    const image = fakeImage();
    fake.captureR.mockResolvedValueOnce({
      images: [image],
      output: [],
      result: {},
    });
    const { container } = mount(plot(fake, 3));
    expect(fake.captureR).not.toHaveBeenCalled();

    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);
    expect(fake.captureR).toHaveBeenCalledWith(
      "ggplot() + geom_point(size = 3)",
      {
        env: {},
        captureGraphics: { width: 600, height: 400, bg: "white" },
        withAutoprint: true,
      },
    );
    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(1200);
    expect(canvas?.height).toBe(800);
    expect(canvas?.style.width).toBe("600px");
    expect(canvas?.style.height).toBe("400px");
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 1200, 800);
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(fake.purge).toHaveBeenCalledTimes(1);
  });

  test("passes other props to the canvas element", () => {
    const fake = fakeWebR();
    const { container } = mount(
      plot(fake, 3, { className: "plot", "aria-label": "Weight and mileage" }),
    );
    const canvas = container.querySelector("canvas");
    expect(canvas?.className).toBe("plot");
    expect(canvas?.getAttribute("aria-label")).toBe("Weight and mileage");
    expect(canvas?.getAttribute("role")).toBe("img");
  });

  test("passes data frames as they are and other objects as lists", async () => {
    const fake = fakeWebR();
    const rows = [{ wt: 1 }, { wt: 2 }];
    const options = { title: "Cars" };
    mount(
      provide(
        fake,
        <RCanvas width={600} height={400}>
          <ggplot data={rows} options={options} />
        </RCanvas>,
      ),
    );
    await settle();
    expect(fake.captureR).toHaveBeenCalledWith(
      "ggplot(data = .d1, options = .d2)",
      expect.objectContaining({
        env: {
          ".d1": { r: "data.frame", value: rows },
          ".d2": { r: "list", value: options },
        },
      }),
    );
  });

  test("clears the canvas when R draws nothing", async () => {
    const fake = fakeWebR();
    fake.captureR.mockResolvedValue({ images: [], output: [], result: {} });
    const { container } = mount(plot(fake, 3));
    await settle();
    expect(container.querySelector("canvas")?.width).toBe(1200);
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe.each([
  ["without StrictMode", ({ children }: { children: ReactNode }) => children],
  ["with StrictMode", StrictMode],
])("redrawing %s", (_label, Wrapper) => {
  test("draws again only when the code, the objects or the size change", async () => {
    const fake = fakeWebR();
    const data = [{ wt: 1 }];
    const tree = (rows: object[], width: number) => (
      <Wrapper>
        {provide(
          fake,
          <RCanvas width={width} height={400}>
            <ggplot data={rows} />
          </RCanvas>,
        )}
      </Wrapper>
    );
    const { render } = mount(tree(data, 600));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    render(tree(data, 600));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    const copy = [{ wt: 1 }];
    render(tree(copy, 600));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(2);

    render(tree(copy, 300));
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(3);
    expect(fake.captureR).toHaveBeenLastCalledWith(
      "ggplot(data = .d1)",
      expect.objectContaining({
        captureGraphics: { width: 300, height: 400, bg: "white" },
      }),
    );
  });

  test("draws only the latest tree when it changes while R is busy", async () => {
    const fake = fakeWebR();
    const first = defer(fake);
    const { render } = mount(<Wrapper>{plot(fake, 1)}</Wrapper>);
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    render(<Wrapper>{plot(fake, 2)}</Wrapper>);
    render(<Wrapper>{plot(fake, 3)}</Wrapper>);
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);

    first.resolve();
    await settle();
    expect(fake.captureR.mock.calls.map(([code]) => code)).toEqual([
      "ggplot() + geom_point(size = 1)",
      "ggplot() + geom_point(size = 3)",
    ]);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });

  test("calls onCode once for each change of the code", async () => {
    const fake = fakeWebR();
    const onCode = vi.fn<(code: string) => void>();
    const { render } = mount(<Wrapper>{plot(fake, 1, { onCode })}</Wrapper>);
    await settle();
    render(<Wrapper>{plot(fake, 1, { onCode })}</Wrapper>);
    render(<Wrapper>{plot(fake, 2, { onCode })}</Wrapper>);
    await settle();
    expect(onCode.mock.calls).toEqual([
      ["ggplot() + geom_point(size = 1)"],
      ["ggplot() + geom_point(size = 2)"],
    ]);
  });

  test("does not call onCode when only an object or the size changes", async () => {
    const fake = fakeWebR();
    const onCode = vi.fn<(code: string) => void>();
    const tree = (rows: object[], width: number) =>
      provide(
        fake,
        <RCanvas width={width} height={400} onCode={onCode}>
          <ggplot data={rows} />
        </RCanvas>,
      );
    const { render } = mount(<Wrapper>{tree([{ wt: 1 }], 600)}</Wrapper>);
    await settle();
    render(<Wrapper>{tree([{ wt: 2 }], 300)}</Wrapper>);
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(2);
    expect(onCode.mock.calls).toEqual([["ggplot(data = .d1)"]]);
  });

  test("calls the handlers of the latest render", async () => {
    const fake = fakeWebR();
    const first = vi.fn<(code: string) => void>();
    const second = vi.fn<(code: string) => void>();
    const { render } = mount(
      <Wrapper>{plot(fake, 1, { onCode: first })}</Wrapper>,
    );
    await settle();
    render(<Wrapper>{plot(fake, 2, { onCode: second })}</Wrapper>);
    await settle();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second.mock.calls).toEqual([["ggplot() + geom_point(size = 2)"]]);
  });
});

describe("output", () => {
  test("calls onOutput after each draw, also with nothing printed", async () => {
    const fake = fakeWebR();
    const onOutput = vi.fn<(output: readonly object[]) => void>();
    fake.captureR.mockResolvedValueOnce({
      images: [fakeImage()],
      output: [
        { type: "message", data: fakeCondition("using method = 'loess'\n") },
        { type: "warning", data: fakeCondition("Removed 3 rows") },
      ],
      result: {},
    });
    const { render } = mount(plot(fake, 1, { onOutput }));
    await settle();
    expect(onOutput.mock.calls).toEqual([
      [
        [
          { type: "message", text: "using method = 'loess'" },
          { type: "warning", text: "Removed 3 rows" },
        ],
      ],
    ]);

    render(plot(fake, 2, { onOutput }));
    await settle();
    expect(onOutput).toHaveBeenLastCalledWith([]);
  });

  test("reports a result to the handler of the latest render", async () => {
    const fake = fakeWebR();
    const first = vi.fn<(output: readonly object[]) => void>();
    const second = vi.fn<(output: readonly object[]) => void>();
    const pending = defer(fake);
    const { render } = mount(plot(fake, 1, { onOutput: first }));
    await settle();
    render(plot(fake, 1, { onOutput: second }));
    pending.resolve();
    await settle();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("does not call onOutput when it unmounts while R is busy", async () => {
    const fake = fakeWebR();
    const onOutput = vi.fn<(output: readonly object[]) => void>();
    const pending = defer(fake);
    const { unmount } = mount(plot(fake, 1, { onOutput }));
    await settle();
    unmount();
    pending.resolve();
    await settle();
    expect(onOutput).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  test("keeps the previous plot and reports an error of R", async () => {
    const fake = fakeWebR();
    const onError = vi.fn<(error: unknown) => void>();
    const { render, container } = mount(plot(fake, 1, { onError }));
    await settle();
    expect(drawImage).toHaveBeenCalledTimes(1);

    const failure = new Error("Error in `geom_point()`: boom");
    fake.captureR.mockRejectedValueOnce(failure);
    render(plot(fake, 2, { onError, width: 300 }));
    await settle();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")?.width).toBe(1200);
    expect(fake.purge).toHaveBeenCalledTimes(2);

    render(plot(fake, 3, { onError }));
    await settle();
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("reports a prop that cannot become R code", async () => {
    const fake = fakeWebR();
    const onError = vi.fn<(error: unknown) => void>();
    mount(
      provide(
        fake,
        <RCanvas width={600} height={400} onError={onError}>
          <geom_point size={() => 1} />
        </RCanvas>,
      ),
    );
    await settle();
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError));
    expect(fake.captureR).not.toHaveBeenCalled();
  });

  test("logs to the console without onError", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeWebR();
    const failure = new Error("boom");
    fake.captureR.mockRejectedValueOnce(failure);
    mount(plot(fake, 1));
    await settle();
    expect(log).toHaveBeenCalledWith(failure);
  });

  test("discards the result when it unmounts while R is busy", async () => {
    const fake = fakeWebR();
    const pending = defer(fake);
    const { unmount } = mount(plot(fake, 1));
    await settle();
    unmount();
    pending.resolve();
    await settle();
    expect(drawImage).not.toHaveBeenCalled();
    expect(pending.image.close).toHaveBeenCalledTimes(1);
  });

  test("discards an error when it unmounts while R is busy", async () => {
    const fake = fakeWebR();
    const onError = vi.fn<(error: unknown) => void>();
    let reject: ((error: unknown) => void) | undefined;
    fake.captureR.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const { unmount } = mount(plot(fake, 1, { onError }));
    await settle();
    unmount();
    reject?.(new Error("boom"));
    await settle();
    expect(onError).not.toHaveBeenCalled();
    expect(fake.purge).toHaveBeenCalledTimes(1);
  });

  test("does not draw while webR is not ready", async () => {
    const fake = fakeWebR();
    let finish: (() => void) | undefined;
    fake.init.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mount(plot(fake, 1));
    await settle();
    expect(fake.captureR).not.toHaveBeenCalled();
    finish?.();
    await settle();
    expect(fake.captureR).toHaveBeenCalledTimes(1);
  });

  test("needs a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mount(<RCanvas width={1} height={1} />)).toThrow(
      "<WebRProvider>",
    );
  });
});
