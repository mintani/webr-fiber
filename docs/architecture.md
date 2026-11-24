# Architecture

webr-fiber turns a React element tree into R code and runs it with webR. `RCanvas` and `RConsole` connect the three parts: on each commit of their children they take the element tree from the renderer, generate the code and hand it to the runtime. `useRValue` skips the renderer: it generates the code from an `r` expression and returns the value that R computes.

| Part            | Source          | Input           | Output                        |
| --------------- | --------------- | --------------- | ----------------------------- |
| Renderer        | `src/renderer/` | JSX             | Tree of `RNode`               |
| Code generation | `src/codegen/`  | Tree of `RNode` | R code and its objects        |
| Runtime         | `src/runtime/`  | R code, objects | Plot, printed output or value |

## Renderer

The renderer is a custom React renderer built on `react-reconciler`. Inside its root, a lowercase JSX tag is not a DOM element but one R function call.

```tsx
<ggplot data={mtcars} mapping={aes({ x: "wt", y: "mpg" })}>
  <geom_point size={size} />
  {smooth && <geom_smooth method="lm" />}
</ggplot>
```

- A tag becomes a node with the tag name as `type`, its props in their written order and its child tags as `children`. `children`, `key` and `ref` are not props of the node.
- JSX cannot write a dot in a tag name or a prop name, so a hyphen stands for a dot: `<t-test conf-level={0.9} na-rm />` is the node `t.test` with the props `conf.level` and `na.rm`. An underscore stays an underscore.
- Components, fragments, hooks and context work as in any React tree. Context that is provided outside the root is visible inside.
- Text cannot be a child. It is an error, because R has nothing that it could become.
- An error of a component inside the root reaches the error boundaries outside the root.

The root is internal (`src/renderer/root.tsx`). It reports the root nodes after each commit:

- The element tree commits in the same tick as the surrounding React tree.
- React also commits when nothing changed, so a consumer that only wants changes has to compare.
- React changes the nodes in place on later commits. A report has to be used before the callback returns.

### JSX types

TypeScript rejects unknown lowercase tags. Importing `webr-fiber/jsx` once in a project makes it accept any lowercase tag with any props:

```ts
import "webr-fiber/jsx";
```

This changes the JSX types of the whole project: TypeScript no longer reports misspelt HTML tags. This is why the types are not enabled by default. `<call>` is typed and requires `fn`.

## Code generation

Code generation is pure TypeScript in `src/codegen/`. It does not depend on React or webR.

```ts
import { generate, r } from "webr-fiber";

const { code, env } = generate({
  type: "ggplot",
  props: { data: mtcars, mapping: r`aes(x = wt, y = mpg)` },
  children: [{ type: "geom_point", props: { size: 3 }, children: [] }],
});
// code: ggplot(data = .d1, mapping = aes(x = wt, y = mpg)) + geom_point(size = 3)
// env:  { ".d1": mtcars }
```

| Item   | Shape                                            | Meaning                                      |
| ------ | ------------------------------------------------ | -------------------------------------------- |
| Input  | `RNode { type, props, children }`, or a list     | One R function call per node                 |
| Input  | An `r` expression                                | The code as written                          |
| Output | `{ code: string, env: Record<string, unknown> }` | R code, and the objects it refers to by name |

A list of nodes becomes one statement per node, separated by line breaks.

### Values

Props, `args` of `<call>` and values interpolated into `r` all follow the same rules.

