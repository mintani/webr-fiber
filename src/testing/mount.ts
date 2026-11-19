import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

/** Renders an element with react-dom and unmounts it after the test. */
export function mount(element: ReactNode) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(element));
  let active = true;
  const unmount = (): void => {
    if (active) act(() => root.unmount());
    active = false;
  };
  mounted.push(unmount);
  return {
    container,
    render: (next: ReactNode) => act(() => root.render(next)),
    unmount,
  };
}

/** Lets pending promises and timers finish, and React apply their updates. */
export function settle(): Promise<void> {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}
