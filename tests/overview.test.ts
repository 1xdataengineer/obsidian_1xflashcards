import { describe, expect, it } from 'vitest';
import { buildOverview } from '../src/core/overview';
import { parseDeck } from '../src/core/parse';
import { schedule } from '../src/core/schedule';
import { applyDeckUpdate } from '../src/core/serialize';

const now = new Date('2026-07-19T10:00:00Z');
const text = '```ad-flashcard\nQ: Capital?\nA: Paris\n```';
const fresh = parseDeck('New.md', text);

function scheduled(path: string, at: string) {
	const card = fresh.cards[0]!;
	const meta = { ...schedule(null, 'easy', now, path), next_practice: at };
	return parseDeck(path, applyDeckUpdate(text, card, meta));
}

describe('vault overview', () => {
	it('includes every card, separates new and invalid cards, and orders due reviews first', () => {
		const broken = parseDeck('Broken.md', '```ad-flashcard\n---\nid: bad\n---\nQ: q\nA: a\n```');
		const rows = buildOverview([
			fresh,
			scheduled('Future.md', '2026-07-20T10:00:00Z'),
			scheduled('Boundary.md', now.toISOString()),
			broken,
			scheduled('Overdue.md', '2026-07-01T10:00:00Z'),
		], now);
		expect(rows.map((row) => [row.path, row.status])).toEqual([
			['Overdue.md', 'due'], ['Boundary.md', 'due'], ['New.md', 'new'],
			['Future.md', 'upcoming'], ['Broken.md', 'error'],
		]);
		expect(rows[0]!.card.state.kind).toBe('scheduled');
	});

	it('keeps separate rows for cards in the same note and leaves source order unchanged', () => {
		const deck = parseDeck('Two.md', `${text}\n${text}`);
		const snapshot = JSON.stringify(deck);
		const rows = buildOverview([deck], now);
		expect(rows).toHaveLength(2);
		expect(rows[0]!.card.span.start).toBeLessThan(rows[1]!.card.span.start);
		expect(JSON.stringify(deck)).toBe(snapshot);
	});

	it('handles an empty vault', () => {
		expect(buildOverview([], now)).toEqual([]);
	});
});
