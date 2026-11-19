# Instructions for AI coding agents

## Before you start

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/README.md](docs/README.md). For work based on an issue, read the issue body and all comments.

## Language

Write everything that goes into the repository or onto GitHub in English: code, comments, documentation, issues, pull requests, review comments, commit messages and branch names. This applies even when the person instructing you writes in another language. You may reply to that person in their language. See the [language policy](CONTRIBUTING.md#language-policy).

## Workflow rules

- Follow the [workflow](CONTRIBUTING.md#workflow): spec issue, approval, topic branch from `develop`, pull request into `develop`.
- Do not implement a spec that has not been approved. Return open questions to a human as `[To confirm: question]` instead of deciding them silently.
- Name branches as described in [Branches](CONTRIBUTING.md#branches). Do not use your tool's default branch prefix (for example `claude/` or `codex/`).
- Use the [commit and pull request format](CONTRIBUTING.md#commit-and-pull-request-format).
- Never push directly to `main` or `develop`, force push, or delete them.

## Verification

Run `npm run check`, `npm test` and `npm run build` before every pull request and record the results in the pull request template. For a change that affects what users see, also check it in a browser with `npm run example`. When you change a command, update [CONTRIBUTING.md](CONTRIBUTING.md#verifying-a-change) and this file in the same pull request.

## Permissions

Ask a human before you merge a pull request, create a release, publish to npm, change repository settings or rulesets, or change a recorded decision (ADR).
