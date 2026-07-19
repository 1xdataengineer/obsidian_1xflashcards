import type { Card, CardMeta, PracticeEvent } from './card';

/**
 * Render a CardMeta as the `---`…`---` frontmatter block (with a trailing newline),
 * ready to splice into a card's metaSpan. Pure. Field order is fixed for stable,
 * diff-friendly output; the Q/A body is never produced here.
 */
export function serializeFrontmatter(meta: CardMeta): string {
	const lines = [
		'---',
		`id: ${meta.id}`,
		`ease_factor: ${meta.ease_factor}`,
		`interval: ${meta.interval}`,
		`repetitions: ${meta.repetitions}`,
		`last_practice: ${meta.last_practice}`,
		`next_practice: ${meta.next_practice}`,
		serializeHistory(meta.last_20),
		'---',
		'',
	];
	return lines.join('\n');
}

function serializeHistory(events: readonly PracticeEvent[]): string {
	if (events.length === 0) return 'last_20: []';
	const rows = events.map(
		(e) => `  - { rating: ${e.rating}, at: ${e.at} }`,
	);
	return ['last_20:', ...rows].join('\n');
}

/**
 * Return a new file text with `card`'s metadata region replaced by the serialized
 * frontmatter for `meta`. A pure immutable splice (slice + concat) — the question/
 * answer body and every other card are preserved byte-for-byte.
 */
export function applyDeckUpdate(
	fileText: string,
	card: Card,
	meta: CardMeta,
): string {
	const { start, end } = card.metaSpan;
	return fileText.slice(0, start) + serializeFrontmatter(meta) + fileText.slice(end);
}
