<script lang="ts">
	import { enhance } from '$app/forms';
	import TopBar from '#lib/components/TopBar.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const r = $derived(form && 'result' in form ? form.result : null);
</script>

<svelte:head><title>Import calendar · Hermes</title></svelte:head>

<main>
	<TopBar title="Import calendar" />
	<section class="card">
		<form method="POST" enctype="multipart/form-data" use:enhance>
			{#if form && 'error' in form}<p role="alert">{form.error}</p>{/if}
			{#if r}
				<p role="status">
					{`Imported ${r.created} ${r.created === 1 ? 'event' : 'events'}, skipped ${r.skipped}`}
				</p>
				{#if r.ignoredExdates}
					<p>{r.ignoredExdates} excluded dates ignored: too many or out of range.</p>
				{/if}
				{#if r.simplified}
					<p>{r.simplified} repeating, imported once: repeat rule not supported.</p>
				{/if}
			{/if}
			<label>
				Calendar file (.ics, max 2 MB)
				<input name="file" type="file" accept=".ics,text/calendar" required />
			</label>
			<button>Import</button>
		</form>
	</section>
</main>
