<script lang="ts">
	import { enhance } from '$app/forms';
	import TopBar from '#lib/components/TopBar.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const msg = (which: string) => (form?.which === which ? form : null);
	const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB');
</script>

<svelte:head><title>Security · Hermes</title></svelte:head>

<main>
	<TopBar title="Security" />

	<section class="card">
		<h2>Change password</h2>
		<form method="POST" action="?/changePassword" use:enhance>
			{#if msg('password')?.error}<p role="alert">{msg('password')?.error}</p>{/if}
			{#if msg('password')?.ok}<p role="status">{msg('password')?.ok}</p>{/if}
			<label>
				Current password
				<input name="current" type="password" autocomplete="current-password" required />
			</label>
			<label>
				New password
				<input name="new" type="password" autocomplete="new-password" minlength="12" required />
			</label>
			<label>
				Confirm new password
				<input name="confirm" type="password" autocomplete="new-password" minlength="12" required />
			</label>
			<button>Change password</button>
		</form>
	</section>

	<section class="card">
		<h2>Two-factor authentication</h2>
		{#if msg('totp')?.error}<p role="alert">{msg('totp')?.error}</p>{/if}
		{#if msg('totp')?.ok}<p role="status">{msg('totp')?.ok}</p>{/if}
		{#if data.totpEnabled}
			<form method="POST" action="?/disableTotp" use:enhance>
				<label>
					Authentication code to turn off
					<input
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9 ]*"
						required
					/>
				</label>
				<button class="ghost">Disable two-factor</button>
			</form>
		{:else if msg('totp')?.secret}
			<p>Scan the QR code with your authenticator app, or enter the key by hand.</p>
			<img src={msg('totp')?.qr} alt="TOTP QR code" width="220" height="220" />
			<p><code>{msg('totp')?.secret}</code></p>
			<form method="POST" action="?/enableTotp" use:enhance>
				<input type="hidden" name="secret" value={msg('totp')?.secret} />
				<input type="hidden" name="qr" value={msg('totp')?.qr} />
				<label>
					Current password
					<input name="current" type="password" autocomplete="current-password" required />
				</label>
				<label>
					Code from the app
					<input
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9 ]*"
						required
					/>
				</label>
				<button>Enable two-factor</button>
			</form>
		{:else}
			<form method="POST" action="?/startTotp" use:enhance><button>Set up two-factor</button></form>
		{/if}
	</section>

	<section class="card">
		<h2>Sessions</h2>
		{#if msg('sessions')?.error}<p role="alert">{msg('sessions')?.error}</p>{/if}
		{#if msg('sessions')?.ok}<p role="status">{msg('sessions')?.ok}</p>{/if}
		<ul>
			{#each data.sessions as s (s.id)}
				<li>
					<span>{s.userAgent ?? 'Unknown device'}</span>
					{#if s.current}<strong>This device</strong>{/if}
					<small>Last seen {fmt(s.lastSeenAt)}</small>
					<form method="POST" action="?/revoke" use:enhance>
						<input type="hidden" name="id" value={s.id} />
						<button class="ghost">{s.current ? 'Sign out this device' : 'Revoke'}</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>

	<form method="POST" action="/logout"><button class="ghost">Sign out</button></form>
</main>
