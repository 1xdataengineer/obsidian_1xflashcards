// Pure data model for 1xFlashcards. No `obsidian` imports allowed anywhere in src/core.

/** A rating the user gives after seeing the answer (Q2: SM-2 four-button set). */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

/** One historical practice event. */
export interface PracticeEvent {
	readonly rating: Rating;
	readonly at: string; // ISO-8601 timestamp
}

/** Validated, schedulable metadata: SM-2 bookkeeping + stable id + history. */
export interface CardMeta {
	readonly id: string; // globally-unique, clash-proof (crypto.randomUUID)
	readonly ease_factor: number; // SM-2 EF, floored at 1.3, defaults to 2.5
	readonly interval: number; // current inter-review interval, in days
	readonly repetitions: number; // SM-2 n: consecutive successful reviews
	readonly last_practice: string; // ISO-8601
	readonly next_practice: string; // ISO-8601
	readonly last_20: readonly PracticeEvent[]; // most-recent-last, capped at 20
}

/** The three card states from the spec, as a discriminated union. */
export type CardState =
	| { readonly kind: 'new'; readonly question: string; readonly answer: string }
	| { readonly kind: 'error'; readonly reason: string; readonly raw: string }
	| {
			readonly kind: 'scheduled';
			readonly question: string;
			readonly answer: string;
			readonly meta: CardMeta;
	  };

/** A half-open char range [start, end) into the source file text. */
export interface Span {
	readonly start: number;
	readonly end: number;
}

/**
 * A parsed card plus the byte offsets needed for exact write-back.
 * - `span` covers the whole ```ad-flashcard block (for identity/debugging).
 * - `metaSpan` is the region replaced by serialized frontmatter. For a `new`
 *   card it is zero-length (an insertion point right after the opening fence).
 */
export interface Card {
	readonly state: CardState;
	readonly span: Span;
	readonly metaSpan: Span;
}

export interface Deck {
	readonly path: string; // vault-relative file path
	readonly cards: readonly Card[];
}
