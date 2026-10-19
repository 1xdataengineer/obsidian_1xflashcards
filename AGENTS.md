# Agent instructions for 1xFlashcards

These instructions apply throughout this repository.

## Project

1xFlashcards is an offline Obsidian community plugin. Notes containing fenced
`ad-flashcard` blocks act as decks. Scheduling metadata lives inside each card's
block; there is no separate card database. The plugin supports desktop and mobile
(`isDesktopOnly: false`).

Use TypeScript, npm, and esbuild. Runtime dependencies are `yaml` and `zod`;
Obsidian is provided by the host. Keep additional dependencies small and compatible
with browsers and mobile. Do not replace the package manager or bundler casually.

## Repository map

- `src/main.ts`: plugin lifecycle, view registration, and the `practice-deck`
  command, enabled for an active Markdown note containing a deck fence.
- `src/core/card.ts`: readonly card/deck types, metadata, spans, and ratings.
- `src/core/parse.ts`: fenced-block parsing, Q/A extraction, and metadata spans.
- `src/core/validate.ts`: Zod validation of parsed YAML metadata.
- `src/core/schedule.ts`: deterministic scheduling transitions and history.
- `src/core/session.ts`: due-card selection, queue ordering, and error separation.
- `src/core/overview.ts`: vault-wide card status classification and ordering.
- `src/core/serialize.ts`: stable metadata serialization and source-text splicing.
- `src/io/deck-io.ts`: Obsidian vault reads and atomic rating writes.
- `src/io/vault-overview.ts`: on-demand vault scan with bounded parallel reads.
- `src/view/OverviewView.ts`: refreshable vault overview table and note links,
  opened by the `flashcard-overview` command.
- `src/view/PracticeView.ts`: practice panel, answer reveal, rating previews,
  persistence feedback, and same-session retries.
- `styles.css`: theme-aware practice panel styling.
- `tests/*.test.ts`: core unit tests and a parse/schedule/write/reparse integration
  test; these do not exercise the Obsidian UI or vault APIs.
- `esbuild.config.mjs`, `tsconfig.json`, `eslint.config.mts`,
  `vitest.config.mts`: build, type-check, lint, and test configuration.
- `.github/workflows/lint.yml`: build and lint on pushes and pull requests using
  Node 20, 22, and 24. It does not currently run Vitest.
- `.github/workflows/release.yml`: tag-triggered production build and draft
  GitHub release using Node 24.

## Architecture and editing rules

- Preserve the pure functional core and thin Obsidian shell. Never import
  `obsidian`, access the vault/DOM, generate randomness, or read the current time
  inside `src/core/`. Inject timestamps and fresh IDs as arguments.
- Keep vault persistence in `src/io/deck-io.ts`. Use `vault.cachedRead` for deck
  loading and `vault.process` for atomic read/modify/write. Parse and schedule
  from the fresh text inside the process callback, never from stale offsets.
- Keep `main.ts` focused on lifecycle and registration. Put new feature logic in
  focused modules. Consider splitting files beyond roughly 200–300 lines.
- Follow existing tabs, single quotes, semicolons, readonly data models, and
  discriminated unions. TypeScript enables strict checking,
  `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`.
- Prefer async/await and graceful user-visible handling of I/O errors.
- Preserve command ID `practice-deck`, view type `flashcards-practice-view`, and
  plugin ID `1xflashcards`; treat persisted metadata names as compatibility API.

## Card format and data integrity

- Recognize backtick and tilde `ad-flashcard` fences. Q/A markers support
  `Question:` / `Answer:`, `Q:` / `A:`, bold variants, and case-insensitive matching.
  Preserve multiline content and existing parser behavior when extending syntax.
- Cards are `new`, `scheduled`, or `error`. Surface malformed cards with a reason;
  never practice or rewrite them.
- Write only the metadata region identified by `metaSpan`. Preserve Q/A text,
  surrounding prose, and other cards byte-for-byte. Do not rebuild the whole note
  from parsed objects. Spans are JavaScript string offsets, not UTF-8 byte offsets.
- Metadata contains `id`, `ease_factor`, `interval`, `repetitions`, `learning`,
  `last_practice`, `next_practice`, and `last_20`. Keep IDs stable across reviews;
  generate first-time IDs with `crypto.randomUUID()` in the shell.
- Validation tolerates unknown keys by stripping them; it does not preserve them
  during serialization. Missing `learning` defaults to `null` for older cards,
  and missing `last_20` defaults to an empty array. Preserve backward compatibility
  when extending the schema.
