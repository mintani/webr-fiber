# 0003: Compatibility policy for React and webR

- Status: Accepted
- Date: 2026-11-19
- Related: [#1](https://github.com/mintani/webr-fiber/issues/1), [#3](https://github.com/mintani/webr-fiber/issues/3), [Dependencies](../../CONTRIBUTING.md#dependencies)

## Context

webr-fiber sits between two runtimes that the user's app already has: React and webR. If the package installed its own copies, the app would run two copies of React, where hooks and context do not work across copies, or two webR runtimes, each of which downloads R.

Both runtimes also limit which versions can be supported together:

- A custom renderer is built on `react-reconciler`, and each of its releases supports one range of React versions.
- webR is at version 0.x and makes breaking changes in minor versions. webR 0.6.0 moved to R 4.6.0, and R packages built for earlier versions are not binary compatible with it.

Users need to know which React and which webR a given version of webr-fiber works with.

## Decision drivers

- The user's app loads one copy of React and one copy of webR.
- The webr-fiber version tells the user which webR, and so which R, it runs on.
- One renderer implementation, so a solo maintainer can keep it tested.

## Considered options

| Option                                                        | Pros                                                  | Cons and constraints                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Peer dependencies: one React range, one webR minor per major  | One copy of each runtime; clear mapping; one renderer | Apps on older React cannot use it; every webR minor needs a new major version        |
| Peer dependencies with wide ranges (any React 19, any webR 0) | More apps can install it                              | Two renderer code paths; untested combinations; the R version can change unannounced |
| Regular dependencies                                          | Nothing extra to install                              | Two copies of React break hooks; a second webR downloads R again                     |

## Decision

- `react`, `react-dom` and `webr` are peer dependencies. The build keeps them out of the bundle.
- React: the range that the pinned `react-reconciler` supports. With `react-reconciler` 0.34.0 this is `^19.3.0`. React 19.2 and earlier are not supported.
- webR: each major version of webr-fiber supports one minor version of webR, declared with a tilde range.

  | webr-fiber | webR     | R     |
  | ---------- | -------- | ----- |
  | 0.x        | `~0.6.0` | 4.6.0 |

- Support for the next webR minor version is a breaking change. It is released as the next major version of webr-fiber.
- Development and CI pin exact versions of all three packages as dev dependencies.

## Rationale

Peer dependencies are the only option that keeps one copy of each runtime in the app. Following the range of one `react-reconciler` release keeps a single renderer and avoids combinations that `react-reconciler` does not support. Tying a webr-fiber major version to one webR minor version means that an update within a major version never changes the R version or breaks installed R packages.

## Consequences

- Users install `react`, `react-dom` and `webr` themselves.
- The `webr` package lists `react` and `react-dom` 18 as regular dependencies for its REPL app, so installing it adds a nested copy of React 18 under `node_modules/webr`. The `webr` entry point does not import React, so that copy does not reach the app bundle.
- A new React minor version needs a new `react-reconciler` release, and the supported React range moves with it.
- A new webR minor version needs a new major version of webr-fiber, even if no webr-fiber API changes.

## Review conditions

- webR releases 0.7 or 1.0, or changes how it versions breaking changes.
- React 19.4 or React 20 is released.

## Evidence

- [webR v0.6.0 release notes](https://github.com/r-wasm/webr/releases/tag/v0.6.0): R 4.6.0, Emscripten 4.0.8, packages built for earlier versions are not binary compatible.
- [webR v0.6.1 release notes](https://github.com/r-wasm/webr/releases/tag/v0.6.1): build recipes and an optional download timeout only.
- npm metadata read on 2026-11-19: `webr` 0.6.1 depends on `react` and `react-dom` `^18.2.0`. `react-reconciler` 0.31.0, 0.32.0, 0.33.0 and 0.34.0 have the peer dependency `react` `^19.0.0`, `^19.1.0`, `^19.2.0` and `^19.3.0`. `react-konva` 19.3.2 pins `react-reconciler` 0.34.0 and requires `react` `^19.3.0`.
- `node_modules/webr/dist/webr.mjs` in `webr` 0.6.1 contains no import of `react`, checked on 2026-11-19.
