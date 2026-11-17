# 0001: Git workflow and commit validation

- Status: Accepted
- Date: 2026-11-17
- Related: [CONTRIBUTING.md](../../CONTRIBUTING.md)

## Context

Humans and AI coding agents should propose, verify and review changes in the same way. The workflow is based on the one used by the [Animic](https://github.com/animic-works/animic) project (spec issues, `main`/`develop`/topic branches, Conventional Commits validated in CI), adapted for a small open-source library.

## Decision drivers

- Branch names, commit messages and pull request titles can be validated automatically.
- Validation does not depend on local hooks being enabled.
- Individual changes and releases are kept apart, and the history of `main` and `develop` stays shared.
- A solo maintainer can work without a second reviewer, while outside contributions are still reviewed.
- Few tools: the library uses plain Vite, not a full toolchain.

## Considered options

| Option                                        | Pros                                     | Cons and constraints                               |
| --------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| commitlint + simple-git-hooks, repeated in CI | Small, explicit, works with npm          | Hooks are installed per clone and can be skipped   |
| Vite+ hooks and checks (as in Animic)         | One toolchain for hooks, lint and checks | Extra toolchain for a library that only needs Vite |
| Husky or Lefthook                             | Popular, flexible                        | More configuration than needed                     |
| Templates only                                | Easy to adopt                            | Nothing is validated                               |

## Decision

- Use commitlint (`@commitlint/config-conventional`, scope required, 72 characters) and simple-git-hooks locally, and validate branch names, pull request titles and commits again in CI.
- Use `main`, `develop` and topic branches. Topic → `develop` is a squash merge; `develop` → `main` is a merge commit.
- Protect `main` and `develop` with repository rulesets: pull requests required, required checks `Quality` and `Commit policy`, one approving review, resolved conversations, no force pushes or deletion.
- Repository administrators may bypass the review requirement through a pull request. Required checks are in a separate ruleset without a bypass, so they apply to everyone.
- Make `develop` the default branch.

## Rationale

commitlint covers the message format, and simple-git-hooks only wires it into Git, so no tool duplicates another. Because CI repeats every check and the required checks cannot be bypassed, a merge never depends on local hooks.

Squashing topic branches keeps one commit per pull request on `develop`. Merging `develop` into `main` with a merge commit keeps the two branches' history shared; squashing there would drop the original commits from `main`.

GitHub does not let authors approve their own pull requests. Without an exception, a solo maintainer could not merge at all. Limiting the exception to the review requirement keeps CI mandatory.

`develop` is the default branch so that pull requests from contributors target it automatically.

## Consequences

- Each clone runs `npm ci` to install the hooks.
- English quality and whether work without an issue was allowed are checked in review, not by CI.
- Admin bypass also allows an admin to merge with a different merge method; the maintainer follows the merge table in CONTRIBUTING.md.

## Review conditions

- A second maintainer joins: consider removing the admin bypass of the review requirement.
- The project moves to a different toolchain or package manager.
- The release process changes (for example automated releases from `main`).

## Evidence

- Animic workflow, read on 2026-11-17: `CONTRIBUTING.md`, `docs/decisions/0001-git-workflow.md` and `.github/workflows/commit-policy.yml` in [animic-works/animic](https://github.com/animic-works/animic) (`develop` branch).
- [commitlint configuration](https://commitlint.js.org/reference/configuration.html)
- [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
