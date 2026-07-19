import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { readDeck, applyRating } from '../io/deck-io';
import { buildSession } from '../core/session';
import { schedule } from '../core/schedule';
import { RATINGS } from '../core/card';
import type { Card, CardMeta, Deck, Rating } from '../core/card';

export const VIEW_TYPE_PRACTICE = 'flashcards-practice-view';

const RATING_LABEL: Record<Rating, string> = {
	again: 'Again',
	hard: 'Hard',
	good: 'Good',
	easy: 'Easy',
};

/** The side-leaf practice panel. All decisions come from the pure core. */
export class PracticeView extends ItemView {
	private deck: Deck | null = null;
	private queue: readonly Card[] = [];
	private errors: readonly Card[] = [];
	private index = 0;
	private revealed = false;
	private busy = false;
	private file: TFile | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_PRACTICE;
	}

	getDisplayText(): string {
		return '1xFlashcards';
	}

	getIcon(): string {
		return 'layers';
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	/** Load a note as the active deck and start a fresh session. */
	async setDeck(file: TFile): Promise<void> {
		this.file = file;
		try {
			this.deck = await readDeck(this.app.vault, file);
		} catch (error) {
			console.error('1xFlashcards: failed to read deck', error);
			new Notice('1xFlashcards: could not read this deck.');
			return;
		}
		const session = buildSession(this.deck, new Date());
		this.queue = session.queue;
		this.errors = session.errors;
		this.index = 0;
		this.revealed = false;
		this.render();
	}

	// --- rendering -------------------------------------------------------------

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('flashcards-view');

		if (!this.file || !this.deck) {
			this.renderEmptyState(root);
			return;
		}
		const card = this.queue[this.index];
		if (this.index >= this.queue.length || !card) {
			this.renderSummary(root);
			return;
		}
		this.renderCard(root, card);
	}

	private renderEmptyState(root: HTMLElement): void {
		const wrap = root.createDiv({ cls: 'flashcards-empty' });
		wrap.createEl('h3', { text: '1xFlashcards' });
		wrap.createEl('p', {
			text: 'Open a note containing ad-flashcard blocks, then run the “Practice deck” command.',
		});
	}

	private renderSummary(root: HTMLElement): void {
		const wrap = root.createDiv({ cls: 'flashcards-summary' });
		wrap.createEl('h3', { text: 'Session complete 🎉' });
		wrap.createEl('p', {
			text: this.queue.length
				? `You practiced ${this.queue.length} card${this.queue.length === 1 ? '' : 's'}.`
				: 'No cards are due right now.',
		});
		this.renderErrors(wrap);
		const again = wrap.createEl('button', {
			text: 'Practice again',
			cls: 'flashcards-btn flashcards-btn-secondary',
		});
		again.onclick = (): void => {
			if (this.file) void this.setDeck(this.file);
		};
	}

	private renderCard(root: HTMLElement, card: Card): void {
		const header = root.createDiv({ cls: 'flashcards-progress' });
		header.setText(`Card ${this.index + 1} of ${this.queue.length}`);
		this.renderErrorBanner(root);

		if (card.state.kind === 'error') {
			// Defensive: error cards never enter the queue, but never crash if one does.
			this.advance();
			return;
		}

		root.createDiv({ cls: 'flashcards-question' }).setText(card.state.question);

		if (!this.revealed) {
			const reveal = root.createEl('button', {
				text: 'Show answer',
				cls: 'flashcards-btn flashcards-btn-primary',
			});
			reveal.onclick = (): void => {
				this.revealed = true;
				this.render();
			};
			return;
		}

		root.createEl('hr', { cls: 'flashcards-divider' });
		root.createDiv({ cls: 'flashcards-answer' }).setText(card.state.answer);
		this.renderRatingButtons(root, card);
	}

	private renderRatingButtons(root: HTMLElement, card: Card): void {
		const prev = card.state.kind === 'scheduled' ? card.state.meta : null;
		const now = new Date();
		const row = root.createDiv({ cls: 'flashcards-ratings' });

		for (const rating of RATINGS) {
			const preview = schedule(prev, rating, now, 'preview');
			const btn = row.createEl('button', {
				cls: `flashcards-btn flashcards-rating flashcards-rating-${rating}`,
			});
			btn.createDiv({ cls: 'flashcards-rating-label', text: RATING_LABEL[rating] });
			btn.createDiv({
				cls: 'flashcards-rating-interval',
				text: formatInterval(preview.interval),
			});
			btn.onclick = (): void => void this.onRate(rating);
		}
	}

	private renderErrorBanner(root: HTMLElement): void {
		if (this.errors.length === 0) return;
		root
			.createDiv({ cls: 'flashcards-error-banner' })
			.setText(
				`${this.errors.length} card${this.errors.length === 1 ? '' : 's'} skipped (bad metadata)`,
			);
	}

	private renderErrors(root: HTMLElement): void {
		if (this.errors.length === 0) return;
		const details = root.createEl('details', { cls: 'flashcards-error-list' });
		details.createEl('summary', {
			text: `${this.errors.length} card${this.errors.length === 1 ? '' : 's'} with formatting errors`,
		});
		for (const card of this.errors) {
			if (card.state.kind === 'error') {
				details.createDiv({
					cls: 'flashcards-error-reason',
					text: card.state.reason,
				});
			}
		}
	}

	// --- actions ---------------------------------------------------------------

	private async onRate(rating: Rating): Promise<void> {
		if (!this.file || !this.deck || this.busy) return;
		const card = this.queue[this.index];
		const cardIndex = card ? this.deck.cards.indexOf(card) : -1;
		if (cardIndex === -1) {
			this.advance();
			return;
		}

		this.busy = true;
		try {
			const written = await applyRating(
				this.app.vault,
				this.file,
				cardIndex,
				rating,
				new Date(),
				crypto.randomUUID(),
			);
			if (!written) new Notice('1xFlashcards: card could not be saved.');
			else this.mergeWritten(cardIndex, written);
		} catch (error) {
			console.error('1xFlashcards: failed to save rating', error);
			new Notice('1xFlashcards: failed to save your rating.');
		} finally {
			this.busy = false;
		}
		this.advance();
	}

	/** Keep the in-memory deck consistent so re-rating within a session is correct. */
	private mergeWritten(cardIndex: number, meta: CardMeta): void {
		if (!this.deck) return;
		const cards = this.deck.cards.map((card, i) =>
			i === cardIndex
				? {
						...card,
						state: {
							kind: 'scheduled' as const,
							question: questionOf(card),
							answer: answerOf(card),
							meta,
						},
					}
				: card,
		);
		this.deck = { ...this.deck, cards };
	}

	private advance(): void {
		this.index += 1;
		this.revealed = false;
		this.render();
	}
}

function questionOf(card: Card): string {
	return card.state.kind === 'error' ? '' : card.state.question;
}

function answerOf(card: Card): string {
	return card.state.kind === 'error' ? '' : card.state.answer;
}

/** Human-friendly interval label for the rating buttons. */
function formatInterval(days: number): string {
	if (days < 1) return '<1d';
	if (days < 30) return `${days}d`;
	if (days < 365) return `${Math.round(days / 30)}mo`;
	return `${Math.round(days / 365)}y`;
}
