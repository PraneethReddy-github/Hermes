<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { saved } from '../../lib/actions/saved';
	import TopBar from '#lib/components/TopBar.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { showToast } from '../../lib/stores/toast.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let backingUp = $state(false);

	// Region = text before the first '/'; zones without one (UTC) go under "Other".
	const regions = $derived(
		Object.entries(
			Object.groupBy(data.timezones, (tz) => (tz.includes('/') ? tz.split('/')[0] : 'Other'))
		)
	);

	const backup: SubmitFunction = () => {
		backingUp = true;
		return async ({ result, update }) => {
			await update({ reset: false, navigate: false });
			backingUp = false;
			if (result.type === 'success') showToast('Backup complete');
		};
	};
</script>

<svelte:head><title>Settings · Hermes</title></svelte:head>

<main>
	<TopBar title="Settings" />

	<section class="card">
		<h2>Appearance</h2>
		<ThemeToggle theme={data.theme} />
	</section>

	<section class="card">
		<h2>Time</h2>
		<form method="POST" action="?/time" use:enhance={saved()}>
			{#if form && 'error' in form}<p role="alert">{form.error}</p>{/if}
			<label>
				Timezone
				<select name="timezone" value={data.timezone}>
					{#each regions as [region, zones] (region)}
						<optgroup label={region}>
							{#each zones ?? [] as tz (tz)}<option value={tz}>{tz}</option>{/each}
						</optgroup>
					{/each}
				</select>
				<small class="hint">
					Timed items keep their moment in time; dates and all-day items stay on the same day.
				</small>
			</label>
			<label>
				Week starts on
				<select name="weekStart" value={String(data.weekStart)}>
					<option value="1">Monday</option>
					<option value="0">Sunday</option>
				</select>
			</label>
			<button>Save</button>
		</form>
	</section>

	<nav class="card links" aria-label="More settings">
		<a href={resolve('/projects')}>Projects</a>
		<a href={resolve('/labels')}>Labels</a>
		<a href={resolve('/settings/import')}>Import calendar</a>
		<a href={resolve('/settings/security')}>Security</a>
	</nav>

	<section class="card">
		<h2>Backup</h2>
		{#if data.backup.last}
			<p>
				Last backup: <time class="mono">{data.backup.last.at}</time><br />
				<small class="mono">{data.backup.last.file} · {data.backup.count} kept</small>
			</p>
		{:else}
			<p>No backups yet.</p>
		{/if}
		<form method="POST" action="?/backup" use:enhance={backup}>
			{#if form && 'backupError' in form}<p role="alert">{form.backupError}</p>{/if}
			<button disabled={backingUp}>{backingUp ? 'Backing up…' : 'Back up now'}</button>
		</form>
	</section>

	<form method="POST" action="/logout"><button class="ghost">Log out</button></form>

	<p class="version">Hermes {__APP_VERSION__}</p>
</main>

<style>
	.links {
		display: grid;
		padding: 0 16px;
	}
	.links a {
		display: flex;
		align-items: center;
		min-height: 44px;
		color: var(--text);
		text-decoration: none;
	}
	.links a + a {
		border-top: 1px solid var(--border);
	}
	.hint {
		display: block;
		margin-top: 4px;
	}
	.version {
		margin: 24px 0 0;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		text-align: center;
	}
</style>
