<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · Hermes</title></svelte:head>

<main class="auth">
	<h1>Sign in</h1>
	<!-- reset:false keeps the typed password so the TOTP step can resubmit it -->
	<form
		class="card"
		method="POST"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
	>
		{#if form?.error}<p role="alert">{form.error}</p>{/if}
		<input type="hidden" name="next" value={data.next} />
		<label>
			Username
			<input name="username" autocomplete="username" value={form?.username ?? ''} required />
		</label>
		<label>
			Password
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		{#if form?.needsTotp}
			<label>
				Authentication code
				<input
					name="code"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9 ]*"
					required
				/>
			</label>
		{/if}
		<button>Sign in</button>
	</form>
</main>
