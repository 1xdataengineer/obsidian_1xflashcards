import type { Deck } from './card';
import { isDue } from './session';

export type OverviewStatus = 'due' | 'new' | 'upcoming' | 'error';

export interface OverviewRow {
	readonly path: string;
	readonly due: number;
	readonly new: number;
	readonly upcoming: number;
	readonly error: number;
	/** Previously reviewed cards, including those due again. */
	readonly practiced: number;
}

/** One row per deck, ordered by due count, then new count, then path. */
export function buildOverview(decks: readonly Deck[], now: Date): OverviewRow[] {
	return decks.filter((deck) => deck.cards.length > 0).map((deck): OverviewRow => {
		const counts = { due: 0, new: 0, upcoming: 0, error: 0, practiced: 0 };
		for (const card of deck.cards) {
			if (card.state.kind === 'scheduled') {
				counts.practiced++;
				counts[isDue(card.state.meta, now) ? 'due' : 'upcoming']++;
			} else {
				counts[card.state.kind]++;
			}
		}
		return { path: deck.path, ...counts };
	}).sort((a, b) => b.due - a.due || b.new - a.new || a.path.localeCompare(b.path));
}
