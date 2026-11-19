import { useEffect, useLayoutEffect, useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { generate } from "./codegen/compose.js";
import type { Generated, RNode } from "./codegen/compose.js";
import { Root } from "./renderer/root.js";
import { evaluate } from "./runtime/evaluate.js";
import { useWebR } from "./runtime/provider.js";

type ErrorHandler = (error: unknown) => void;

interface RCanvasProps extends Omit<
  ComponentProps<"canvas">,
  "width" | "height" | "onError"
> {
  /** Width of the plot in CSS pixels. */
  width: number;
  /** Height of the plot in CSS pixels. */
  height: number;
  /** R elements that describe the plot. */
  children?: ReactNode;
  /** Called with the generated R code whenever it changes. */
  onCode?: (code: string) => void;
  /** Called when code generation or R fails. Without it the error is logged to the console. */
  onError?: ErrorHandler;
}

/** One plot to draw: the generated code, its objects and the size. */
interface Job extends Generated {
  width: number;
  height: number;
}

function sameJob(a: Job | null, b: Job): boolean {
  if (!a || a.code !== b.code || a.width !== b.width || a.height !== b.height) {
    return false;
  }
  const names = Object.keys(b.env);
  return (
    Object.keys(a.env).length === names.length &&
    names.every((name) => a.env[name] === b.env[name])
  );
}

function report(error: unknown, onError: ErrorHandler | undefined): void {
  if (onError) onError(error);
  else console.error(error);
}

// webR renders plots at twice the requested size.
const SCALE = 2;

/**
 * Draws the plot that its R elements describe, and draws it again when they change.
 * Needs a `WebRProvider` above. Other props are passed to the `<canvas>` element.
 */
export function RCanvas({
  width,
  height,
  children,
  onCode,
  onError,
  style,
  ...canvasProps
}: RCanvasProps): ReactNode {
  const { webR, status } = useWebR();
  const canvas = useRef<HTMLCanvasElement>(null);
  const latestOnError = useRef(onError);
  const queue = useRef({
    /** The last job that was taken from the tree, drawn or not. */
    accepted: null as Job | null,
    /** The job that R has not started yet. A newer job replaces it. */
    waiting: null as Job | null,
    busy: false,
    ready: false,
  });

  const drawNext = async (): Promise<void> => {
    const state = queue.current;
    const job = state.waiting;
    if (!job || state.busy || !state.ready) return;
    state.waiting = null;
    state.busy = true;
    try {
      const image = await evaluate(webR, job, job.width, job.height);
      // After unmounting there is no canvas, and the result is dropped.
      const target = canvas.current;
      if (target) {
        target.width = job.width * SCALE;
        target.height = job.height * SCALE;
        if (image) {
          const context = target.getContext("2d");
          context?.drawImage(image, 0, 0, target.width, target.height);
        }
      }
      image?.close();
    } catch (error) {
      if (canvas.current) report(error, latestOnError.current);
    } finally {
      state.busy = false;
    }
    void drawNext();
  };

  const onCommit = (roots: readonly RNode[]): void => {
    const state = queue.current;
    let job: Job;
    try {
      job = { ...generate(roots), width, height };
    } catch (error) {
      report(error, onError);
      return;
    }
    if (sameJob(state.accepted, job)) return;
    if (state.accepted?.code !== job.code) onCode?.(job.code);
    state.accepted = job;
    state.waiting = job;
    void drawNext();
  };

  useLayoutEffect(() => {
    latestOnError.current = onError;
  });

  useEffect(() => {
    queue.current.ready = status === "ready";
    void drawNext();
  });

  return (
    <>
      <canvas
        role="img"
        {...canvasProps}
        ref={canvas}
        style={{ width, height, ...style }}
      />
      <Root onCommit={onCommit}>{children}</Root>
    </>
  );
}
