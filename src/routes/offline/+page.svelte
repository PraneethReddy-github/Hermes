<svelte:head><title>Offline · Hermes</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>You're offline</h1>
		<p>Hermes needs a connection to load this page. Reconnect and try again.</p>
		<button onclick={() => location.reload()}>Retry</button>
	</div>
</main>
