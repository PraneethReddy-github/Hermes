<script lang="ts">
	import { SWATCHES } from '../swatches';

	let {
		value = '',
		name = 'color',
		none = false
	}: { value?: string | null; name?: string; none?: boolean } = $props();
</script>

<fieldset>
	<legend>Colour</legend>
	{#if none}
		<label style:--c="transparent">
			<input type="radio" {name} value="" checked={!value} />
			<span class="dot none"></span>
			<span class="sr">Default</span>
		</label>
	{/if}
	{#each SWATCHES as s (s.value)}
		<label style:--c={s.value}>
			<input type="radio" {name} value={s.value} checked={value === s.value} />
			<span class="dot"></span>
			<span class="sr">{s.name}</span>
		</label>
	{/each}
</fieldset>

<style>
	fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0 0 12px;
		padding: 0;
		border: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 4px;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	label {
		position: relative;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin: 0;
	}
	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.dot {
		width: 28px;
		height: 28px;
		box-sizing: border-box;
		border-radius: 50%;
		background: var(--c);
		border: 2px solid transparent;
	}
	.none {
		border: 2px dashed var(--text-muted);
	}
	input:checked + .dot {
		border-color: var(--text);
		box-shadow: 0 0 0 2px var(--bg);
	}
	input:focus-visible + .dot {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
