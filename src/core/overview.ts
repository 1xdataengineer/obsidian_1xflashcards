import type { Card, Deck } from './card';
import { isDue } from './session';

export type OverviewStatus = 'due' | 'new' | 'upcoming' | 'error';

export interface OverviewRow {
	readonly path: string;
	readonly card: Card;
	readonly status: OverviewStatus;
}

/** Due reviews first, then new, upcoming, and malformed cards. */
export function buildOverview(decks: readonly Deck[], now: Date): OverviewRow[] {
	const order: Record<OverviewStatus, number> = { due: 0, new: 1, upcoming: 2, error: 3 };
	return decks.flatMap((deck) => deck.cards.map((card): OverviewRow => ({
		path: deck.path,
		card,
		status: card.state.kind === 'scheduled'
			? (isDue(card.state.meta, now) ? 'due' : 'upcoming')
			: card.state.kind,
	}))).sort((a, b) => {
		const status = order[a.status] - order[b.status];
		if (status) return status;
		if (a.card.state.kind === 'scheduled' && b.card.state.kind === 'scheduled') {
			const time = Date.parse(a.card.state.meta.next_practice) - Date.parse(b.card.state.meta.next_practice);
			if (time) return time;
		}
		return a.path.localeCompare(b.path) || a.card.span.start - b.card.span.start;
	});
}
