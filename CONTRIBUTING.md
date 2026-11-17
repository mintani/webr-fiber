# Contributing guide

| Goal                                   | Section                                           |
| -------------------------------------- | ------------------------------------------------- |
| Know which language to write in        | [Language policy](#language-policy)               |
| Set up a local environment             | [Setting up](#setting-up)                         |
| Change code or documentation           | [Making a change](#making-a-change)               |
| Run the right checks                   | [Verifying a change](#verifying-a-change)         |
| Follow branch, commit and review rules | [Opening a pull request](#opening-a-pull-request) |
| Merge and release                      | [Merging and releasing](#merging-and-releasing)   |

The entry point to all documentation is [docs/README.md](docs/README.md). Instructions for AI coding agents are in [AGENTS.md](AGENTS.md).

## Language policy

Everything committed to or published from this repository is written in **English**:

- Documentation (README, guides, ADRs, design documents)
- Issues, pull requests, review comments and release notes
- Commit messages and branch names
- Code identifiers, code comments, error messages and log output

Identifiers from R, webR or other projects keep their original spelling. Write plain, simple English; contributors are not expected to be native speakers. Reviewers check the language, and CI rejects pull request titles and commit messages that contain Japanese, Chinese or Korean characters. The reasons are recorded in [ADR 0002](docs/decisions/0002-english-only-documentation.md).

## Setting up

### Prerequisites

| Tool    | Version                            |
| ------- | ---------------------------------- |
| Node.js | See [.node-version](.node-version) |
| npm     | Bundled with Node.js               |

```sh
npm ci
```

`npm ci` also installs the Git hooks through the `prepare` script:

| Hook         | Runs                                                      |
| ------------ | --------------------------------------------------------- |
| `pre-commit` | `npm run check` (formatting)                              |
| `commit-msg` | commitlint against [.commitlintrc.yml](.commitlintrc.yml) |

Optionally, use the commit message template: `git config --local commit.template .gitmessage`.

Local hooks can be skipped, so CI repeats every check before a merge.

## Making a change

### Workflow

1. **Find or open an issue.** Use the [spec template](.github/ISSUE_TEMPLATE/spec.md) for new features or behavior changes and the [bug template](.github/ISSUE_TEMPLATE/bug.md) for defects. Do not fill unknown requirements with guesses; mark them as `[To confirm: question]`.
2. **Get the spec approved before implementing.** Approval is a maintainer comment on the issue. If the spec changes during the work, update the issue.
3. **Create a topic branch from `develop`.** One issue, one topic branch, one pull request. Split large work into several issues.
4. **Implement, update the related documents and verify.** Group commits into logical units.
5. **Open a pull request into `develop`** using the [pull request template](.github/pull_request_template.md), and link the issue with `Refs #<number>`.
6. **Close the issue** after the pull request is merged and the acceptance criteria are met. Leave a comment with the merged pull request.

Work that is explicitly approved without an issue may skip steps 1 and 2.

### Documents

| Document               | Owns                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| README.md              | Overview and links to other documents                                                 |
| docs/README.md         | Index of documents by purpose                                                         |
| CONTRIBUTING.md        | Current setup, workflow, verification and Git rules                                   |
| AGENTS.md              | Instructions for AI coding agents                                                     |
| docs/decisions/ (ADRs) | Context, options, decision, consequences and review conditions of important decisions |
| Source code and tests  | Current API, behavior and automated verification                                      |

- Keep each rule in exactly one document and link to it from others.
- When a change affects a rule or a design, update the related document in the same pull request.
- Use the [ADR template](docs/decisions/template.md) for decisions that someone will later need the reasons for. Save ADRs as `docs/decisions/NNNN-short-name.md`. Not every implementation detail needs an ADR.
- To change a recorded decision, write a new ADR, set the old one to "Superseded by NNNN" and link them.
- Keep drafts, chat logs and progress notes outside the repository.

### Dependencies

- Pin direct dependencies to exact versions in `package.json`. `package-lock.json` records the full tree, and CI installs with `npm ci`.
- Before updating, read the release notes and check peer dependency ranges.
- `react`, `react-dom` and `webr` will be peer dependencies of the published package. See the compatibility policy once it is recorded in an ADR.

## Verifying a change

| Command          | Checks                       |
| ---------------- | ---------------------------- |
| `npm run check`  | Formatting (Prettier)        |
| `npm run format` | Rewrites files with Prettier |

Lint, type checking, tests and builds are added to `npm run check` and CI together with the library code. In the pull request, record which commands you ran and their results. Do not report a build as verified if you only started the dev server.

## Opening a pull request

### Branches

| Branch         | Role                         | Created from / merged into                    |
| -------------- | ---------------------------- | --------------------------------------------- |
| `main`         | Released, stable code        | Receives pull requests from `develop` only    |
| `develop`      | Integration of finished work | Receives pull requests from topic branches    |
| Topic branches | One change each              | Created from `develop`, merged into `develop` |

`develop` is the default branch, so new pull requests target it automatically.

Name topic branches `type/<issue-number>-<short-description>` in lowercase kebab-case:

| Prefix      | Use                             | Example                       |
| ----------- | ------------------------------- | ----------------------------- |
| `feat/`     | New feature                     | `feat/12-rcanvas`             |
| `fix/`      | Bug fix                         | `fix/13-stale-plot`           |
| `refactor/` | Structure change, same behavior | `refactor/14-codegen-env`     |
| `perf/`     | Performance                     | `perf/15-skip-unchanged-code` |
| `docs/`     | Documentation                   | `docs/16-getting-started`     |
| `test/`     | Tests                           | `test/17-host-config`         |
| `build/`    | Build and dependencies          | `build/18-update-webr`        |
| `ci/`       | CI configuration                | `ci/19-browser-tests`         |
| `style/`    | Formatting only                 | `style/20-prettier`           |
| `revert/`   | Reverting a change              | `revert/21-undo-scheduler`    |
| `chore/`    | Other maintenance               | `chore/22-ignore-cache`       |

Omit the number (`type/<description>`) only for work explicitly approved without an issue. Only the prefixes above are allowed; agent or personal prefixes such as `claude/`, `codex/` or `<name>/` are not.

### Commit and pull request format

Issue titles, pull request titles and commit subjects use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description in English`.

- `type` is one of the prefixes above; `scope` (required) is the area changed, for example `codegen`, `renderer`, `repo`.
- Maximum 72 characters.
- Use the imperative mood: `feat(codegen): add plus composer`, not `added plus composer`.
- Use the commit body for the reason behind a change when the subject is not enough. Requirements, design and verification results belong in the issue, the pull request or documents.

### CI and review

| Workflow                                             | Job             | Checks                                                                                           |
| ---------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| [Checks](.github/workflows/checks.yml)               | `Static checks` | `npm run check`                                                                                  |
|                                                      | `Quality`       | Required check. Passes only if every job above passed                                            |
| [Commit policy](.github/workflows/commit-policy.yml) | `Commit policy` | Branch name, target branch, pull request title, commit messages, English-only titles and commits |

Merging into `main` or `develop` requires:

- a pull request (no direct pushes, no force pushes, no branch deletion),
- the required checks `Quality` and `Commit policy` to pass,
- one approving review and no unresolved conversations.

**Maintainer exception:** repository administrators may merge their own pull requests without an approving review. This keeps a solo maintainer unblocked. Required checks still apply to everyone. When a second maintainer joins, revisit this rule.

## Merging and releasing

| Path               | Method       | Reason                                           |
| ------------------ | ------------ | ------------------------------------------------ |
| Topic → `develop`  | Squash merge | One commit per pull request                      |
| `develop` → `main` | Merge commit | Keep shared history between `main` and `develop` |

The squash commit uses the pull request title as its subject. A release pull request from `develop` to `main` lists the included pull requests and their verification results. Release notes describe the changes and anything users need to do when upgrading.
