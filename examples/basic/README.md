# Basic example

The plot from the [README](../../README.md), running in the browser: a ggplot2 scatter plot of the `mtcars` data, drawn by R and driven by React state. With the trend line on, the page also shows printed output and a value from R.

| Control            | React state | What follows                                                                       |
| ------------------ | ----------- | ---------------------------------------------------------------------------------- |
| Point size         | `size`      | `geom_point(size = ...)`                                                           |
| Minimum horsepower | `power`     | The rows are filtered in JavaScript. The plot and the model read the same rows     |
| Trend line         | `smooth`    | Adds `geom_smooth(method = "lm")`, the coefficients of the model and its R squared |

| Part of the page    | Library feature                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| Plot                | `RCanvas`                                                              |
| Line under the plot | `onOutput` of `RCanvas`: the message that ggplot2 prints for the trend |
| Generated R         | `onCode` of `RCanvas`                                                  |
| Coefficient table   | `RConsole` around `coef(summary(lm(...)))`                             |
| R squared           | `useRValue`                                                            |

All of it is in [src/App.tsx](src/App.tsx).

## Run

From the root of the repository:

```sh
npm ci
npm run example
```

Then open the address that Vite prints. The first start downloads R and ggplot2 from the webR CDN and package repository, so it needs a network connection and takes a few seconds.

## Notes

- The example imports the library source of this repository through an alias in [vite.config.ts](vite.config.ts). An app outside this repository installs the `webr-fiber` package instead.
- `webr` is excluded from Vite's dependency pre-bundling, because webR starts its worker from its own package files.
- The theme is in [src/theme.css](src/theme.css): CSS variables for a light and a dark set of colours, chosen by the colour scheme of the system.
