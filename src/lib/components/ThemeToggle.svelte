<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { saved } from '../actions/saved';
	import { THEMES, type Theme } from '../theme';

	let { theme }: { theme: Theme } = $props();

	// Apply at once; put the old theme back if the save fails.
	const submit: SubmitFunction = (input) => {
		const html = document.documentElement;
		const prev = html.dataset.theme;
		html.dataset.theme = input.formData.get('theme') as string;
		return saved(() => (html.dataset.theme = prev))(input);
	};
</script>

<form method="POST" action="/settings?/theme" use:enhance={submit} class="seg" aria-label="Theme">
	{#each THEMES as t (t)}
		<button name="theme" value={t} class="ghost" aria-pressed={theme === t}>
			{t[0].toUpperCase() + t.slice(1)}
		</button>
	{/each}
</form>

<style>
	.seg {
		display: flex;
	}
	button {
		flex: 1;
		margin-left: -1px;
		border-radius: 0;
		color: var(--text-muted);
		font-weight: 500;
	}
	button:first-child {
		margin-left: 0;
		border-radius: var(--r-1) 0 0 var(--r-1);
	}
	button:last-child {
		border-radius: 0 var(--r-1) var(--r-1) 0;
	}
	button[aria-pressed='true'] {
		background: var(--surface-3);
		color: var(--text);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
</style>
