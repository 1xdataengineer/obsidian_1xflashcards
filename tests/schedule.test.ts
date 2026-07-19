import { describe, it, expect } from 'vitest';
import { schedule } from '../src/core/schedule';
import type { CardMeta, PracticeEvent } from '../src/core/card';

const NOW = new Date('2026-07-19T10:00:00.000Z');
const ONE_DAY = 86_400_000;
const ONE_MIN = 60_000;

const daysAfter = (n: number): string =>
	new Date(NOW.getTime() + n * ONE_DAY).toISOString();
const minutesAfter = (n: number): string =>
	new Date(NOW.getTime() + n * ONE_MIN).toISOString();

// Drive a card all the way to a graduated review card (learning === null).
const graduate = (): CardMeta => {
	const s1 = schedule(null, 'good', NOW, 'ID'); // learning step 1 (10m)
	return schedule(s1, 'good', NOW, 'ignored'); // graduates: reps 1, interval 1
};

describe('schedule — new card enters learning steps', () => {
	it("'good' advances to the 10m learning step without graduating", () => {
		const m = schedule(null, 'good', NOW, 'FRESH-ID');
		expect(m.id).toBe('FRESH-ID');
		expect(m.learning).toEqual({ phase: 'learning', step: 1 });
		expect(m.repetitions).toBe(0);
		expect(m.interval).toBe(0);
		expect(m.next_practice).toBe(minutesAfter(10));
		expect(m.last_20).toEqual([{ rating: 'good', at: NOW.toISOString() }]);
	});

	it("'again' shows the card again in 1 minute (step 0)", () => {
		const m = schedule(null, 'again', NOW, 'ID');
		expect(m.learning).toEqual({ phase: 'learning', step: 0 });
		expect(m.next_practice).toBe(minutesAfter(1));
	});

	it("'hard' repeats the current step (1 minute for a new card)", () => {
		const m = schedule(null, 'hard', NOW, 'ID');
		expect(m.learning).toEqual({ phase: 'learning', step: 0 });
		expect(m.next_practice).toBe(minutesAfter(1));
	});

	it("'easy' graduates immediately to the 4-day interval", () => {
		const m = schedule(null, 'easy', NOW, 'ID');
		expect(m.learning).toBeNull();
		expect(m.repetitions).toBe(1);
		expect(m.interval).toBe(4);
		expect(m.next_practice).toBe(daysAfter(4));
	});
});

describe('schedule — graduating from learning', () => {
	it("'good' on the last learning step graduates to a 1-day review", () => {
		const step1 = schedule(null, 'good', NOW, 'ID'); // step 1 (10m)
		const grad = schedule(step1, 'good', NOW, 'ignored');
		expect(grad.learning).toBeNull();
		expect(grad.repetitions).toBe(1);
		expect(grad.interval).toBe(1);
		expect(grad.next_practice).toBe(daysAfter(1));
	});
});

describe('schedule — SM-2 interval progression on graduated cards', () => {
	const good1 = graduate(); // reps 1, interval 1
	const good2 = schedule(good1, 'good', NOW, 'ignored');
	const good3 = schedule(good2, 'good', NOW, 'ignored');

	it('goes 1 → 6 → round(interval * EF) once in review', () => {
		expect(good1.interval).toBe(1);
		expect(good2.interval).toBe(6);
		expect(good2.repetitions).toBe(2);
		// EF stays 2.5 for 'good', so third interval = round(6 * 2.5) = 15
		expect(good3.interval).toBe(15);
		expect(good3.repetitions).toBe(3);
	});

	it('preserves the existing id and ignores freshId once created', () => {
		expect(good2.id).toBe('ID');
	});
});

describe('schedule — ease factor updates on review cards', () => {
	const base = graduate(); // review card, EF 2.5

	it("'easy' raises EF, 'good' holds it, 'hard' lowers it", () => {
		expect(schedule(base, 'easy', NOW, 'x').ease_factor).toBe(2.6);
		expect(schedule(base, 'good', NOW, 'x').ease_factor).toBe(2.5);
		expect(schedule(base, 'hard', NOW, 'x').ease_factor).toBe(2.36);
	});

	it('never drops EF below the 1.3 floor on a lapse', () => {
		const low: CardMeta = { ...base, ease_factor: 1.3 };
		expect(schedule(low, 'again', NOW, 'x').ease_factor).toBe(1.3);
	});

	it('leaves EF untouched while a card is still in learning steps', () => {
		const step1 = schedule(null, 'good', NOW, 'ID');
		expect(schedule(step1, 'hard', NOW, 'x').ease_factor).toBe(2.5);
	});
});

describe('schedule — lapse sends a review card into relearning', () => {
	const mature: CardMeta = { ...graduate(), interval: 30, repetitions: 5 };

	it('drops to relearning step 0, shown again in 10 minutes', () => {
		const lapsed = schedule(mature, 'again', NOW, 'x');
		expect(lapsed.learning).toEqual({ phase: 'relearning', step: 0 });
		expect(lapsed.repetitions).toBe(0);
		expect(lapsed.interval).toBe(1); // reduced from 30 to the 1-day minimum
		expect(lapsed.next_practice).toBe(minutesAfter(10));
	});

	it("graduates back to review on the next 'good'", () => {
		const lapsed = schedule(mature, 'again', NOW, 'x');
		const back = schedule(lapsed, 'good', NOW, 'x');
		expect(back.learning).toBeNull();
		expect(back.repetitions).toBe(1);
		expect(back.interval).toBe(1);
		expect(back.next_practice).toBe(daysAfter(1));
	});

	it("relearning 'again' restarts the relearning step", () => {
		const lapsed = schedule(mature, 'again', NOW, 'x');
		const again = schedule(lapsed, 'again', NOW, 'x');
		expect(again.learning).toEqual({ phase: 'relearning', step: 0 });
		expect(again.next_practice).toBe(minutesAfter(10));
	});
});

describe('schedule — history (last_20)', () => {
	it('appends the newest event last and caps at 20', () => {
		const events: PracticeEvent[] = Array.from({ length: 20 }, (_, i) => ({
			rating: 'good' as const,
			at: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
		}));
		const prev: CardMeta = { ...graduate(), last_20: events };
		const next = schedule(prev, 'easy', NOW, 'x');
		expect(next.last_20).toHaveLength(20);
		expect(next.last_20[19]).toEqual({ rating: 'easy', at: NOW.toISOString() });
		// oldest was dropped
		expect(next.last_20[0].at).toBe('2026-06-02T10:00:00.000Z');
	});
});

describe('schedule — purity/determinism', () => {
	it('does not mutate the input and is deterministic', () => {
		const prev = graduate();
		const snapshot = JSON.parse(JSON.stringify(prev));
		const a = schedule(prev, 'good', NOW, 'x');
		const b = schedule(prev, 'good', NOW, 'x');
		expect(prev).toEqual(snapshot); // unchanged
		expect(a).toEqual(b); // deterministic
	});
});
