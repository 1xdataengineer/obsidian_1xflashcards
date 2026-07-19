import { describe, it, expect } from 'vitest';
import { serializeFrontmatter, applyDeckUpdate } from '../src/core/serialize';
import { parseDeck } from '../src/core/parse';
import type { CardMeta } from '../src/core/card';

const FENCE = '```';
const file = (...lines: string[]): string => lines.join('\n');

const meta: CardMeta = {
	id: '3f8c1e42-9b6a-4d2e-8a11-6c0f7b1d9e55',
	ease_factor: 2.5,
	interval: 6,
	repetitions: 3,
	last_practice: '2026-07-19T10:00:00Z',
	next_practice: '2026-07-25T10:00:00Z',
	last_20: [
		{ rating: 'good', at: '2026-07-13T10:00:00Z' },
		{ rating: 'easy', at: '2026-07-19T10:00:00Z' },
	],
};

const scheduledCard = file(
	`${FENCE}ad-flashcard`,
	'---',
	'id: 3f8c1e42-9b6a-4d2e-8a11-6c0f7b1d9e55',
	'ease_factor: 2.5',
	'interval: 3',
	'repetitions: 2',
	'last_practice: 2026-07-19T10:00:00Z',
	'next_practice: 2026-07-22T10:00:00Z',
	'last_20:',
	'  - { rating: good, at: 2026-07-19T10:00:00Z }',
	'---',
	'Question:',
	'2 + 2?',
	'Answer:',
	'4',
	FENCE,
);

const newCard = file(
	`${FENCE}ad-flashcard`,
	'Question:',
	'What is the capital of France?',
	'Answer:',
	'Paris',
	FENCE,
);

describe('serializeFrontmatter', () => {
	it('emits a --- fenced block that re-parses to the same meta', () => {
		const fm = serializeFrontmatter(meta);
		expect(fm.startsWith('---\n')).toBe(true);
		expect(fm.endsWith('---\n')).toBe(true);
		// round-trip through the parser by wrapping in a block
		const wrapped = `${FENCE}ad-flashcard\n${fm}Question:\nq\nAnswer:\na\n${FENCE}`;
		const state = parseDeck('D.md', wrapped).cards[0].state;
		expect(state.kind).toBe('scheduled');
		if (state.kind === 'scheduled') expect(state.meta).toEqual(meta);
	});

	it('serializes an empty history as an empty list', () => {
		const fm = serializeFrontmatter({ ...meta, last_20: [] });
		expect(fm).toMatch(/last_20: \[\]/);
	});
});

describe('applyDeckUpdate', () => {
	it('replaces a scheduled card frontmatter, preserving the Q/A body byte-for-byte', () => {
		const card = parseDeck('D.md', scheduledCard).cards[0];
		const body = scheduledCard.slice(card.metaSpan.end);
		const next = applyDeckUpdate(scheduledCard, card, meta);
		// body after the frontmatter is untouched
		expect(next.endsWith(body)).toBe(true);
		// and the new meta round-trips
		const state = parseDeck('D.md', next).cards[0].state;
		if (state.kind === 'scheduled') expect(state.meta).toEqual(meta);
		else throw new Error('expected scheduled');
	});

	it('inserts frontmatter into a new card without touching its body', () => {
		const card = parseDeck('D.md', newCard).cards[0];
		const next = applyDeckUpdate(newCard, card, meta);
		const reparsed = parseDeck('D.md', next).cards[0].state;
		expect(reparsed.kind).toBe('scheduled');
		if (reparsed.kind === 'scheduled') {
			expect(reparsed.meta).toEqual(meta);
			expect(reparsed.question).toBe('What is the capital of France?');
			expect(reparsed.answer).toBe('Paris');
		}
		// everything before the block and the body text is preserved
		expect(next).toContain('What is the capital of France?');
	});

	it('is a pure splice: only the metaSpan region changes', () => {
		const card = parseDeck('D.md', scheduledCard).cards[0];
		const next = applyDeckUpdate(scheduledCard, card, meta);
		expect(next.slice(0, card.metaSpan.start)).toBe(
			scheduledCard.slice(0, card.metaSpan.start),
		);
	});

	it('leaves neighbouring cards intact when updating one', () => {
		const two = `${newCard}\n\n${scheduledCard}`;
		const deck = parseDeck('D.md', two);
		const next = applyDeckUpdate(two, deck.cards[0], meta);
		// second card still parses as scheduled with its original id/interval
		const second = parseDeck('D.md', next).cards[1].state;
		if (second.kind === 'scheduled') {
			expect(second.meta.interval).toBe(3);
		} else {
			throw new Error('neighbour was disturbed');
		}
	});
});
