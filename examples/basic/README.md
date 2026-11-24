# Basic example

The plot from the [README](../../README.md), running in the browser: a ggplot2 scatter plot of the `mtcars` data, drawn by R and driven by React state.

| Control    | React state | R code                            |
| ---------- | ----------- | --------------------------------- |
| Point size | `size`      | `geom_point(size = ...)`          |
| Trend line | `smooth`    | Adds `geom_smooth(method = "lm")` |

The page also shows the R code that webr-fiber generates from the JSX in [src/App.tsx](src/App.tsx).

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
