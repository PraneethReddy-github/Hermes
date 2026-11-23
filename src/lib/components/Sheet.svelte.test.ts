import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

const children = createRawSnippet(() => ({ render: () => '<button>Inner</button>' }));

describe('Sheet', () => {
	it('opens as a modal dialog and Esc asks to close', async () => {
		const onclose = vi.fn();
		await render(Sheet, { open: true, onclose, title: 'Quick add', children });
		await expect.element(page.getByRole('dialog', { name: 'Quick add' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('stays closed when open is false', async () => {
		await render(Sheet, { open: false, onclose: () => {}, title: 'Quick add', children });
		expect(document.querySelector('dialog')?.open).toBe(false);
	});
});
