import { TFile, Vault } from 'obsidian';
import { parseDeck } from '../core/parse';
import { schedule } from '../core/schedule';
import { applyDeckUpdate } from '../core/serialize';
import type { CardMeta, Deck, Rating } from '../core/card';

// The ONLY module besides main.ts / PracticeView.ts allowed to touch the vault.
// Keeps src/core pure by doing all reading/writing here.

/** Read a note and parse it into a Deck. Uses cachedRead (mobile-safe, no disk hit). */
export async function readDeck(vault: Vault, file: TFile): Promise<Deck> {
	const text = await vault.cachedRead(file);
	return parseDeck(file.path, text);
}

/**
 * Atomically record a rating for one card and return the metadata written.
 *
 * Everything is derived from the freshly-read file text *inside* `vault.process`
 * (a mobile-safe read-modify-write), so the schedule is computed against current
 * on-disk state, never a stale snapshot. `now` and `freshId` are injected to keep
 * the pure core deterministic; `freshId` is only consumed for a first-time card.
 *
 * Returns `null` if the card no longer exists or is an `error` card.
 */
export async function applyRating(
	vault: Vault,
	file: TFile,
	cardIndex: number,
	rating: Rating,
	now: Date,
	freshId: string,
): Promise<CardMeta | null> {
	let written: CardMeta | null = null;

	await vault.process(file, (data) => {
		const deck = parseDeck(file.path, data);
		const target = deck.cards[cardIndex];
		if (!target || target.state.kind === 'error') return data;

		const prev = target.state.kind === 'scheduled' ? target.state.meta : null;
		const meta = schedule(prev, rating, now, freshId);
		written = meta;
		return applyDeckUpdate(data, target, meta);
	});

	return written;
}