| JavaScript value                     | R code              | Notes                                                            |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------- |
| Number                               | `3`                 | `NaN` and infinite numbers become `NA`                           |
| String                               | `"a"`               | Escaped with `JSON.stringify`, whose escapes are valid in R      |
| Boolean                              | `TRUE`, `FALSE`     |                                                                  |
| `null`                               | `NULL`              |                                                                  |
| Array of the values above            | `c(1, 2)`           | `null`, `undefined` and holes become `NA`, so the length is kept |
| `Date`                               | `as.POSIXct(...)`   | See [Dates](#dates)                                              |
| `` r`...` ``                         | The text as written | See [R expressions](#r-expressions)                              |
| Any other object, including an array | `.d1`, `.d2`, ...   | See [Environment](#environment)                                  |
| `undefined`                          | Nothing             | The prop is left out. In `args` or inside `r` it is an error     |
| Function, symbol, bigint             | Error               |                                                                  |

R strings cannot hold a NUL character or an unpaired surrogate. A string that contains one is an error, because the generated code would fail in R.

### Dates

A `Date` becomes a date-time (`POSIXct`) in UTC, written as seconds since 1970. UTC keeps the generated code the same on every machine.

```ts
new Date("2026-01-02T03:00:00Z"); // as.POSIXct(1767322800, tz = "UTC")
[day, null, day]; // as.POSIXct(c(86400, NA, 86400), tz = "UTC")
```

- An array of dates becomes one vector. `null`, `undefined`, holes and invalid dates become `NA`.
- An array that mixes dates with other values is an error.
- `as.Date(x)` in R turns the date-time into a calendar date: `` r`as.Date(${day})` ``.

### R expressions

The `r` tagged template writes R code that is inserted without quoting.

```ts
r`aes(x = wt, y = mpg)`;
r`gsub("\\d", "", x)`; // R receives "\\d"
r`aes(x = \`Sepal Length\`)`; // R receives `Sepal Length`
r`subset(${data}, cyl == ${4} & name == ${"Fiat"})`; // subset(.d1, cyl == 4 & name == "Fiat")
```

- The text is taken as written. R escapes need no extra backslash.
- A backtick and `${` have to be escaped in a JavaScript template. That escape is removed.
- Interpolated values are converted by the rules in [Values](#values). A string is quoted, so it is never run as code. To insert a name, interpolate another expression: `` r`aes(x = ${r`wt`})` ``.

`aes()` writes a ggplot2 mapping from an object. A string is a column name, and any other value follows the rules in [Values](#values):

```ts
aes({ x: "wt", y: "Miles per gallon", colour: r`factor(cyl)` });
// aes(x = wt, y = `Miles per gallon`, colour = factor(cyl))
```

### Names

Function names and argument names are used as they are when they are valid R names: letters, digits, `.` and `_`, starting with a letter or with a dot that is not followed by a digit or another dot, and not a reserved word. Any other name is quoted with backticks. In JSX a hyphen has already become a dot before the name gets here (see [Renderer](#renderer)), so a name with a real hyphen can only come from `generate()`.

| Name            | R code          |
| --------------- | --------------- |
| `na.rm`         | `na.rm`         |
| `data-x`        | `` `data-x` ``  |
| `if`            | `` `if` ``      |
| `stats::t.test` | `stats::t.test` |

A function name may contain `::` or `:::`. The package and the function are quoted separately.

### Composers

A composer decides how a node and its children are combined.

| Composer   | Used for               | Result                                                                     |
| ---------- | ---------------------- | -------------------------------------------------------------------------- |
| Call       | Types without an entry | `fn(child, ..., name = value, ...)`: children are positional arguments     |
| `plus`     | `ggplot`               | `fn(name = value, ...) + child + ...`                                      |
| `sequence` | Base graphics          | `fn(name = value, ...)`, then each child as its own statement              |
| `<call>`   | The node type `call`   | `fn(args..., child, ..., name = value, ...)` with the name taken from `fn` |

- `sequence` is registered for the functions of the graphics package that start a plot: `plot`, `hist`, `barplot`, `boxplot`, `pie`, `curve`, `pairs`, `coplot`, `matplot`, `dotchart`, `image`, `contour`, `persp`, `qqnorm` and `qqplot`. Their children add to the plot.
- A type with a package prefix uses the composer of its function: `ggplot2::ggplot` composes like `ggplot`. An entry for the full name wins.
- Named arguments keep the order in which the props were written.
- `<call fn="stats::t.test" args={[x, y]} paired />` is for functions that need positional arguments or a name that JSX cannot express.
- A node that produces several statements cannot be used as an argument of another call. This is an error.

`extend()` registers a composer for more function names:

```ts
import { extend } from "webr-fiber";

extend({ stripchart: "sequence" });
```

### Environment

Objects are not written into the code. Each one is stored in `env` under a generated name, and the code refers to it by that name.

- Names are `.d1`, `.d2`, ... in the order in which the objects appear in the code.
- The same object, compared by identity, gets one name however often it is used.
- Generating the same tree again produces the same code and the same names.

## Runtime

### `WebRProvider`

The app creates the webR instance and hands it to `WebRProvider`. The library never creates or closes one, so the app keeps control of webR options such as the URL that R is loaded from.

```tsx
const webR = new WebR();

<WebRProvider webR={webR} packages={["ggplot2"]}>
  ...
</WebRProvider>;
```

- The provider initialises the instance, installs the packages and attaches them with `library()`. This happens once per instance and list of packages, also when the provider mounts again.
- `useWebR()` returns `{ webR, status, error }`. `status` is `loading`, `ready` or `error`.
- `RCanvas`, `RConsole`, `useRValue()` and `useWebR()` throw outside a provider.

### `RCanvas`

| Prop              | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `width`, `height` | Size of the plot in CSS pixels                                             |
| `children`        | R elements that describe the plot                                          |
| `onCode`          | Called with the generated code whenever it changes                         |
| `onError`         | Called when code generation or R fails. Without it the error is logged     |
| `onOutput`        | Called after each draw with what R printed. See [Output](#output)          |
| Other props       | Passed to the `<canvas>` element, for example `className` and `aria-label` |

`RCanvas` draws in these steps:

1. After each commit it generates the code. If the code, the data of the bound objects and the size are the same as last time, it stops here.
2. R draws one plot at a time. A plot that waits is replaced by a newer one, so that only the latest state is drawn after R is free again. One redraw of a ggplot2 plot takes about half a second.
3. Bound objects are converted. An array of row objects or an object of columns becomes a `data.frame`, and any other object becomes a named list. A `Date` in a cell of the data frame or as a value of the list becomes a date-time in UTC.
4. The code runs with `captureR` in an environment that holds the bound objects. They do not leak into the global environment. Visible values are printed as at the R console, so `ggplot(...)` draws without `print()`.
5. The last image is painted on the canvas. webR renders at twice the requested size, so the bitmap is `2 * width` by `2 * height`.

- Bound objects are compared by value: arrays and plain objects by their items, dates by their time, anything else by identity. `rows.filter(...)` makes a new array on every render, and this keeps it from running R every time. The comparison stops at the first difference and costs one pass over the data when an equal object is made again.
- A changed row needs a new row object, as React state does. A row that is changed in place looks the same.
- If code generation or R fails, the previous plot stays and the error is reported.
- If `RCanvas` unmounts while R is drawing, the result is dropped.
- The plot background is white.
- Cross-origin isolation headers are not needed. Without them webR uses its PostMessage channel.

### `RConsole`

`RConsole` shows what R prints for its children in a `<pre>` element: the result of `summary()`, `head()` or a test, and anything written with `print()` or `cat()`.

```tsx
<RConsole>
  <summary>
    <lm formula={r`mpg ~ wt`} data={mtcars} />
  </summary>
</RConsole>
// summary(lm(formula = mpg ~ wt, data = .d1))
```

| Prop                            | Meaning                                  |
| ------------------------------- | ---------------------------------------- |
| `children`                      | R elements whose printed result is shown |
| `onCode`, `onError`, `onOutput` | As for `RCanvas`                         |
| Other props                     | Passed to the `<pre>` element            |

- The code runs as in steps 1 to 4 of `RCanvas`, without a size. Plots are not captured, so a plot that the code draws is dropped.
- Each piece of output is one `<span data-type="...">` that ends with a line break. The type is `stdout`, `stderr`, `message` or `warning`, so that an app can style them. A warning starts with `Warning: `.
- If code generation or R fails, the previous output stays and the error is reported. The error is not written into the `<pre>`.
- R wraps its output at 80 characters.

### Output

After each run without an error, `onOutput` receives what R printed as a list of `{ type, text }`, in the order in which R produced it. The list is empty if R printed nothing.

| `type`             | `text`                                                       |
| ------------------ | ------------------------------------------------------------ |
| `stdout`, `stderr` | One line of the stream                                       |
| `message`          | The text of a `message()`, without the line break at its end |
| `warning`          | The text of a warning, without the call that raised it       |

A plot can raise both: ggplot2 sends a message when it chooses a smoothing method and a warning when it drops rows with missing values.

### `useRValue`

`useRValue` evaluates an `r` expression and returns its value as a JavaScript value: a number for a label, rows for a table, or data for another chart library.

```tsx
const fit = useRValue<Record<string, number>>(
  r`coef(lm(mpg ~ wt, data = ${mtcars}))`,
);
// fit: { status: "ready", value: { "(Intercept)": 37.29, wt: -5.34 } }
```

| Field    | Meaning                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| `status` | `loading` until R has returned the value of the current expression, `ready` or `error` |
| `value`  | The latest value that R returned. It stays while a newer one is on its way or failed   |
| `error`  | The reason for the status `error`                                                      |

- The expression is evaluated again when its code or the data of its bound objects change, by the rules of `RCanvas`: one evaluation at a time, and only the latest expression after R was busy.
- The status is `error` if code generation, R or the conversion fails, and if webR failed to start.
- What the expression prints or draws is dropped.
- The type parameter describes the value. It is not checked.

R values are converted by these rules:

| R value                                                 | JavaScript value                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NULL`                                                  | `null`                                                                 |
| Logical, integer, double or character vector            | Array, also for one element. `NA` and `NaN` are `null`                 |
| Vector or list in which every element has a unique name | Object from name to value                                              |
| Factor                                                  | Array of its labels                                                    |
| `Date`                                                  | Array of `"YYYY-MM-DD"` strings                                        |
| `POSIXct`, `POSIXlt`                                    | Array of ISO 8601 strings in UTC, as `Date.prototype.toISOString`      |
| List without names                                      | Array of converted elements                                            |
| `data.frame`                                            | Array of row objects. Row names are dropped                            |
| Matrix                                                  | Array of rows. A row is an object if the matrix has column names       |
| Function, formula, environment, array above 2-D         | Error. Convert it in R first, for example with `coef()` or `as.list()` |

- A vector of length one stays an array, because R cannot tell a single value from a vector of one. Write `value?.[0]`. Row objects and named vectors hold plain values.
- Dates come back as strings, which React can render and `new Date(text)` can parse. A `Date` that was sent to R comes back as the same instant.
- A cell of a list column, a matrix column or a data frame column is the value of that row: an array, an object or a row object.
- The value is prepared by a second R call that replaces factors and dates and rejects values without a JavaScript form, because webR's own conversion keeps names but no classes.
