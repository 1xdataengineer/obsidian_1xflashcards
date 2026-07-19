import type { CardMeta, LearningState, PracticeEvent, Rating } from './card';

// SM-2 tuning constants.
const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;
const HISTORY_CAP = 20;
const MS_PER_DAY = 86_400_000;
const MS_PER_MIN = 60_000;

// Anki-style short-term steps, in minutes. A card in one of these phases is re-shown
// within the same session instead of being scheduled a full day out.
const LEARNING_STEPS_MIN = [1, 10]; // new cards
const RELEARNING_STEPS_MIN = [10]; // graduated cards that lapsed

// Graduating intervals, in days.
const GRADUATING_INTERVAL = 1; // `good` graduates a learning/relearning card
const EASY_INTERVAL = 4; // `easy` graduates a new/learning card immediately
// Fraction of the pre-lapse interval kept when a review card lapses (Anki's "new
// interval" default is 0%, i.e. the card effectively restarts at the 1-day minimum).
const LAPSE_INTERVAL_MULT = 0;

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

const addMinutes = (from: Date, minutes: number): Date =>
	new Date(from.getTime() + minutes * MS_PER_MIN);

// The mutable bookkeeping a single transition produces; the id and history are added
// back by `schedule` so each phase handler stays focused on the schedule itself.
interface Transition {
	readonly ease_factor: number;
	readonly interval: number;
	readonly repetitions: number;
	readonly learning: LearningState | null;
	readonly next: Date;
}

/**
 * SM-2 with Anki-style learning/relearning steps, as a pure `state -> state`
 * transition. New cards and lapsed cards move through short (minutes-apart) steps
 * before graduating to day-scale review intervals; graduated cards follow classic
 * SM-2. A card whose result has a non-null `learning` is meant to be re-shown in the
 * same session (see PracticeView).
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
	const t = transition(prev, rating, now);

	const at = now.toISOString();
	const event: PracticeEvent = { rating, at };
	const last_20 = [...(prev?.last_20 ?? []), event].slice(-HISTORY_CAP);

	return {
		id: prev?.id ?? freshId,
		ease_factor: t.ease_factor,
		interval: t.interval,
		repetitions: t.repetitions,
		learning: t.learning,
		last_practice: at,
		next_practice: t.next.toISOString(),
		last_20,
	};
}

function transition(prev: CardMeta | null, rating: Rating, now: Date): Transition {
	const phase = prev?.learning?.phase;
	// A brand-new card is treated as a learning card sitting at step 0.
	if (prev === null || phase === 'learning') {
		return learningStep(prev, rating, now);
	}
	if (phase === 'relearning') {
		return relearningStep(prev, rating, now);
	}
	return reviewStep(prev, rating, now);
}

/** New or learning card working through LEARNING_STEPS_MIN. EF is untouched here. */
function learningStep(prev: CardMeta | null, rating: Rating, now: Date): Transition {
	const ease_factor = prev?.ease_factor ?? DEFAULT_EF;
	const step = prev?.learning?.step ?? 0;

	if (rating === 'easy') {
		return graduate(ease_factor, EASY_INTERVAL, now);
	}
	if (rating === 'good') {
		const nextStep = step + 1;
		if (nextStep >= LEARNING_STEPS_MIN.length) {
			return graduate(ease_factor, GRADUATING_INTERVAL, now);
		}
		return atStep(ease_factor, 'learning', nextStep, LEARNING_STEPS_MIN, now);
	}
	// `again` restarts at step 0; `hard` repeats the current step.
	const target = rating === 'again' ? 0 : step;
	return atStep(ease_factor, 'learning', target, LEARNING_STEPS_MIN, now);
}

/** Lapsed review card relearning through RELEARNING_STEPS_MIN, back toward review. */
function relearningStep(prev: CardMeta, rating: Rating, now: Date): Transition {
	const ease_factor = prev.ease_factor;
	const step = prev.learning?.step ?? 0;

	if (rating === 'good' || rating === 'easy') {
		// Graduate back to review at the reduced interval fixed when the card lapsed.
		return graduate(ease_factor, Math.max(1, prev.interval), now);
	}
	const target = rating === 'again' ? 0 : step;
	return atStep(ease_factor, 'relearning', target, RELEARNING_STEPS_MIN, now);
}

/** Classic SM-2 for a graduated review card; `again` sends it into relearning. */
function reviewStep(prev: CardMeta, rating: Rating, now: Date): Transition {
	const q = QUALITY[rating];
	const ease_factor = round2(
		Math.max(MIN_EF, prev.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))),
	);

	if (rating === 'again') {
		const interval = Math.max(1, Math.round(prev.interval * LAPSE_INTERVAL_MULT));
		return {
			ease_factor,
			interval,
			repetitions: 0,
			learning: { phase: 'relearning', step: 0 },
			next: addMinutes(now, RELEARNING_STEPS_MIN[0] ?? 10),
		};
	}

	const repetitions = prev.repetitions + 1;
	const interval =
		repetitions === 1
			? 1
			: repetitions === 2
				? 6
				: Math.max(1, Math.round(prev.interval * ease_factor));

	return { ease_factor, interval, repetitions, learning: null, next: addDays(now, interval) };
}

/** Settle a short-term step: schedule minutes out, staying in the given phase. */
function atStep(
	ease_factor: number,
	phase: LearningState['phase'],
	step: number,
	steps: readonly number[],
	now: Date,
): Transition {
	return {
		ease_factor,
		interval: 0,
		repetitions: 0,
		learning: { phase, step },
		next: addMinutes(now, steps[step] ?? 0),
	};
}

/** Leave the short-term steps for day-scale review at `interval` days. */
function graduate(ease_factor: number, interval: number, now: Date): Transition {
	return {
		ease_factor,
		interval,
		repetitions: 1,
		learning: null,
		next: addDays(now, interval),
	};
}
