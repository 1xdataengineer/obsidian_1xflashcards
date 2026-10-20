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
	it('counts mixed card states in one row per note, including the due boundary', () => {
		const due = scheduled('Mixed.md', now.toISOString()).cards;
		const upcoming = scheduled('Mixed.md', '2026-07-20T10:00:00Z').cards;
		const broken = parseDeck('Mixed.md', '```ad-flashcard\n---\nid: bad\n---\nQ: q\nA: a\n```').cards;
		const deck = { path: 'Mixed.md', cards: [...due, ...fresh.cards, ...upcoming, ...broken] };
		const snapshot = JSON.stringify(deck);
		expect(buildOverview([deck], now)).toEqual([
			{ path: 'Mixed.md', due: 1, new: 1, upcoming: 1, error: 1, practiced: 2 },
		]);
		expect(JSON.stringify(deck)).toBe(snapshot);
	});

	it('aggregates cards in the same note and sorts decks by due, new, then path', () => {
		const two = { path: 'Two.md', cards: [...fresh.cards, ...fresh.cards] };
		const rows = buildOverview([
			fresh, two, scheduled('Due.md', now.toISOString()),
			scheduled('Z.md', '2026-07-20T10:00:00Z'),
			scheduled('A.md', '2026-07-20T10:00:00Z'),
		], now);
		expect(rows.map((row) => row.path)).toEqual(['Due.md', 'Two.md', 'New.md', 'A.md', 'Z.md']);
		expect(rows[1]!.new).toBe(2);
		expect(rows.filter((row) => row.due > 0)).toHaveLength(1);
	});

	it('omits empty notes and handles an empty vault', () => {
		expect(buildOverview([], now)).toEqual([]);
		expect(buildOverview([{ path: 'Empty.md', cards: [] }], now)).toEqual([]);
	});
});
