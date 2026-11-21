import { useEffect, useState } from "react";
import { generate } from "./codegen/compose.js";
import type { Generated } from "./codegen/compose.js";
import type { RExpression } from "./codegen/literal.js";
import { useWebR } from "./runtime/provider.js";
import { sameJob, useRunner } from "./runtime/runner.js";
import { evaluateValue } from "./runtime/value.js";

/** The value of an R expression and how far its evaluation is. */
export interface RValue<T> {
  /** `loading` until R has returned the value of the current expression. */
  status: "loading" | "ready" | "error";
  /** The latest value that R returned. It stays while a newer one is on its way or failed. */
  value: T | undefined;
  /** The reason for the status `error`. */
  error?: unknown;
}

type Outcome = { value: unknown } | { error: unknown };

/** The last expression that R finished, with the last value that R returned. */
interface Settled {
  job: Generated;
  value: unknown;
  outcome: Outcome;
}

/**
 * Evaluates an `r` expression and returns its value as a JavaScript value, again whenever the
 * expression changes. Needs a `WebRProvider` above.
 *
 * `T` describes the value and is not checked. A vector is an array, also with one element; a
 * data frame is an array of row objects.
 */
export function useRValue<T = unknown>(expression: RExpression): RValue<T> {
  const provider = useWebR();
  const [settled, setSettled] = useState<Settled | null>(null);
  const submit = useRunner<Generated, Outcome>({
    // A failure is a result here, so that it is stored with the job it belongs to.
    run: (webR, job) =>
      evaluateValue(webR, job).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      ),
    onResult: (outcome, job) =>
      setSettled((previous) => ({
        job,
        value: "value" in outcome ? outcome.value : previous?.value,
        outcome,
      })),
  });

  let job: Generated | undefined;
  let failure: { error: unknown } | undefined;
  try {
    job = generate(expression);
  } catch (error) {
    failure = { error };
  }

  useEffect(() => {
    if (job) submit(() => job);
  });

  const value = settled?.value as T | undefined;
  if (!failure && provider.status === "error")
    failure = { error: provider.error };
  if (!failure && settled && job && sameJob(settled.job, job)) {
    if ("value" in settled.outcome) return { status: "ready", value };
    failure = settled.outcome;
  }
  return failure
    ? { status: "error", value, error: failure.error }
    : { status: "loading", value };
}
