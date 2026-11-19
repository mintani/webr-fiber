import "webr-fiber/jsx";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { WebR } from "webr";
import { RCanvas, WebRProvider, aes, useWebR } from "webr-fiber";
import { mtcars } from "./mtcars";

// One R for the whole app. It is created here and handed to the provider below.
const webR = new WebR();

const SIZE = { min: 1, max: 8, step: 0.5 };

export function App() {
  return (
    <WebRProvider webR={webR} packages={["ggplot2"]}>
      <Workspace />
    </WebRProvider>
  );
}

function Workspace() {
  const [size, setSize] = useState(3);
  const [smooth, setSmooth] = useState(false);
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const { status } = useWebR();

  return (
    <div className="md:grid md:h-svh md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            <span className="text-muted-foreground">webr-</span>fiber
          </span>
          <span className="text-muted-foreground text-xs">basic example</span>
        </div>
        <a
          className="text-primary rounded-sm text-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
          href="https://github.com/mintani/webr-fiber/tree/develop/examples/basic"
        >
          Source
        </a>
      </header>

      <div className="md:grid md:min-h-0 md:grid-cols-[21.25rem_minmax(0,1fr)]">
        <aside className="bg-card flex flex-col border-b md:min-h-0 md:border-r md:border-b-0">
          <div className="flex-1 space-y-5 px-3 py-3 md:overflow-y-auto">
            <p className="text-muted-foreground text-xs leading-relaxed">
              Weight and fuel economy of 32 cars. The controls are React state.
              Each change generates new R code, and R draws the plot again.
            </p>
            <SizeField value={size} onChange={setSize} />
            <SmoothField checked={smooth} onChange={setSmooth} />
          </div>
          <div className="border-t px-3 py-3">
            <Status />
          </div>
        </aside>

        <main className="flex min-w-0 flex-col md:min-h-0">
          <div className="bg-canvas flex flex-1 flex-col items-center justify-center gap-3 p-3 md:min-h-0 md:p-6">
            <div className="relative w-full max-w-[37.5rem]">
              <RCanvas
                width={600}
                height={400}
                className="block rounded-lg border bg-white"
                style={{ width: "100%", height: "auto", aspectRatio: "3 / 2" }}
                aria-label="Scatter plot of weight against miles per gallon for 32 cars"
                onCode={(next) => {
                  setCode(next);
                  setFailure(null);
                }}
                onError={(error) => setFailure(messageOf(error))}
              >
                <ggplot data={mtcars} mapping={aes({ x: "wt", y: "mpg" })}>
                  <geom_point size={size} />
                  {smooth && <geom_smooth method="lm" />}
                </ggplot>
              </RCanvas>
              {status === "loading" && (
                <p className="text-muted-foreground absolute inset-0 flex items-center justify-center px-6 text-center text-sm">
                  Starting R and installing ggplot2. This takes a few seconds.
                </p>
              )}
            </div>
            {failure && (
              <p
                role="alert"
                className="text-bad flex w-full max-w-[37.5rem] items-start gap-2 text-xs leading-relaxed"
              >
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden
                />
                <span>R could not draw the plot. {failure}</span>
              </p>
            )}
          </div>

          <section className="border-t px-3 py-3" aria-labelledby="code-title">
            <h2 id="code-title" className="text-xs font-medium">
              Generated R
            </h2>
            <pre className="mt-2 min-h-10 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
              <code>{code.replaceAll(" + ", " +\n  ")}</code>
            </pre>
            <p className="text-muted-foreground mt-2 text-[0.6875rem] leading-relaxed">
              <code className="font-mono">.d1</code> is the JavaScript array of
              cars. webr-fiber passes it to R as a data frame.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

function SizeField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const fill = ((value - SIZE.min) / (SIZE.max - SIZE.min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs leading-none">
          Point size
        </label>
        <output
          htmlFor={id}
          className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums"
        >
          {value.toFixed(1)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        style={{ "--fill": `${fill}%` } as CSSProperties}
        {...SIZE}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </div>
  );
}

function SmoothField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs leading-none">
          Trend line
        </label>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="switch"
          aria-describedby={`${id}-hint`}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
      <p id={`${id}-hint`} className="text-muted-foreground text-[0.6875rem]">
        Adds <code className="font-mono">geom_smooth(method = "lm")</code>.
      </p>
    </div>
  );
}

function Status() {
  const { status, error } = useWebR();
  return (
    <div role="status" className="space-y-1 text-xs">
      {status === "loading" && (
        <p className="flex items-center gap-2">
          <LoaderCircle
            className="text-run size-3.5 animate-spin"
            aria-hidden
          />
          Starting R
        </p>
      )}
      {status === "ready" && (
        <p className="flex items-center gap-2">
          <span
            className="bg-ok mx-[0.1875rem] size-2 rounded-full"
            aria-hidden
          />
          R is ready
        </p>
      )}
      {status === "error" && (
        <>
          <p className="text-bad flex items-center gap-2">
            <TriangleAlert className="size-3.5" aria-hidden />R failed to start
          </p>
          <p className="text-muted-foreground leading-relaxed break-words">
            {messageOf(error)}
          </p>
        </>
      )}
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
