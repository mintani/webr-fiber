# Common R features

How to write the R features that people use most with webr-fiber, and what is not supported. Every example on this page was run with webR 0.6.1 and React 19.3.

| Goal                                | Section                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| Know why these features were chosen | [Where the list comes from](#where-the-list-comes-from) |
| Draw a plot                         | [Plots](#plots)                                         |
| Show what R prints                  | [Printed results](#printed-results)                     |
| Use an R result as data             | [Values and tables](#values-and-tables)                 |
| Bring data in and transform it      | [Data](#data)                                           |
| Write an R name or value in JSX     | [Names and values](#names-and-values)                   |
| Check what is missing               | [Not supported](#not-supported)                         |

The examples use these values:

```tsx
import "webr-fiber/jsx";
import { RCanvas, RConsole, aes, r, useRValue } from "webr-fiber";

const mtcars = [
  { model: "Mazda RX4", mpg: 21, cyl: 6, hp: 110, wt: 2.62 } /* ... */,
];
const mpg = mtcars.map((car) => car.mpg);
const wt = mtcars.map((car) => car.wt);
```

## Where the list comes from

The list follows a survey from 2026-11-21. It combines counts of real use with the teaching material of the R project.

| Question                                    | Source                                                                                                                          | Finding                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| What do people call at the console?         | [531 public `.Rhistory` files](https://www.r-bloggers.com/2013/02/analysis-of-public-rhistory-files/), 100,190 calls            | See the table below                                                                            |
| What does package code call?                | [All package sources on CRAN](https://www.johnmyleswhite.com/notebook/2009/12/07/r-function-usage-frequencies/), 2009           | `if`, `c`, `function`, `length`, `paste`, `cat`, `return`, `stop`, `is.null`, `list` lead      |
| Which packages are installed most?          | [Weekly CRAN downloads](https://r-hub.github.io/pkgsearch/reference/cran_top_downloaded.html), example of the pkgsearch package | ggplot2 is first and dplyr fifth. Most of the others are libraries that packages depend on     |
| Which base graphics functions start a plot? | [An Introduction to R, chapter 12](https://cran.r-project.org/doc/manuals/r-release/R-intro.html#Graphics)                      | `plot`, `pairs`, `coplot`, `qqnorm`, `qqplot`, `hist`, `dotchart`, `image`, `contour`, `persp` |
| Which kinds of output does an app show?     | [Mastering Shiny, Basic UI](https://mastering-shiny.org/basic-ui.html)                                                          | "three main types of output": text, tables and plots                                           |

The 20 most used functions in the `.Rhistory` files, and where each one goes with webr-fiber:

| Rank | Function           | With webr-fiber                                                                 |
| ---- | ------------------ | ------------------------------------------------------------------------------- |
| 1    | `source`           | Not needed. The code comes from JSX                                             |
| 2    | `plot`             | `<plot>` in [`RCanvas`](#plots)                                                 |
| 3    | `c`                | A JavaScript array                                                              |
| 4    | `library`          | `packages` of `WebRProvider`                                                    |
| 5    | `function`         | Inside an `r` expression                                                        |
| 6    | `for`              | `.map()` in JSX, or inside an `r` expression                                    |
| 7    | `summary`          | `<summary>` in [`RConsole`](#printed-results)                                   |
| 8    | `if`               | A condition in JSX, or inside an `r` expression                                 |
| 9    | `read.csv`         | `` r`read.csv(text = ${csv})` ``, see [Data](#data)                             |
| 10   | `rep`              | `<rep>`                                                                         |
| 11   | `length`           | `<length>`                                                                      |
| 12   | `head`             | `<call fn="head">` in `RConsole`, or [`useRValue`](#values-and-tables) for rows |
| 13   | `lm`               | `<lm>` with a formula written with `r`                                          |
| 14   | `sum`              | `<sum>`                                                                         |
| 15   | `View`             | `useRValue` and a table of your own                                             |
| 16   | `print`            | `RConsole` prints visible values, and `<print>` works                           |
| 17   | `install.packages` | `packages` of `WebRProvider`                                                    |
| 18   | `mean`             | `<mean>`                                                                        |
| 19   | `setwd`            | Not needed                                                                      |
| 20   | `names`            | `<names>`                                                                       |

## Plots

`RCanvas` draws what its children describe. ggplot2 layers are children of `<ggplot>`:

```tsx
<RCanvas width={600} height={400}>
  <ggplot
    data={mtcars}
    mapping={aes({ x: "wt", y: "mpg", colour: r`factor(cyl)` })}
  >
    <geom_point size={2} />
    <facet_wrap facets={r`~cyl`} />
    <labs title="Fuel economy" x="Weight" colour="Cylinders" />
    <theme_minimal />
    <theme legend-position="bottom" />
  </ggplot>
</RCanvas>
```

| Chart      | Mapping                                  | Layer                          |
| ---------- | ---------------------------------------- | ------------------------------ |
| Scatter    | `aes({ x: "wt", y: "mpg" })`             | `<geom_point />`               |
| Line       | `aes({ x: "wt", y: "mpg" })`             | `<geom_line />`                |
| Bar        | ``aes({ x: r`factor(cyl)` })``           | `<geom_bar />`                 |
| Histogram  | `aes({ x: "mpg" })`                      | `<geom_histogram bins={10} />` |
| Box plot   | ``aes({ x: r`factor(cyl)`, y: "mpg" })`` | `<geom_boxplot />`             |
| Density    | `aes({ x: "mpg" })`                      | `<geom_density />`             |
| Trend line | `aes({ x: "wt", y: "mpg" })`             | `<geom_smooth method="lm" />`  |

Base graphics take their annotations as children:

```tsx
<RCanvas width={600} height={400}>
  <hist x={mpg} breaks={10} main="Miles per gallon">
    <abline v={20} col="red" lwd={2} />
    <mtext text="red: 20 mpg" side={3} />
  </hist>
</RCanvas>
```

- This works for `plot`, `hist`, `barplot`, `boxplot`, `pie`, `curve`, `pairs`, `coplot`, `matplot`, `dotchart`, `image`, `contour`, `persp`, `qqnorm` and `qqplot`. Register any other function with `extend({ stripchart: "sequence" })`.
- Several top-level elements are separate statements. `<par mfrow={[1, 2]} />` followed by two plots draws them side by side.
- A `Date` becomes a date-time in R, also as a cell of the data, so a time axis needs no conversion:

```tsx
const visits = [
  { day: new Date("2026-01-02"), n: 3 },
  { day: new Date("2026-01-03"), n: 5 },
];

<ggplot data={visits} mapping={aes({ x: "day", y: "n" })}>
  <geom_line />
  <scale_x_datetime date_labels="%b %d" />
</ggplot>;
```

- `onOutput` of `RCanvas` receives the messages and warnings of the plot, for example "Removed 1 row containing missing values".

## Printed results

`RConsole` shows what R prints:

```tsx
<RConsole>
  <summary>
    <lm formula={r`mpg ~ wt`} data={mtcars} />
  </summary>
</RConsole>
```

| R                                        | JSX                                                            |
| ---------------------------------------- | -------------------------------------------------------------- |
| `summary(mtcars)`                        | `<call fn="summary" args={[mtcars]} />`                        |
| `head(mtcars, 3)`                        | `<call fn="head" args={[mtcars, 3]} />`                        |
| `str(mtcars)`                            | `<str object={mtcars} />`                                      |
| `t.test(mpg, mu = 20, conf.level = 0.9)` | `<t-test x={mpg} mu={20} conf-level={0.9} />`                  |
| `table(mtcars$cyl)`                      | ``<call fn="table" args={[r`${mtcars}$cyl`]} />``              |
| `cor(wt, mpg)`                           | `<cor x={wt} y={mpg} />`                                       |
| `aggregate(mpg ~ cyl, mtcars, mean)`     | ``<aggregate x={r`mpg ~ cyl`} data={mtcars} FUN={r`mean`} />`` |
| `mean(x, na.rm = TRUE)`                  | `<mean x={[...mpg, null]} na-rm />`                            |

- A child element is the first argument of its parent, so `<summary><lm ... /></summary>` is `summary(lm(...))`.
- Messages and warnings are shown in the order in which R raised them. Each piece of output is a `<span data-type="...">` that CSS can style.

## Values and tables

`useRValue` returns the value of an `r` expression as a JavaScript value:

```tsx
const r2 = useRValue<number[]>(
  r`summary(lm(mpg ~ wt, data = ${mtcars}))$r.squared`,
);
// r2.value: [0.7528]

const fit = useRValue<Record<string, number>>(
  r`coef(lm(mpg ~ wt, data = ${mtcars}))`,
);
// fit.value: { "(Intercept)": 37.29, wt: -5.34 }

const means = useRValue<{ cyl: number; mpg: number }[]>(
  r`aggregate(mpg ~ cyl, data = ${mtcars}, FUN = mean)`,
);
// means.value: [{ cyl: 4, mpg: 26.66 }, { cyl: 6, mpg: 19.74 }, { cyl: 8, mpg: 15.1 }]
```

A data frame arrives as an array of row objects, which is what a table needs:

```tsx
<table>
  <tbody>
    {means.value?.map((row) => (
      <tr key={row.cyl}>
        <td>{row.cyl}</td>
        <td>{row.mpg.toFixed(1)}</td>
      </tr>
    ))}
  </tbody>
</table>
```

- A vector is an array, also with one element: read a single number with `value?.[0]`.
- Factors arrive as their labels and dates as strings. The full rules are in the [architecture document](architecture.md#uservalue).

## Data

| Source                     | How                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| JavaScript rows or columns | `data={rows}`. An array of row objects or an object of columns becomes a `data.frame` |
| A data set that R ships    | ``data={r`iris`}``                                                                    |
| CSV text                   | ``data={r`read.csv(text = ${csv})`}``, with `csv` fetched by the app                  |
| Base R                     | ``data={r`subset(${mtcars}, hp > ${100})`}``                                          |
| dplyr and the pipe         | ``data={r`${mtcars} \|> filter(hp > ${100}) \|> mutate(ratio = mpg / wt)`}``          |
| JavaScript                 | `data={mtcars.filter((car) => car.hp > 100)}`                                         |

- dplyr needs `packages={["ggplot2", "dplyr"]}` on `WebRProvider`. The provider installs and attaches the packages, which replaces `install.packages()` and `library()`.
- Values inside `r` are converted, never pasted as code: a string is quoted and an object is handed to R as data.
- Data is compared by value. Filtering in JavaScript during render does not run R again while the selected rows stay the same.
- Each run has its own environment. A variable that one component assigns is not visible in another one, so share data through JavaScript.

## Names and values

| R                             | JSX                                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| `na.rm = TRUE`, `conf.level`  | `na-rm`, `conf-level={0.9}`: a hyphen stands for a dot                      |
| `t.test()`, `data.frame()`    | `<t-test>`, `<data-frame>`                                                  |
| `date_labels`, `geom_point()` | An underscore stays as it is                                                |
| `stats::t.test()`             | `<call fn="stats::t.test">`, or `const Test = "stats::t.test"` and `<Test>` |
| `max(1, 3, 2)`                | `<call fn="max" args={[1, 3, 2]} />` for arguments without a name           |
| `c(1, 2)`                     | `[1, 2]`                                                                    |
| `c(1, NA, 3)`                 | `[1, null, 3]`                                                              |
| `NULL`                        | `null`                                                                      |
| `TRUE`                        | `true`, or the prop without a value                                         |
| `c(low = 1, high = 9)`        | `` r`c(low = 1, high = 9)` ``                                               |
| `list(title = "Cars")`        | `{ title: "Cars" }`                                                         |
| `mpg ~ wt`                    | `` r`mpg ~ wt` ``                                                           |
| `factor(cyl)`                 | `` r`factor(cyl)` ``                                                        |
| A column in `aes()`           | `aes({ x: "wt" })`                                                          |
| A date-time                   | `new Date("2026-01-02")`                                                    |

### Names that are also HTML tags

Some R functions share their name with an HTML or SVG tag: `summary`, `head`, `table`, `title`, `text`, `legend`, `image`, `rect`, `polygon`, `filter`, `select`, `data`, `source`, `var`, `sub`, `col`, `body`, `time`, `q`, `stop`, `switch` and `map`.

- At run time they are R functions like any other tag inside `RCanvas` and `RConsole`.
- TypeScript checks their props against the HTML attributes and rejects R arguments: `<head x={mtcars} n={3} />` is a type error. Children are accepted, so `<summary><lm ... /></summary>` passes.
- Write them with `<call>` when TypeScript rejects the props: `<call fn="head" args={[mtcars, 3]} />` or `<call fn="legend" x="topright" legend="20 mpg" />`.

## Not supported

| Feature                                              | Instead                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Arguments without a name on tags other than `<call>` | `<call fn args>`, a child element, or `r`                            |
| An element as the value of a prop                    | ``axis-text={r`element_text(size = 12)`}``                           |
| Interactive widgets (plotly, htmlwidgets)            | Read the data with `useRValue` and draw it with a JavaScript library |
| Files that R writes                                  | `webR.FS.readFile()` of the app's webR instance                      |
| Typing into the console, `readline()`                | React inputs and state                                               |
| Output while R is still running                      | Output arrives when the run has finished                             |
| Time zones other than UTC for `Date` values          | `` r`format(${day}, tz = "Asia/Tokyo")` `` in R                      |
| Packages without a WebAssembly build                 | See the [webR package repository](https://repo.r-wasm.org/)          |
