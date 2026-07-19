import { describe, it, expect } from 'vitest';
import { buildSession, isDue } from '../src/core/session';
import type { Card, CardMeta, Deck, Span } from '../src/core/card';

const NOW = new Date('2026-07-19T10:00:00.000Z');
const span: Span = { start: 0, end: 0 };

const meta = (over: Partial<CardMeta>): CardMeta => ({
	id: 'id',
	ease_factor: 2.5,
	interval: 1,
	repetitions: 1,
	last_practice: '2026-07-01T10:00:00Z',
	next_practice: '2026-07-01T10:00:00Z',
	last_20: [],
	...over,
});

const scheduled = (next: string, id = 'id'): Card => ({
	state: { kind: 'scheduled', question: id, answer: 'a', meta: meta({ id, next_practice: next }) },
	span,
	metaSpan: span,
});

const fresh = (q: string): Card => ({
	state: { kind: 'new', question: q, answer: 'a' },
	span,
	metaSpan: span,
});

const broken: Card = {
	state: { kind: 'error', reason: 'bad', raw: 'x' },
	span,
	metaSpan: span,
};

const deck = (cards: Card[]): Deck => ({ path: 'D.md', cards });

describe('isDue', () => {
	it('is true when next_practice <= now (inclusive), false otherwise', () => {
		expect(isDue(meta({ next_practice: '2026-07-19T10:00:00.000Z' }), NOW)).toBe(true);
		expect(isDue(meta({ next_practice: '2026-07-18T10:00:00Z' }), NOW)).toBe(true);
		expect(isDue(meta({ next_practice: '2026-07-20T10:00:00Z' }), NOW)).toBe(false);
	});
});

describe('buildSession', () => {
	it('includes due scheduled cards and all new cards, excludes not-due', () => {
		const d = deck([
			scheduled('2026-07-10T10:00:00Z', 'due-a'),
			scheduled('2026-08-01T10:00:00Z', 'not-due'),
			fresh('new-1'),
		]);
		const s = buildSession(d, NOW);
		const ids = s.queue.map((c) =>
			c.state.kind === 'scheduled' ? c.state.meta.id : c.state.question,
		);
		expect(ids).toContain('due-a');
		expect(ids).toContain('new-1');
		expect(ids).not.toContain('not-due');
	});

	it('orders due reviews (most overdue first) before new cards', () => {
		const d = deck([
			fresh('new-1'),
			scheduled('2026-07-15T10:00:00Z', 'due-late'),
			scheduled('2026-07-01T10:00:00Z', 'due-early'),
			fresh('new-2'),
		]);
		const s = buildSession(d, NOW);
		const labels = s.queue.map((c) =>
			c.state.kind === 'scheduled' ? c.state.meta.id : c.state.question,
		);
		expect(labels).toEqual(['due-early', 'due-late', 'new-1', 'new-2']);
	});

	it('separates error cards out of the practice queue', () => {
		const d = deck([broken, fresh('new-1')]);
		const s = buildSession(d, NOW);
		expect(s.errors).toHaveLength(1);
		expect(s.queue).toHaveLength(1);
		expect(s.queue[0].state.kind).toBe('new');
	});

	it('returns empty queue and errors for an empty deck', () => {
		const s = buildSession(deck([]), NOW);
		expect(s.queue).toEqual([]);
		expect(s.errors).toEqual([]);
	});
});
