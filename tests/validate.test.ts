import { describe, it, expect } from 'vitest';
import { validateMeta } from '../src/core/validate';

const good = {
	id: '3f8c1e42-9b6a-4d2e-8a11-6c0f7b1d9e55',
	ease_factor: 2.5,
	interval: 3,
	repetitions: 2,
	last_practice: '2026-07-19T10:00:00Z',
	next_practice: '2026-07-22T10:00:00Z',
	last_20: [{ rating: 'good', at: '2026-07-19T10:00:00Z' }],
};

describe('validateMeta', () => {
	it('accepts well-formed metadata and returns a normalized CardMeta', () => {
		const res = validateMeta(good);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.meta.id).toBe(good.id);
			expect(res.meta.ease_factor).toBe(2.5);
			expect(res.meta.last_20).toEqual([
				{ rating: 'good', at: '2026-07-19T10:00:00Z' },
			]);
		}
	});

	it('defaults last_20 to an empty array when absent', () => {
		const { last_20, ...rest } = good;
		void last_20;
		const res = validateMeta(rest);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.meta.last_20).toEqual([]);
	});

	it('defaults learning to null for pre-existing cards without the field', () => {
		const res = validateMeta(good);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.meta.learning).toBeNull();
	});

	it('accepts a valid learning state', () => {
		const res = validateMeta({ ...good, learning: { phase: 'relearning', step: 0 } });
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.meta.learning).toEqual({ phase: 'relearning', step: 0 });
	});

	it('rejects an unknown learning phase', () => {
		const res = validateMeta({ ...good, learning: { phase: 'cramming', step: 0 } });
		expect(res.ok).toBe(false);
	});

	it('strips unknown keys but still validates (forward-compatible)', () => {
		const res = validateMeta({ ...good, future_field: 42 });
		expect(res.ok).toBe(true);
		if (res.ok) expect('future_field' in res.meta).toBe(false);
	});

	it('rejects a missing id', () => {
		const { id, ...rest } = good;
		void id;
		const res = validateMeta(rest);
		expect(res.ok).toBe(false);
	});

	it('rejects a non-ISO timestamp', () => {
		const res = validateMeta({ ...good, next_practice: 'not-a-date' });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.reason).toMatch(/next_practice/);
	});

	it('rejects a malformed last_20 event (bad rating)', () => {
		const res = validateMeta({
			...good,
			last_20: [{ rating: 'meh', at: '2026-07-19T10:00:00Z' }],
		});
		expect(res.ok).toBe(false);
	});

	it('rejects a negative interval and non-integer repetitions', () => {
		expect(validateMeta({ ...good, interval: -1 }).ok).toBe(false);
		expect(validateMeta({ ...good, repetitions: 1.5 }).ok).toBe(false);
	});

	it('rejects a non-object input', () => {
		expect(validateMeta(null).ok).toBe(false);
		expect(validateMeta('nope').ok).toBe(false);
	});
});
