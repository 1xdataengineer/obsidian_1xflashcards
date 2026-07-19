import { describe, it, expect } from 'vitest';
import { parseDeck } from '../src/core/parse';
import { schedule } from '../src/core/schedule';
import { applyDeckUpdate } from '../src/core/serialize';
import { buildSession } from '../src/core/session';
import type { CardMeta } from '../src/core/card';

const FENCE = '```';
const file = (...lines: string[]): string => lines.join('\n');

// Simulate what the shell does per rating: parse, find card, schedule, write back.
function review(
	text: string,
	cardIndex: number,
	rating: 'again' | 'hard' | 'good' | 'easy',
	now: Date,
	freshId: string,
): { text: string; meta: CardMeta } {
	const deck = parseDeck('D.md', text);
	const card = deck.cards[cardIndex];
	if (!card || card.state.kind === 'error') throw new Error('no schedulable card');
	const prev = card.state.kind === 'scheduled' ? card.state.meta : null;
	const meta = schedule(prev, rating, now, freshId);
	return { text: applyDeckUpdate(text, card, meta), meta };
}

describe('full core pipeline: parse → schedule → write-back → re-parse', () => {
	it('takes a new card through two reviews, persisting id and SM-2 state', () => {
		const original = file(
			'# Geography',
			'',
			`${FENCE}ad-flashcard`,
			'Question:',
			'Capital of France?',
			'Answer:',
			'Paris',
			FENCE,
		);

		// First review: new card, rated good.
		const now1 = new Date('2026-07-19T10:00:00.000Z');
		const first = review(original, 0, 'good', now1, 'ID-123');
		expect(first.meta.id).toBe('ID-123');
		expect(first.meta.interval).toBe(1);

		// Re-parse: the card is now scheduled and body is intact.
		const afterFirst = parseDeck('D.md', first.text).cards[0].state;
		expect(afterFirst.kind).toBe('scheduled');
		if (afterFirst.kind === 'scheduled') {
			expect(afterFirst.question).toBe('Capital of France?');
			expect(afterFirst.answer).toBe('Paris');
		}

		// Second review a week later, rated good again → interval 6, same id.
		const now2 = new Date('2026-07-26T10:00:00.000Z');
		const second = review(first.text, 0, 'good', now2, 'IGNORED');
		expect(second.meta.id).toBe('ID-123');
		expect(second.meta.interval).toBe(6);
		expect(second.meta.repetitions).toBe(2);
		expect(second.meta.last_20).toHaveLength(2);

		// The note prose survived both writes.
		expect(second.text.startsWith('# Geography')).toBe(true);
	});

	it('a freshly-scheduled card drops out of the due queue until next_practice', () => {
		const text = file(`${FENCE}ad-flashcard`, 'Question:', 'q', 'Answer:', 'a', FENCE);
		const now = new Date('2026-07-19T10:00:00.000Z');
		const reviewed = review(text, 0, 'good', now, 'ID').text;

		const deck = parseDeck('D.md', reviewed);
		// Same day: not due yet (next_practice is tomorrow).
		expect(buildSession(deck, now).queue).toHaveLength(0);
		// Two days later: due again.
		const later = new Date('2026-07-21T10:00:00.000Z');
		expect(buildSession(deck, later).queue).toHaveLength(1);
	});
});
