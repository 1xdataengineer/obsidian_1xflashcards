import type { Vault } from 'obsidian';
import type { Deck } from '../core/card';
import { readDeck } from './deck-io';

export interface VaultOverview {
	readonly decks: readonly Deck[];
	readonly failedPaths: readonly string[];
}

/** Scan only on request, with bounded parallel reads to avoid flooding mobile storage. */
export async function readVaultOverview(vault: Vault): Promise<VaultOverview> {
	const files = vault.getMarkdownFiles();
	const decks: Deck[] = [];
	const failedPaths: string[] = [];
	for (let i = 0; i < files.length; i += 8) {
		await Promise.all(files.slice(i, i + 8).map(async (file) => {
			try {
				const deck = await readDeck(vault, file);
				if (deck.cards.length) decks.push(deck);
			} catch {
				failedPaths.push(file.path);
			}
		}));
	}
	return { decks, failedPaths: failedPaths.sort() };
}
