# webr-fiber

Declarative R for React, powered by [webR](https://docs.r-wasm.org/webr/latest/). Unofficial.

webr-fiber is a custom React renderer that turns JSX into R code and runs it in the browser with webR (R compiled to WebAssembly). Plots re-render when React state changes, without a server.

```tsx
<RCanvas width={600} height={400}>
  <ggplot data={mtcars} mapping={aes({ x: "wt", y: "mpg" })}>
    <geom_point size={size} />
    {smooth && <geom_smooth method="lm" />}
  </ggplot>
</RCanvas>
```

> **Status:** pre-alpha. The repository currently contains the development workflow only. The API above is a design target, not a working feature.

## Language

All documentation, issues, pull requests, code comments and commit messages in this repository are written in **English**, so that contributors from any country can take part. See [ADR 0002](docs/decisions/0002-english-only-documentation.md).

## Documentation

| Purpose                                        | Document                           |
| ---------------------------------------------- | ---------------------------------- |
| Find the right document                        | [docs/README.md](docs/README.md)   |
| Set up, implement, verify, open a pull request | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Instructions for AI coding agents              | [AGENTS.md](AGENTS.md)             |
| Why important decisions were made              | [docs/decisions/](docs/decisions/) |

## Relationship to webR

webr-fiber is not affiliated with the webR project or Posit. It depends on the public `webr` npm package.

## License

To be decided before the first release.
