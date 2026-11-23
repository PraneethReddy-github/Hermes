<script lang="ts">
	import { resolve } from '$app/paths';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
</script>

<svelte:head><title>New note · Hermes</title></svelte:head>

<main>
	<TopBar title="New note" />
	<p class="back"><a href={resolve('/notes')}>All notes</a></p>
	<NoteEditor />
</main>

<style>
	.back {
		margin: 0 0 8px;
	}
</style>
