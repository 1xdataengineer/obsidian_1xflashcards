import { z } from 'zod';
import type { CardMeta } from './card';

const isoTimestamp = z
	.string()
	.refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 timestamp');

const ratingSchema = z.enum(['again', 'hard', 'good', 'easy']);

const practiceEventSchema = z
	.object({
		rating: ratingSchema,
		at: isoTimestamp,
	})
	.strip();

const learningSchema = z
	.object({
		phase: z.enum(['learning', 'relearning']),
		step: z.number().int().min(0),
	})
	.strip();

// Lenient about unknown top-level keys (`.strip()`), so future fields never turn a
// card into an `error`. Strict about the fields we own. `learning` defaults to null
// so cards authored before short-term steps existed validate as review cards.
const cardMetaSchema = z
	.object({
		id: z.string().min(1),
		ease_factor: z.number().positive(),
		interval: z.number().min(0),
		repetitions: z.number().int().min(0),
		learning: learningSchema.nullable().default(null),
		last_practice: isoTimestamp,
		next_practice: isoTimestamp,
		last_20: z.array(practiceEventSchema).default([]),
	})
	.strip();

export type ValidationResult =
	| { readonly ok: true; readonly meta: CardMeta }
	| { readonly ok: false; readonly reason: string };

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join('.');
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join('; ');
}

/**
 * Validate a plain object (typically the result of YAML-parsing a card's
 * frontmatter) against the CardMeta schema. Pure: no I/O, no mutation.
 */
export function validateMeta(raw: unknown): ValidationResult {
	const parsed = cardMetaSchema.safeParse(raw);
	if (parsed.success) {
		return { ok: true, meta: parsed.data };
	}
	return { ok: false, reason: formatIssues(parsed.error) };
}
