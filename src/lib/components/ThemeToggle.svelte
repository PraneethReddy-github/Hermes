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
		gap: 8px;
	}
	button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
