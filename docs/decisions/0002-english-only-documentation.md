# 0002: English-only documentation and communication

- Status: Accepted
- Date: 2026-11-17
- Related: [Language policy](../../CONTRIBUTING.md#language-policy)

## Context

webr-fiber is meant for React and R users worldwide. The maintainer's first language is Japanese, and the workflow it is based on (Animic) writes documentation in Japanese. Users and contributors from other countries need to read the documentation, follow discussions in issues and pull requests, and understand the history.

## Decision drivers

- Anyone can read every document, issue, pull request and commit.
- One source of truth: no documents that drift apart between languages.
- The rule can be checked partly by CI.

## Considered options

| Option                             | Pros                                                 | Cons and constraints                                         |
| ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| English only                       | Readable by the widest audience; one source of truth | Extra effort for non-native writers                          |
| English and Japanese side by side  | Comfortable for Japanese readers                     | Twice the maintenance; translations drift apart              |
| Japanese, with English README only | Least effort for the maintainer                      | Contributors abroad cannot follow issues, reviews or history |

## Decision

All documentation, issues, pull requests, review comments, release notes, commit messages, branch names, code identifiers, code comments and messages shown to users are written in English. CI rejects pull request titles and commit messages that contain Japanese, Chinese or Korean characters.

## Rationale

English is the common language of the React and R ecosystems. A single language avoids translation drift. Plain, simple English is enough; correctness of meaning matters more than style.

## Consequences

- Japanese speakers, including the maintainer, write in English. Translation tools are allowed.
- Translations of user documentation may be added later as clearly marked, non-authoritative copies, if needed.
- CI checks only titles and commit messages; documents and code are checked in review.

## Review conditions

- A large group of users needs documentation in another language.

## Evidence

- Maintainer request on 2026-11-17: the project must state that all documentation is in English because it will be used outside Japan.
