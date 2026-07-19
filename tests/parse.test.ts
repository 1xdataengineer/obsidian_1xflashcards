import { describe, it, expect } from 'vitest';
import { parseDeck } from '../src/core/parse';
import type { Card } from '../src/core/card';

const FENCE = '```';

/** Build a deck file from raw line arrays, joined with newlines. */
const file = (...lines: string[]): string => lines.join('\n');

const newCard = file(
	`${FENCE}ad-flashcard`,
	'Question:',
	'What is the capital of France?',
	'Answer:',
	'Paris',
	FENCE,
);

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

describe('parseDeck', () => {
	it('detects a new (clean-slate) card with no frontmatter', () => {
		const deck = parseDeck('Deck.md', newCard);
		expect(deck.cards).toHaveLength(1);
		const state = deck.cards[0].state;
		expect(state.kind).toBe('new');
		if (state.kind === 'new') {
			expect(state.question).toBe('What is the capital of France?');
			expect(state.answer).toBe('Paris');
		}
	});

	it('new-card metaSpan is a zero-length insertion point after the opening fence', () => {
		const deck = parseDeck('Deck.md', newCard);
		const card = deck.cards[0];
		expect(card.metaSpan.start).toBe(card.metaSpan.end);
		// inserting here must sit right before the body ("Question:")
		expect(newCard.slice(card.metaSpan.end)).toMatch(/^Question:/);
	});

	it('detects and validates a scheduled card', () => {
		const deck = parseDeck('Deck.md', scheduledCard);
		const state = deck.cards[0].state;
		expect(state.kind).toBe('scheduled');
		if (state.kind === 'scheduled') {
			expect(state.meta.id).toBe('3f8c1e42-9b6a-4d2e-8a11-6c0f7b1d9e55');
			expect(state.meta.ease_factor).toBe(2.5);
			expect(state.meta.repetitions).toBe(2);
			expect(state.meta.last_20).toEqual([
				{ rating: 'good', at: '2026-07-19T10:00:00Z' },
			]);
			expect(state.question).toBe('2 + 2?');
			expect(state.answer).toBe('4');
		}
	});

	it('scheduled-card metaSpan covers exactly the --- frontmatter block', () => {
		const deck = parseDeck('Deck.md', scheduledCard);
		const { metaSpan } = deck.cards[0];
		const region = scheduledCard.slice(metaSpan.start, metaSpan.end);
		expect(region.startsWith('---\n')).toBe(true);
		expect(region.trimEnd().endsWith('---')).toBe(true);
		// body is preserved to the right of metaSpan
		expect(scheduledCard.slice(metaSpan.end)).toMatch(/^Question:/);
	});

	it('flags frontmatter that fails schema validation as an error card', () => {
		const bad = scheduledCard.replace(
			'next_practice: 2026-07-22T10:00:00Z',
			'next_practice: not-a-date',
		);
		const state = parseDeck('Deck.md', bad).cards[0].state;
		expect(state.kind).toBe('error');
		if (state.kind === 'error') expect(state.reason).toMatch(/next_practice/);
	});

	it('flags unterminated frontmatter as an error card', () => {
		const bad = file(
			`${FENCE}ad-flashcard`,
			'---',
			'id: abc',
			'Question:',
			'no closing fence for frontmatter',
			FENCE,
		);
		expect(parseDeck('Deck.md', bad).cards[0].state.kind).toBe('error');
	});

	it('flags invalid YAML as an error card', () => {
		const bad = file(
			`${FENCE}ad-flashcard`,
			'---',
			'id: "unterminated',
			'---',
			'Question:',
			'q',
			'Answer:',
			'a',
			FENCE,
		);
		expect(parseDeck('Deck.md', bad).cards[0].state.kind).toBe('error');
	});

	it('parses multiple blocks and ignores non-flashcard fences', () => {
		const text = file(
			'# My deck',
			'',
			'```js',
			'const x = 1; // not a flashcard',
			'```',
			'',
			newCard,
			'',
			'some prose',
			'',
			scheduledCard,
		);
		const deck = parseDeck('Deck.md', text);
		expect(deck.cards).toHaveLength(2);
		expect(deck.cards.map((c: Card) => c.state.kind)).toEqual([
			'new',
			'scheduled',
		]);
	});

	it('supports multi-line question and answer bodies', () => {
		const text = file(
			`${FENCE}ad-flashcard`,
			'Question:',
			'Line one',
			'Line two',
			'Answer:',
			'Ans one',
			'Ans two',
			FENCE,
		);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe('Line one\nLine two');
			expect(state.answer).toBe('Ans one\nAns two');
		} else {
			throw new Error('expected new card');
		}
	});

	it('supports ~~~ fences', () => {
		const text = file(
			'~~~ad-flashcard',
			'Question:',
			'q',
			'Answer:',
			'a',
			'~~~',
		);
		expect(parseDeck('Deck.md', text).cards).toHaveLength(1);
	});

	it('returns an empty deck for a file with no flashcard blocks', () => {
		expect(parseDeck('Deck.md', '# Just a note\n\nNo cards here.').cards).toEqual(
			[],
		);
	});

	it('skips an ad-flashcard block whose code fence is never closed', () => {
		const text = file(
			`${FENCE}ad-flashcard`,
			'Question:',
			'no closing fence at all',
		);
		expect(parseDeck('Deck.md', text).cards).toEqual([]);
	});

	it('treats a body with no markers as the question, empty answer', () => {
		const text = file(`${FENCE}ad-flashcard`, 'Just a bare prompt', FENCE);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe('Just a bare prompt');
			expect(state.answer).toBe('');
		} else {
			throw new Error('expected new card');
		}
	});

	it('handles an Answer-only body (no Question marker)', () => {
		const text = file(`${FENCE}ad-flashcard`, 'Answer:', 'just the answer', FENCE);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe('');
			expect(state.answer).toBe('just the answer');
		} else {
			throw new Error('expected new card');
		}
	});

	it('recognizes the Q:/A: shorthand markers', () => {
		const text = file(
			`${FENCE}ad-flashcard`,
			'Q: What is the capital of France?',
			'A: Paris',
			FENCE,
		);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe('What is the capital of France?');
			expect(state.answer).toBe('Paris');
		} else {
			throw new Error('expected new card');
		}
	});

	it('recognizes bold **Q:**/**A:** markers (issue #2)', () => {
		const text = file(
			`${FENCE}ad-flashcard`,
			'**Q:** What 5 type of events does the book explain?',
			'',
			'**A:** State, Delta, Hybrid, Measurement and Notification events.',
			FENCE,
		);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe(
				'What 5 type of events does the book explain?',
			);
			expect(state.answer).toBe(
				'State, Delta, Hybrid, Measurement and Notification events.',
			);
		} else {
			throw new Error('expected new card');
		}
	});

	it('recognizes bold **Question:**/**Answer:** markers', () => {
		const text = file(
			`${FENCE}ad-flashcard`,
			'**Question:** 2 + 2?',
			'**Answer:** 4',
			FENCE,
		);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe('2 + 2?');
			expect(state.answer).toBe('4');
		} else {
			throw new Error('expected new card');
		}
	});

	it('is case-insensitive and strips a lone question marker', () => {
		const text = file(`${FENCE}ad-flashcard`, 'q: bare prompt', FENCE);
		const state = parseDeck('Deck.md', text).cards[0].state;
		if (state.kind === 'new') {
			expect(state.question).toBe('bare prompt');
			expect(state.answer).toBe('');
		} else {
			throw new Error('expected new card');
		}
	});
});
