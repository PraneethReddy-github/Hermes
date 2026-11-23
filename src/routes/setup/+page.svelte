<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let timezone = $state(form?.timezone || 'Europe/Berlin');

	onMount(() => {
		const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (!form?.timezone && data.timezones.includes(detected)) timezone = detected;
	});
</script>

<svelte:head><title>Set up Hermes</title></svelte:head>

<main class="auth">
	<h1>Set up Hermes</h1>
	<p>Create the account. The setup token is printed in the server log.</p>
	<form class="card" method="POST">
		{#if form?.error}<p role="alert">{form.error}</p>{/if}
		<label>Setup token <input name="token" type="password" autocomplete="off" required /></label>
		<label>
			Username
			<input
				name="username"
				autocomplete="username"
				value={form?.username ?? ''}
				required
				maxlength="64"
			/>
		</label>
		<label>
			Password
			<input name="password" type="password" autocomplete="new-password" minlength="12" required />
		</label>
		<label>
			Confirm password
			<input name="confirm" type="password" autocomplete="new-password" minlength="12" required />
		</label>
		<label>
			Timezone
			<select name="timezone" bind:value={timezone}>
				{#each data.timezones as tz (tz)}<option value={tz}>{tz}</option>{/each}
			</select>
		</label>
		<button>Create account</button>
	</form>
</main>
