import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { buildOverview } from '../core/overview';
import type { OverviewRow, OverviewStatus } from '../core/overview';
import { readVaultOverview } from '../io/vault-overview';

export const VIEW_TYPE_OVERVIEW = 'flashcards-overview-view';

export class OverviewView extends ItemView {
	private filter = 'due';
	private rows: readonly OverviewRow[] = [];
	private failedPaths: readonly string[] = [];
	private busy = false;
	private closed = false;

	constructor(leaf: WorkspaceLeaf) { super(leaf); }

	getViewType(): string { return VIEW_TYPE_OVERVIEW; }
	getDisplayText(): string { return 'Flashcard overview'; }
	getIcon(): string { return 'table'; }

	async onOpen(): Promise<void> {
		this.closed = false;
		await this.refresh();
	}

	async onClose(): Promise<void> { this.closed = true; }

	async refresh(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.render();
		try {
			const result = await readVaultOverview(this.app.vault);
			this.rows = buildOverview(result.decks, new Date());
			this.failedPaths = result.failedPaths;
		} catch {
			new Notice('Could not load the flashcard overview. Select refresh to retry.');
		} finally {
			this.busy = false;
			if (!this.closed) this.render();
		}
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('flashcards-overview');
		root.createEl('h2', { text: 'Flashcard overview' });
		const controls = root.createDiv({ cls: 'flashcards-overview-controls' });
		const refresh = controls.createEl('button', { text: this.busy ? 'Scanning vault…' : 'Refresh' });
		refresh.disabled = this.busy;
		refresh.onclick = () => { void this.refresh(); };
		const label = controls.createEl('label', { text: 'Show ' });
		const select = label.createEl('select');
		const filters = { due: 'Due for review', new: 'New cards', all: 'All decks' };
		for (const [value, text] of Object.entries(filters)) {
			select.createEl('option', { attr: { value }, text });
		}
		select.value = this.filter;
		select.onchange = () => { this.filter = select.value; this.render(); };
		if (this.busy) return;

		const count = (status: OverviewStatus): number => this.rows.reduce((total, row) => total + row[status], 0);
		root.createEl('p', {
			text: `${count('due')} due for review · ${count('new')} new · ${count('upcoming')} upcoming · ${count('error')} invalid`,
		});
		root.createEl('p', { text: 'Open a note, then start a practice session from the command palette. Refresh this overview after reviewing.' });
		if (this.failedPaths.length) {
			const details = root.createEl('details');
			details.createEl('summary', { text: `${this.failedPaths.length} notes could not be read; totals may be incomplete.` });
			for (const path of this.failedPaths) details.createEl('p', { text: path });
		}
		const visible = this.rows.filter((row) => this.filter === 'all' || (this.filter === 'due' ? row.due > 0 : row.new > 0));
		if (!visible.length) {
			root.createEl('p', { text: this.filter === 'due' ? 'No flashcards are due for review.' : 'No flashcards to show.' });
			return;
		}
		const table = root.createDiv({ cls: 'flashcards-overview-table' }).createEl('table');
		const header = table.createEl('thead').createEl('tr');
		for (const text of ['Filename', 'Due', 'New', 'Practiced', 'Upcoming', 'Invalid']) header.createEl('th', { text });
		root.createEl('p', { text: 'Practiced counts previously reviewed cards, including cards that are due again.' });
		const body = table.createEl('tbody');
		for (const row of visible) {
			const tr = body.createEl('tr');
			const link = tr.createEl('td').createEl('a', {
				text: row.path.split('/').pop() ?? row.path,
				cls: 'internal-link', attr: { href: row.path, title: row.path },
			});
			link.onclick = (event) => {
				event.preventDefault();
				void this.app.workspace.openLinkText(row.path, '', event.ctrlKey || event.metaKey)
					.catch(() => { new Notice('Could not open this note. It may have moved; refresh the overview.'); });
			};
			for (const count of [row.due, row.new, row.practiced, row.upcoming, row.error]) {
				tr.createEl('td', { text: String(count) });
			}
		}
	}
}
