# 1xFlashcards

## What: 
A minimal spaced-repetition flashcards plugin for [Obsidian](https://obsidian.md).
Cards live directly in your notes as `ad-flashcard` blocks, and reviews are scheduled
with the classic **SM-2** algorithm. Works on iPhone, iPad, and macOS.

## Why:
First, I find that introducing a database to keep track of flashcards is both overkill and a bit of an anti-pattern for obsidian. 

Second I like to have all notes about a subject (i.e. book, article, etc.) in **one** file and I find that collapsible admonition-blocks helps keep the files readable, while flashcard are still around the notes they originated from.

## Authoring cards

Any note that contains one or more `ad-flashcard` blocks is a **deck**. A brand-new
card is just a question and answer:

````markdown
```ad-flashcard
Question:
What is the capital of France?
Answer:
Paris
```
````

Once you practice it, the plugin writes back the scheduling metadata it owns — a stable
unique `id`, the SM-2 state, and a capped history — leaving your question/answer text
untouched byte-for-byte:

````markdown
```ad-flashcard
---
id: 3f8c1e42-9b6a-4d2e-8a11-6c0f7b1d9e55
ease_factor: 2.5
interval: 6
repetitions: 3
last_practice: 2026-07-19T10:00:00.000Z
next_practice: 2026-07-25T10:00:00.000Z
last_20:
  - { rating: good, at: 2026-07-19T10:00:00.000Z }
---
Question:
What is the capital of France?
Answer:
Paris
```
````

The `Question:` / `Answer:` markers are flexible: the shorthand `Q:` / `A:` works
too, as do bold variants like `**Q:**` and `**Answer:**`, and they're
case-insensitive. Multi-line questions and answers are supported. Because the block
is tagged `ad-flashcard`, the community
[Admonition](https://github.com/valentine195/obsidian-admonition) plugin will also
render it nicely in reading mode if you have it installed.

## Practicing

1. Open a note that contains at least one `ad-flashcard` block.
2. Run the **Practice deck** command (command palette). It's only enabled when the
   active note is a deck.
3. A side panel opens with the session queue: every **due** scheduled card plus every
   **new** card. Show the answer, then rate it **Again / Hard / Good / Easy**. Each
   button shows the interval it will schedule.

Cards with malformed metadata are surfaced in the panel (with the reason) and skipped —
they are never practiced and their text is never rewritten.

## Scheduling (SM-2)

Ratings map to SM-2 quality scores: `again → 1`, `hard → 3`, `good → 4`, `easy → 5`.
`again` is a lapse (repetitions reset, relearn in 1 day); `hard/good/easy` pass, with
the ease factor adjusted and the interval following the `1 → 6 → round(interval × EF)`
progression. The ease factor is floored at 1.3. The scheduler is a single pure function
(`src/core/schedule.ts`), so swapping in a different algorithm later is a one-file change.

To re-practice a card ahead of schedule, edit its `next_practice` to a past date by hand.

## Development

- `npm i` — install dependencies (Node ≥ 18).
- `npm run dev` — compile in watch mode.
- `npm run build` — type-check and produce a production `main.js`.
- `npm test` / `npm run test:coverage` — run the Vitest suite (the pure core is covered
  ≥ 80%).
- `npm run lint` — ESLint with the Obsidian plugin rules.

### Manual install

Copy `main.js`, `styles.css`, and `manifest.json` into
`VaultFolder/.obsidian/plugins/1xflashcards/`, then enable the plugin in Settings.

## API Documentation

See https://docs.obsidian.md
