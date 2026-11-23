<script lang="ts">
	import type { RecurrenceScope } from '../../types';
	import Sheet from '../Sheet.svelte';

	let {
		title,
		onpick,
		onclose
	}: { title: string; onpick: (s: RecurrenceScope) => void; onclose: () => void } = $props();

	const SCOPES: [RecurrenceScope, string][] = [
		['this', 'This event'],
		['following', 'This and following events'],
		['all', 'All events']
	];
</script>

<Sheet open {title} {onclose}>
	<div class="scopes">
		{#each SCOPES as [scope, label] (scope)}
			<button class="ghost" onclick={() => onpick(scope)}>{label}</button>
		{/each}
		<button class="ghost" onclick={onclose}>Cancel</button>
	</div>
</Sheet>

<style>
	.scopes {
		display: grid;
		gap: 8px;
	}
</style>
