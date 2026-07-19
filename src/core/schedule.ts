import type { CardMeta, PracticeEvent, Rating } from './card';

// SM-2 tuning constants.
const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;
const HISTORY_CAP = 20;
const MS_PER_DAY = 86_400_000;

// Rating → SM-2 quality score (0–5). `hard` is a pass whose EF drops (Q2).
const QUALITY: Record<Rating, number> = {
	again: 1,
	hard: 3,
	good: 4,
	easy: 5,
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const addDays = (from: Date, days: number): Date =>
	new Date(from.getTime() + days * MS_PER_DAY);

/**
 * Classic SM-2 as a pure `state -> state` transition.
 *
 * `freshId` is used only when `prev` is null (a `new` card scheduled for the first
 * time); the id is generated in the shell (crypto.randomUUID) so this stays pure and
 * deterministic. When `prev` exists, `prev.id` is preserved and `freshId` is ignored.
 */
export function schedule(
	prev: CardMeta | null,
	rating: Rating,
	now: Date,
	freshId: string,
): CardMeta {
	const q = QUALITY[rating];
	const prevEf = prev?.ease_factor ?? DEFAULT_EF;
	const prevInterval = prev?.interval ?? 0;
	const prevReps = prev?.repetitions ?? 0;

	const ease_factor = round2(
		Math.max(MIN_EF, prevEf + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))),
	);

	const { repetitions, interval } = nextSchedule(q, prevReps, prevInterval, ease_factor);

	const at = now.toISOString();
	const event: PracticeEvent = { rating, at };
	const last_20 = [...(prev?.last_20 ?? []), event].slice(-HISTORY_CAP);

	return {
		id: prev?.id ?? freshId,
		ease_factor,
		interval,
		repetitions,
		last_practice: at,
		next_practice: addDays(now, interval).toISOString(),
		last_20,
	};
}

function nextSchedule(
	q: number,
	prevReps: number,
	prevInterval: number,
	ef: number,
): { repetitions: number; interval: number } {
	if (q < 3) {
		// Lapse: relearn from the start.
		return { repetitions: 0, interval: 1 };
	}
	const repetitions = prevReps + 1;
	if (repetitions === 1) return { repetitions, interval: 1 };
	if (repetitions === 2) return { repetitions, interval: 6 };
	return { repetitions, interval: Math.max(1, Math.round(prevInterval * ef)) };
}
