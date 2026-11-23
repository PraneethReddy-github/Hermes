<script lang="ts">
	import { resolve } from '$app/paths';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.note.title || 'Note'} · Hermes</title></svelte:head>

<main>
	<TopBar title="Note" />
	<p class="back"><a href={resolve('/notes')}>All notes</a></p>
	{#key data.note.id}
		<NoteEditor note={data.note} />
	{/key}
</main>

<style>
	.back {
		margin: 0 0 8px;
	}
</style>
