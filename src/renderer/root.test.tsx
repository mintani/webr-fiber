// @vitest-environment jsdom
import {
  Component,
  StrictMode,
  act,
  createContext,
  createRef,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { RNode } from "../codegen/compose.js";
import "../jsx.js";
import { Root } from "./root.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// React changes the nodes in place, so each commit is copied when it is reported.
const copy = (nodes: readonly RNode[]): RNode[] =>
  nodes.map((node) => ({
    type: node.type,
    props: { ...node.props },
    children: copy(node.children),
  }));

function collect() {
  const commits: RNode[][] = [];
  const onCommit = (roots: readonly RNode[]): void => {
    commits.push(copy(roots));
  };
  return { commits, onCommit };
}

const mounted: (() => void)[] = [];
function mount(element: ReactNode) {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(element));
  const unmount = () => act(() => root.unmount());
  mounted.push(unmount);
  return { render: (next: ReactNode) => act(() => root.render(next)), unmount };
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  vi.restoreAllMocks();
});

class Catch extends Component<{
  children: ReactNode;
  onError: (error: unknown) => void;
}> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A value outside React that components can subscribe to. */
function createStore(initial: number) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: number): void {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const node = (
  type: string,
  props: Record<string, unknown> = {},
  ...children: RNode[]
): RNode => ({ type, props, children });

const Layers = ({ sizes }: { sizes: number[] }) => (
  <>
    {sizes.map((size) => (
      <geom_point key={size} size={size} />
    ))}
  </>
);

const Plain = ({ children }: { children: ReactNode }) => <>{children}</>;

describe("element tree", () => {
  test("turns lowercase tags into nodes with props in their written order", () => {
    const { commits, onCommit } = collect();
    const data = [{ wt: 1 }];
    mount(
      <Root onCommit={onCommit}>
        <ggplot data={data} mapping="m">
          <geom_point size={3} colour="red" alpha={0.5} />
          <geom_smooth method="lm" />
        </ggplot>
        <call fn="print" args={[1]} />
      </Root>,
    );
    expect(commits.at(-1)).toEqual([
      node(
        "ggplot",
        { data, mapping: "m" },
        node("geom_point", { size: 3, colour: "red", alpha: 0.5 }),
        node("geom_smooth", { method: "lm" }),
      ),
      node("call", { fn: "print", args: [1] }),
    ]);
    const point = commits.at(-1)?.[0]?.children[0];
    expect(Object.keys(point?.props ?? {})).toEqual([
      "size",
      "colour",
      "alpha",
    ]);
    expect(commits.at(-1)?.[0]?.props.data).toBe(data);
  });

  test("leaves out key and ref", () => {
    const { commits, onCommit } = collect();
    const ref = createRef<unknown>();
    mount(
      <Root onCommit={onCommit}>
        <geom_point key="a" ref={ref} size={1} />
      </Root>,
    );
    expect(commits.at(-1)).toEqual([node("geom_point", { size: 1 })]);
  });

  test("renders components and fragments", () => {
    const { commits, onCommit } = collect();
    mount(
      <Root onCommit={onCommit}>
        <ggplot>
          <Layers sizes={[1, 2]} />
        </ggplot>
      </Root>,
    );
    expect(commits.at(-1)).toEqual([
      node(
        "ggplot",
        {},
        node("geom_point", { size: 1 }),
        node("geom_point", { size: 2 }),
      ),
    ]);
  });
});

describe.each([
  ["without StrictMode", Plain],
  ["with StrictMode", StrictMode],
])("updates %s", (_label, Wrapper) => {
  test("follows the surrounding tree and reports once per commit", () => {
    const { commits, onCommit } = collect();
    const plot = (size: number, smooth: boolean) => (
      <Wrapper>
        <Root onCommit={onCommit}>
          <ggplot>
            <geom_point size={size} />
            {smooth && <geom_smooth method="lm" />}
            <geom_line />
          </ggplot>
        </Root>
      </Wrapper>
    );
    const types = () =>
      commits.at(-1)?.[0]?.children.map((child) => child.type);

    const { render } = mount(plot(1, false));
    expect(types()).toEqual(["geom_point", "geom_line"]);

    let before = commits.length;
    render(plot(2, false));
    expect(commits.length).toBe(before + 1);
    expect(commits.at(-1)?.[0]?.children[0]?.props).toEqual({ size: 2 });

    before = commits.length;
    render(plot(2, true));
    expect(commits.length).toBe(before + 1);
    expect(types()).toEqual(["geom_point", "geom_smooth", "geom_line"]);

    render(plot(2, false));
    expect(types()).toEqual(["geom_point", "geom_line"]);
  });

  test("moves children and removes props", () => {
    const { commits, onCommit } = collect();
    const plot = (order: string[], props: Record<string, unknown>) => (
      <Wrapper>
        <Root onCommit={onCommit}>
          <ggplot {...props}>
            {order.map((name) => (
              <call key={name} fn={name} />
            ))}
          </ggplot>
        </Root>
      </Wrapper>
    );
    const { render } = mount(plot(["a", "b", "c"], { x: 1, y: 2 }));
    render(plot(["c", "a", "b"], { y: 2 }));
    expect(commits.at(-1)).toEqual([
      node(
        "ggplot",
        { y: 2 },
        node("call", { fn: "c" }),
        node("call", { fn: "a" }),
        node("call", { fn: "b" }),
      ),
    ]);
  });

  test("follows state of a component inside the tree", () => {
    const { commits, onCommit } = collect();
    const store = createStore(1);
    const Point = () => (
      <geom_point size={useSyncExternalStore(store.subscribe, store.get)} />
    );
    mount(
      <Wrapper>
        <Root onCommit={onCommit}>
          <Point />
        </Root>
      </Wrapper>,
    );
    expect(commits.at(-1)).toEqual([node("geom_point", { size: 1 })]);

    const before = commits.length;
    act(() => store.set(5));
    expect(commits.length).toBe(before + 1);
    expect(commits.at(-1)).toEqual([node("geom_point", { size: 5 })]);
  });
});

describe("surrounding tree", () => {
  test("reads context that is provided outside", () => {
    const { commits, onCommit } = collect();
    const Size = createContext(1);
    const Point = () => <geom_point size={useContext(Size)} />;
    mount(
      <Size value={9}>
        <Root onCommit={onCommit}>
          <Point />
        </Root>
      </Size>,
    );
    expect(commits.at(-1)).toEqual([node("geom_point", { size: 9 })]);
  });

  test("unmounts the tree and runs effect cleanups", () => {
    const { commits, onCommit } = collect();
    const cleanup = vi.fn<() => void>();
    const Point = () => {
      useEffect(() => cleanup, []);
      return <geom_point />;
    };
    const { unmount } = mount(
      <Root onCommit={onCommit}>
        <Point />
      </Root>,
    );
    expect(cleanup).not.toHaveBeenCalled();
    const before = commits.length;
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(commits.length).toBe(before);
  });

  test("passes an error of a component to an error boundary outside", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("broken layer");
    const Broken = (): ReactNode => {
      throw failure;
    };
    const onError = vi.fn<(error: unknown) => void>();
    mount(
      <Catch onError={onError}>
        <Root onCommit={() => {}}>
          <ggplot>
            <Broken />
          </ggplot>
        </Root>
      </Catch>,
    );
    expect(onError).toHaveBeenCalledWith(failure);
  });

  test("rejects text with an error that contains it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn<(error: unknown) => void>();
    mount(
      <Catch onError={onError}>
        <Root onCommit={() => {}}>
          <ggplot>hello</ggplot>
        </Root>
      </Catch>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0]?.[0])).toContain('"hello"');
  });
});

// @ts-expect-error -- `fn` is required on <call>.
export const withoutFn = <call args={[1]} />;
