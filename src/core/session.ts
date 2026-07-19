import type { Card, CardMeta, Deck } from './card';

/** A practice session snapshot: an ordered queue plus the error cards to surface. */
export interface Session {
	readonly queue: readonly Card[];
	readonly errors: readonly Card[];
}

/** A scheduled card is due when its next_practice is at or before `now`. */
export function isDue(meta: CardMeta, now: Date): boolean {
	return Date.parse(meta.next_practice) <= now.getTime();
}

/**
 * Build the practice queue for a deck (Q6): every `new` card plus every *due*
 * `scheduled` card. Due reviews come first, most-overdue first; new cards follow in
 * document order. `error` cards are pulled aside for surfacing, never practiced.
 * Pure — a snapshot computed from (deck, now).
 */
export function buildSession(deck: Deck, now: Date): Session {
	const due: Card[] = [];
	const fresh: Card[] = [];
	const errors: Card[] = [];

	for (const card of deck.cards) {
		switch (card.state.kind) {
			case 'new':
				fresh.push(card);
				break;
			case 'error':
				errors.push(card);
				break;
			case 'scheduled':
				if (isDue(card.state.meta, now)) due.push(card);
				break;
		}
	}

	const dueByOverdue = [...due].sort((a, b) => dueTime(a) - dueTime(b));
	return { queue: [...dueByOverdue, ...fresh], errors };
}

function dueTime(card: Card): number {
	return card.state.kind === 'scheduled'
		? Date.parse(card.state.meta.next_practice)
		: 0;
}
