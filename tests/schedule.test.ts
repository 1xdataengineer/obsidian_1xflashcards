import { describe, it, expect } from 'vitest';
import { schedule } from '../src/core/schedule';
import type { CardMeta, PracticeEvent } from '../src/core/card';

const NOW = new Date('2026-07-19T10:00:00.000Z');
const ONE_DAY = 86_400_000;

const daysAfter = (n: number): string =>
	new Date(NOW.getTime() + n * ONE_DAY).toISOString();

describe('schedule — first-time (new) card', () => {
	it("assigns freshId, reps=1, interval=1 on the first 'good'", () => {
		const m = schedule(null, 'good', NOW, 'FRESH-ID');
		expect(m.id).toBe('FRESH-ID');
		expect(m.repetitions).toBe(1);
		expect(m.interval).toBe(1);
		expect(m.ease_factor).toBe(2.5);
		expect(m.last_practice).toBe(NOW.toISOString());
		expect(m.next_practice).toBe(daysAfter(1));
		expect(m.last_20).toEqual([{ rating: 'good', at: NOW.toISOString() }]);
	});
});

describe('schedule — SM-2 interval progression on repeated passes', () => {
	const good1 = schedule(null, 'good', NOW, 'ID');
	const good2 = schedule(good1, 'good', NOW, 'ignored');
	const good3 = schedule(good2, 'good', NOW, 'ignored');

	it('goes 1 → 6 → round(interval * EF)', () => {
		expect(good1.interval).toBe(1);
		expect(good2.interval).toBe(6);
		expect(good2.repetitions).toBe(2);
		// EF stays 2.5 for 'good', so third interval = round(6 * 2.5) = 15
		expect(good3.interval).toBe(15);
		expect(good3.repetitions).toBe(3);
	});

	it('preserves the existing id and ignores freshId when prev exists', () => {
		expect(good2.id).toBe('ID');
	});
});

describe('schedule — ease factor updates per rating', () => {
	const base = schedule(null, 'good', NOW, 'ID'); // EF 2.5

	it("'easy' raises EF, 'good' holds it, 'hard' lowers it", () => {
		expect(schedule(base, 'easy', NOW, 'x').ease_factor).toBe(2.6);
		expect(schedule(base, 'good', NOW, 'x').ease_factor).toBe(2.5);
		expect(schedule(base, 'hard', NOW, 'x').ease_factor).toBe(2.36);
	});

	it('never drops EF below the 1.3 floor', () => {
		const low: CardMeta = { ...base, ease_factor: 1.3 };
		expect(schedule(low, 'again', NOW, 'x').ease_factor).toBe(1.3);
	});
});

describe('schedule — lapse on again', () => {
	it('resets repetitions to 0 and interval to 1', () => {
		const mature: CardMeta = {
			...schedule(null, 'good', NOW, 'ID'),
			interval: 30,
			repetitions: 5,
		};
		const lapsed = schedule(mature, 'again', NOW, 'x');
		expect(lapsed.repetitions).toBe(0);
		expect(lapsed.interval).toBe(1);
		expect(lapsed.next_practice).toBe(daysAfter(1));
	});
});

describe('schedule — history (last_20)', () => {
	it('appends the newest event last and caps at 20', () => {
		const events: PracticeEvent[] = Array.from({ length: 20 }, (_, i) => ({
			rating: 'good' as const,
			at: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
		}));
		const prev: CardMeta = { ...schedule(null, 'good', NOW, 'ID'), last_20: events };
		const next = schedule(prev, 'easy', NOW, 'x');
		expect(next.last_20).toHaveLength(20);
		expect(next.last_20[19]).toEqual({ rating: 'easy', at: NOW.toISOString() });
		// oldest was dropped
		expect(next.last_20[0].at).toBe('2026-06-02T10:00:00.000Z');
	});
});

describe('schedule — purity/determinism', () => {
	it('does not mutate the input and is deterministic', () => {
		const prev = schedule(null, 'good', NOW, 'ID');
		const snapshot = JSON.parse(JSON.stringify(prev));
		const a = schedule(prev, 'good', NOW, 'x');
		const b = schedule(prev, 'good', NOW, 'x');
		expect(prev).toEqual(snapshot); // unchanged
		expect(a).toEqual(b); // deterministic
	});
});
