import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { generate } from "./codegen/compose.js";
import type { Generated } from "./codegen/compose.js";
import { Root } from "./renderer/root.js";
import { evaluate } from "./runtime/evaluate.js";
import type { Evaluation, ROutput } from "./runtime/evaluate.js";
import { useRunner } from "./runtime/runner.js";

interface RConsoleProps extends Omit<ComponentProps<"pre">, "onError"> {
  /** R elements whose printed result is shown. */
  children?: ReactNode;
  /** Called with the generated R code whenever it changes. */
  onCode?: (code: string) => void;
  /** Called when code generation or R fails. Without it the error is logged to the console. */
  onError?: (error: unknown) => void;
  /** Called after each run with what R printed, including messages and warnings. */
  onOutput?: (output: readonly ROutput[]) => void;
}

/**
 * Shows what R prints for its R elements, and runs them again when they change.
 *
 * Each piece of output is a `<span data-type>` with the type `stdout`, `stderr`, `message` or
 * `warning`. Needs a `WebRProvider` above. Other props are passed to the `<pre>` element.
 */
export function RConsole({
  children,
  onCode,
  onError,
  onOutput,
  ...preProps
}: RConsoleProps): ReactNode {
  const [output, setOutput] = useState<readonly ROutput[]>([]);
  const submit = useRunner<Generated, Evaluation>({
    run: (webR, job) => evaluate(webR, job),
    onResult(result) {
      setOutput(result.output);
      onOutput?.(result.output);
    },
    onCode,
    onError,
  });

  return (
    <>
      <pre {...preProps}>
        {output.map(({ type, text }, index) => (
          // The list is replaced as a whole, so the position is a stable key.
          <span key={index} data-type={type}>
            {type === "warning" ? `Warning: ${text}` : text}
            {"\n"}
          </span>
        ))}
      </pre>
      <Root onCommit={(roots) => submit(() => generate(roots))}>
        {children}
      </Root>
    </>
  );
}
