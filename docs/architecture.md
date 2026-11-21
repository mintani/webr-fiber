# Architecture

webr-fiber turns a React element tree into R code and runs it with webR. `RCanvas` connects the three parts: on each commit of its children it takes the element tree from the renderer, generates the code and hands it to the runtime.

| Part            | Source          | Input           | Output                 |
| --------------- | --------------- | --------------- | ---------------------- |
| Renderer        | `src/renderer/` | JSX             | Tree of `RNode`        |
| Code generation | `src/codegen/`  | Tree of `RNode` | R code and its objects |
| Runtime         | `src/runtime/`  | R code, objects | Plot on a `<canvas>`   |

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
- `RCanvas` and `useWebR()` throw outside a provider.

### `RCanvas`

| Prop              | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `width`, `height` | Size of the plot in CSS pixels                                             |
| `children`        | R elements that describe the plot                                          |
| `onCode`          | Called with the generated code whenever it changes                         |
| `onError`         | Called when code generation or R fails. Without it the error is logged     |
| Other props       | Passed to the `<canvas>` element, for example `className` and `aria-label` |

`RCanvas` draws in these steps:

1. After each commit it generates the code. If the code, the bound objects (compared by identity) and the size are the same as last time, it stops here.
2. R draws one plot at a time. A plot that waits is replaced by a newer one, so that only the latest state is drawn after R is free again. One redraw of a ggplot2 plot takes about half a second.
3. Bound objects are converted. An array of row objects or an object of columns becomes a `data.frame`, and `Date` cells in it become a date-time column in UTC. Any other object becomes a named list.
4. The code runs with `captureR` in an environment that holds the bound objects. They do not leak into the global environment. Visible values are printed as at the R console, so `ggplot(...)` draws without `print()`.
5. The last image is painted on the canvas. webR renders at twice the requested size, so the bitmap is `2 * width` by `2 * height`.

- If code generation or R fails, the previous plot stays and the error is reported.
- If `RCanvas` unmounts while R is drawing, the result is dropped.
- The plot background is white.
- Cross-origin isolation headers are not needed. Without them webR uses its PostMessage channel.
