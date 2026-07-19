import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { PracticeView, VIEW_TYPE_PRACTICE } from './view/PracticeView';

// A note is a "deck" if it contains at least one ```ad-flashcard (or ~~~) block.
const DECK_FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*ad-flashcard[ \t]*$/m;

export default class FlashcardsPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(
			VIEW_TYPE_PRACTICE,
			(leaf) => new PracticeView(leaf),
		);

		this.addCommand({
			id: 'practice-deck',
			name: 'Practice deck',
			checkCallback: (checking: boolean) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				const file = markdownView?.file;
				if (!file || !DECK_FENCE.test(markdownView.editor.getValue())) {
					return false;
				}
				if (!checking) void this.practiceDeck(file);
				return true;
			},
		});
	}

	private async practiceDeck(file: TFile): Promise<void> {
		const view = await this.activateView();
		if (view) await view.setDeck(file);
	}

	private async activateView(): Promise<PracticeView | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_PRACTICE)[0] ?? null;

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_PRACTICE, active: true });
			}
		}
		if (!leaf) return null;

		await workspace.revealLeaf(leaf);
		return leaf.view instanceof PracticeView ? leaf.view : null;
	}
}
