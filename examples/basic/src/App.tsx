import "webr-fiber/jsx";
import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { WebR } from "webr";
import {
  RCanvas,
  RConsole,
  WebRProvider,
  aes,
  r,
  useRValue,
  useWebR,
} from "webr-fiber";
import type { ROutput } from "webr-fiber";
import { mtcars } from "./mtcars";

type Cars = typeof mtcars;

// One R for the whole app. It is created here and handed to the provider below.
const webR = new WebR();

const SIZE = { min: 1, max: 8, step: 0.5 };
const POWER = { min: 50, max: 200, step: 10 };

export function App() {
  return (
    <WebRProvider webR={webR} packages={["ggplot2"]}>
      <Workspace />
    </WebRProvider>
  );
}

function Workspace() {
  const [size, setSize] = useState(3);
  const [power, setPower] = useState(POWER.min);
  const [smooth, setSmooth] = useState(false);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState<readonly ROutput[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const { status } = useWebR();
  // The plot, the model and its fit all read these rows.
  const cars = useMemo(() => mtcars.filter((car) => car.hp >= power), [power]);

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
            <SliderField
              label="Point size"
              range={SIZE}
              value={size}
              text={size.toFixed(1)}
              onChange={setSize}
            />
            <SliderField
              label="Minimum horsepower"
              range={POWER}
              value={power}
              text={`${power} hp`}
              hint={`${cars.length} of ${mtcars.length} cars. The rows are filtered in JavaScript.`}
              onChange={setPower}
            />
            <SmoothField checked={smooth} onChange={setSmooth} />
          </div>
          <div className="border-t px-3 py-3">
            <Status />
          </div>
        </aside>

        <main className="flex min-w-0 flex-col md:min-h-0 md:overflow-y-auto">
          <div className="bg-canvas flex flex-1 flex-col items-center justify-center gap-3 p-3 md:p-6">
            <div className="relative w-full max-w-[37.5rem]">
              <RCanvas
                width={600}
                height={400}
                className="block rounded-lg border bg-white"
                style={{ width: "100%", height: "auto", aspectRatio: "3 / 2" }}
                aria-label={`Scatter plot of weight against miles per gallon for ${cars.length} cars`}
                onCode={(next) => {
                  setCode(next);
                  setFailure(null);
                }}
                onError={(error) => setFailure(messageOf(error))}
                onOutput={setOutput}
              >
                <ggplot data={cars} mapping={aes({ x: "wt", y: "mpg" })}>
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
            {failure ? (
              <Note tone="bad" role="alert">
                R could not draw the plot. {failure}
              </Note>
            ) : (
              output.map((entry, index) => (
                // The list is replaced as a whole, so the position is a stable key.
                <Note
                  key={index}
                  tone={entry.type === "warning" ? "bad" : "muted"}
                >
                  {entry.type === "warning" ? "Warning from R: " : "R says: "}
                  {entry.text}
                </Note>
              ))
            )}
          </div>

          <div className="md:grid md:grid-cols-2 md:divide-x">
            <section
              className="min-w-0 border-t px-3 py-3"
              aria-labelledby="code-title"
            >
              <h2 id="code-title" className="text-xs font-medium">
                Generated R
              </h2>
              <pre className="mt-2 min-h-10 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                <code>{code.replaceAll(" + ", " +\n  ")}</code>
              </pre>
              <p className="text-muted-foreground mt-2 text-[0.6875rem] leading-relaxed">
                <code className="font-mono">.d1</code> is the JavaScript array
                of cars. webr-fiber passes it to R as a data frame.
              </p>
            </section>

            <section
              className="min-w-0 border-t px-3 py-3"
              aria-labelledby="model-title"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="model-title" className="text-xs font-medium">
                  Linear model
                </h2>
                {smooth && <Fit cars={cars} />}
              </div>
              {smooth ? (
                <Model cars={cars} />
              ) : (
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  Turn on the trend line to fit{" "}
                  <code className="font-mono">mpg ~ wt</code> and print its
                  coefficients.
                </p>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The coefficient table of the model, as R prints it. */
function Model({ cars }: { cars: Cars }) {
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <>
      <p className="text-muted-foreground mt-2 font-mono text-xs leading-relaxed break-words">
        &gt; {code}
      </p>
      <RConsole
        className="[&_[data-type=warning]]:text-bad mt-1 min-h-14 overflow-x-auto font-mono text-xs leading-relaxed"
        aria-label="Coefficients of the linear model"
        onCode={(next) => {
          setCode(next);
          setFailure(null);
        }}
        onError={(error) => setFailure(messageOf(error))}
      >
        <coef>
          <summary>
            <lm formula={r`mpg ~ wt`} data={cars} />
          </summary>
        </coef>
      </RConsole>
      {failure && (
        <Note tone="bad" role="alert">
          R could not fit the model. {failure}
        </Note>
      )}
    </>
  );
}

/** How much of the variation the model explains, read from R as a number. */
function Fit({ cars }: { cars: Cars }) {
  const fit = useRValue<number[]>(
    r`summary(lm(mpg ~ wt, data = ${cars}))$r.squared`,
  );
  const value = fit.value?.[0];
  if (value == null) return null;
  return (
    <output
      className={`font-mono text-[0.6875rem] tabular-nums transition-opacity ${fit.status === "ready" ? "" : "opacity-60"}`}
    >
      R² = {value.toFixed(3)}
    </output>
  );
}

function Note({
  tone,
  role,
  children,
}: {
  tone: "muted" | "bad";
  role?: "alert";
  children: ReactNode;
}) {
  const Icon = tone === "bad" ? TriangleAlert : Info;
  return (
    <p
      role={role}
      className={`flex w-full max-w-[37.5rem] items-start gap-2 text-xs leading-relaxed ${tone === "bad" ? "text-bad" : "text-muted-foreground"}`}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function SliderField({
  label,
  range,
  value,
  text,
  hint,
  onChange,
}: {
  label: string;
  range: { min: number; max: number; step: number };
  value: number;
  /** The value as it is shown next to the label. */
  text: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const fill = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs leading-none">
          {label}
        </label>
        <output
          htmlFor={id}
          className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums"
        >
          {text}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        style={{ "--fill": `${fill}%` } as CSSProperties}
        {...range}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-[0.6875rem]">
          {hint}
        </p>
      )}
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
        Adds <code className="font-mono">geom_smooth(method = "lm")</code> and
        fits the same model for the numbers below the plot.
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
