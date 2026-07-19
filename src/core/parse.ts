import { parse as parseYaml } from 'yaml';
import type { Card, CardState, Deck, Span } from './card';
import { validateMeta } from './validate';

interface Line {
	readonly text: string; // without the trailing newline
	readonly start: number; // absolute offset of first char
	readonly end: number; // absolute offset just after the line's newline
}

/** Split text into lines, keeping absolute char offsets. Pure. Always non-empty. */
function splitLines(text: string): Line[] {
	const out: Line[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			out.push({ text: stripCr(text.slice(start, i)), start, end: i + 1 });
			start = i + 1;
		}
	}
	out.push({ text: stripCr(text.slice(start)), start, end: text.length });
	return out;
}

const stripCr = (s: string): string => (s.endsWith('\r') ? s.slice(0, -1) : s);

const OPEN_FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*ad-flashcard[ \t]*$/;
const FRONTMATTER_FENCE = /^---[ \t]*$/;

const isCloseFence = (line: string, char: string, len: number): boolean =>
	new RegExp(`^[ \\t]*${char === '`' ? '`' : '~'}{${len},}[ \\t]*$`).test(line);

/**
 * Parse a note's full text into a Deck: one Card per ```ad-flashcard block.
 * Pure — no I/O, no mutation, no `obsidian` import.
 */
export function parseDeck(path: string, text: string): Deck {
	const lines = splitLines(text);
	const cards: Card[] = [];

	let i = 0;
	while (i < lines.length) {
		const openLine = lines[i];
		const open = openLine ? OPEN_FENCE.exec(openLine.text) : null;
		if (!openLine || !open) {
			i++;
			continue;
		}
		const fence = open[1] ?? '';
		const closeIdx = findCloseFence(lines, i + 1, fence.charAt(0), fence.length);
		const closeLine = closeIdx === -1 ? undefined : lines[closeIdx];
		if (closeIdx === -1 || !closeLine) {
			// No closing code fence: not a well-formed block, skip the opener.
			i++;
			continue;
		}

		const blockSpan: Span = { start: openLine.start, end: closeLine.end };
		const inner = text.slice(openLine.end, closeLine.start);
		cards.push(parseBlock(inner, openLine.end, blockSpan));
		i = closeIdx + 1;
	}

	return { path, cards };
}

function findCloseFence(
	lines: Line[],
	from: number,
	char: string,
	len: number,
): number {
	for (let j = from; j < lines.length; j++) {
		const line = lines[j];
		if (line && isCloseFence(line.text, char, len)) return j;
	}
	return -1;
}

function parseBlock(inner: string, base: number, blockSpan: Span): Card {
	const innerLines = splitLines(inner);
	const first = innerLines[0];
	const hasFrontmatter = !!first && FRONTMATTER_FENCE.test(first.text);

	if (!hasFrontmatter || !first) {
		return {
			state: newState(inner),
			span: blockSpan,
			metaSpan: { start: base, end: base },
		};
	}

	const closeIdx = innerLines.findIndex(
		(line, idx) => idx > 0 && FRONTMATTER_FENCE.test(line.text),
	);
	const fmClose = closeIdx === -1 ? undefined : innerLines[closeIdx];
	if (!fmClose) {
		return errorCard('unterminated frontmatter section', inner, base, blockSpan);
	}

	const metaSpan: Span = { start: base + first.start, end: base + fmClose.end };
	const yamlStart = innerLines[1]?.start ?? fmClose.start;
	const yamlText = inner.slice(yamlStart, fmClose.start);
	const body = inner.slice(fmClose.end);

	let raw: unknown;
	try {
		raw = parseYaml(yamlText) ?? {};
	} catch (error) {
		return errorBlock(`invalid YAML: ${(error as Error).message}`, inner, blockSpan, metaSpan);
	}

	const result = validateMeta(raw);
	if (!result.ok) {
		return errorBlock(result.reason, inner, blockSpan, metaSpan);
	}

	const { question, answer } = parseQA(body);
	const state: CardState = { kind: 'scheduled', question, answer, meta: result.meta };
	return { state, span: blockSpan, metaSpan };
}

function newState(inner: string): CardState {
	const { question, answer } = parseQA(inner);
	return { kind: 'new', question, answer };
}

function errorCard(reason: string, inner: string, base: number, blockSpan: Span): Card {
	return errorBlock(reason, inner, blockSpan, { start: base, end: base });
}

function errorBlock(reason: string, inner: string, span: Span, metaSpan: Span): Card {
	return { state: { kind: 'error', reason, raw: inner }, span, metaSpan };
}

// Markers may be the full word or its initial, optionally wrapped in bold
// (`**`) around the keyword and/or the colon, e.g. `Question:`, `Q:`,
// `**Q:**`, `**Answer**:`. Case-insensitive.
const QUESTION_MARKER = /^[ \t]*\*{0,2}(?:Question|Q)\*{0,2}:\*{0,2}[ \t]?/im;
const ANSWER_MARKER = /^[ \t]*\*{0,2}(?:Answer|A)\*{0,2}:\*{0,2}[ \t]?/im;

/** Split a card body into question/answer by the Question:/Answer: markers. */
function parseQA(body: string): { question: string; answer: string } {
	const q = QUESTION_MARKER.exec(body);
	const a = ANSWER_MARKER.exec(body);

	if (q && a && a.index > q.index) {
		return {
			question: body.slice(q.index + q[0].length, a.index).trim(),
			answer: body.slice(a.index + a[0].length).trim(),
		};
	}
	if (a) {
		return {
			question: body.slice(0, a.index).trim(),
			answer: body.slice(a.index + a[0].length).trim(),
		};
	}
	if (q) {
		return { question: body.slice(q.index + q[0].length).trim(), answer: '' };
	}
	return { question: body.trim(), answer: '' };
}