- History is oldest-first and capped at the latest 20 events by the scheduler.

## Scheduling and session behavior

Use `src/core/schedule.ts` and its tests as the source of truth. The README's
classic SM-2 description does not fully describe the implemented short-term steps.

- Ratings are `again`, `hard`, `good`, and `easy`, mapping to quality 1, 3, 4, and 5.
- New cards use learning steps of 1 and 10 minutes. `again` restarts, `hard`
  repeats, `good` advances and then graduates at 1 day, and `easy` graduates
  immediately at 4 days.
- Graduated reviews use SM-2 with an ease-factor floor of 1.3 and the
  1-day, 6-day, then rounded interval-times-ease progression.
- A review lapse enters a 10-minute relearning step. Passing relearning returns
  the card to a day-scale review interval.
- Session building puts due reviews first, most overdue first, followed by new
  cards in document order. Error cards are returned separately.
- The view immediately appends cards still in learning/relearning to the session
  queue after saving. It currently does not wait for their next-practice time.
- Rating previews must use the same scheduler as persisted reviews.

## Commands and validation

Use Node 24 to match the release workflow, or another version supported by the
build matrix. Install locked dependencies with `npm ci`; use `npm install` when
intentionally updating dependencies and commit the corresponding lockfile.

```sh
npm run dev           # esbuild watch mode; does not run the TypeScript checker
npm run build         # TypeScript check followed by production main.js bundle
npm run lint          # ESLint including Obsidian-specific rules
npm test              # Vitest suite, Node environment
npm run test:watch    # interactive Vitest watch mode
npm run test:coverage # V8 coverage for src/core/**/*.ts
```

For source changes, run build, lint, and the relevant tests. Run coverage when
changing core behavior; configured thresholds are 80% for lines, branches,
functions, and statements. Add regression tests for meaningful parser,
serialization, scheduling, or queue changes. Use fixed dates and IDs in tests.
Test behavior and text preservation rather than implementation details.
Documentation-only changes need review of the diff, not a build or test run.

Tests are outside the TypeScript build's `include` and excluded from ESLint;
passing the production build and lint does not replace running Vitest.

For UI or vault integration changes, manually install `main.js`, `manifest.json`,
and `styles.css` into `<Vault>/.obsidian/plugins/1xflashcards/`, reload Obsidian,
and enable it under **Settings → Community plugins**. Check command availability,
answer reveal, all ratings, retries, malformed-card feedback, and saved note
contents as relevant. Check mobile where feasible; report unverified behavior.

## Obsidian UX, lifecycle, and privacy

- Keep startup light and defer deck reads until needed. Avoid whole-vault scans;
  batch or debounce expensive work when adding file-event handling.
- Register commands with `addCommand`. Use Obsidian's `registerEvent`,
  `registerDomEvent`, and `registerInterval` helpers for new listeners and timers
  that need cleanup. Ensure reload/unload does not leak resources.
- Preserve mobile compatibility: avoid Node/Electron APIs in runtime source.
- Use short sentence-case UI text and theme variables in CSS. Prefer “select” in
  interaction instructions and **Settings → Community plugins** in documentation.
- If configuration is added, provide sensible defaults, validation, a settings
  tab, and awaited `loadData` / `saveData` persistence.
- Keep operation local and offline. Access only necessary files inside the vault.
  Do not introduce telemetry, transmit vault contents, execute remote code, or
  self-update outside normal plugin releases.
- Any essential external service must have a clear user-facing reason, explicit
  opt-in, and disclosure of sent data and risks in settings and the README.

## Generated files and releases

- Never commit `node_modules/`, bundled `main.js`, sourcemaps, or new generated
  output. Existing `coverage/` reports are tracked; avoid incidental changes to
  them and do not use generated reports as authoritative source documentation.
- Release artifacts are root-level `main.js`, `manifest.json`, and `styles.css`.
  Dependencies must be bundled except host-provided modules configured as external.
- Only bump versions when the task calls for a release. Keep `package.json`,
  `package-lock.json`, `manifest.json`, and `versions.json` consistent.
- The npm `version` hook runs `version-bump.mjs`, copies the package version into
  the manifest, updates the minimum-app-version mapping, and stages the manifest
  and versions file. Be aware that `npm version` normally also commits and tags.
- Keep `minAppVersion` accurate for APIs used. Release tags must exactly match
  the manifest version with no leading `v`. The tag workflow creates a draft
  release with individual assets; publishing requires an authorized release task.
