import { useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { generate } from "./codegen/compose.js";
import type { Generated } from "./codegen/compose.js";
import { Root } from "./renderer/root.js";
import { evaluate } from "./runtime/evaluate.js";
import type { Evaluation, ROutput } from "./runtime/evaluate.js";
import { useRunner } from "./runtime/runner.js";

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
  onError?: (error: unknown) => void;
  /** Called after each draw with what R printed, including messages and warnings. */
  onOutput?: (output: readonly ROutput[]) => void;
}

/** One plot to draw: the generated code, its objects and the size. */
interface Job extends Generated {
  width: number;
  height: number;
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
  onOutput,
  style,
  ...canvasProps
}: RCanvasProps): ReactNode {
  const canvas = useRef<HTMLCanvasElement>(null);
  const submit = useRunner<Job, Evaluation>({
    run: (webR, job) => evaluate(webR, job, job),
    onResult({ image, output }, job) {
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
      onOutput?.(output);
    },
    onDiscard: ({ image }) => image?.close(),
    onCode,
    onError,
  });

  return (
    <>
      <canvas
        role="img"
        {...canvasProps}
        ref={canvas}
        style={{ width, height, ...style }}
      />
      <Root
        onCommit={(roots) =>
          submit(() => ({ ...generate(roots), width, height }))
        }
      >
        {children}
      </Root>
    </>
  );
}
