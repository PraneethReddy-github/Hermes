<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Markdown from './Markdown.svelte';
	import Sheet from './Sheet.svelte';
	import { KIND_LABELS } from '../notes';
	import { MAX_BODY, MAX_TITLE } from '../limits';
	import { errorOf } from '../stores/tasks.svelte';
	import { showToast } from '../stores/toast.svelte';
	import type { NoteKind } from '../types';

	type Note = { id: string; title: string; body: string; kind: NoteKind; pinned: boolean };
	let { note }: { note?: Note } = $props();

	// The form owns its values after mount; `saved` is what the server last accepted.
	// svelte-ignore state_referenced_locally
	let title = $state(note?.title ?? '');
	// svelte-ignore state_referenced_locally
	let body = $state(note?.body ?? '');
	// svelte-ignore state_referenced_locally
	let kind = $state<NoteKind>(note?.kind ?? 'note');
	// svelte-ignore state_referenced_locally
	let pinned = $state(note?.pinned ?? false);
	// svelte-ignore state_referenced_locally
	let saved = $state.raw({
		title: note?.title ?? '',
		body: note?.body ?? '',
		kind: note?.kind ?? 'note',
		pinned: note?.pinned ?? false
	});
	let preview = $state(false);
	let confirmDelete = $state(false);
	let error = $state('');
	let ta = $state<HTMLTextAreaElement>();

	const dirty = $derived(
		title !== saved.title || body !== saved.body || kind !== saved.kind || pinned !== saved.pinned
	);

	beforeNavigate((nav) => {
		if (dirty && !confirm('Discard unsaved changes?')) nav.cancel();
	});

	// Auto-grow; re-measure when the textarea becomes visible again.
	$effect(() => {
		void [body, preview];
		if (!ta || preview) return;
		ta.style.height = 'auto';
		ta.style.height = `${ta.scrollHeight + 2}px`;
	});

	const save: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type !== 'success' && result.type !== 'redirect') {
				// failure, error (500/CSRF), cancelled: stay dirty so the guard still protects the text
				error = errorOf(result);
				showToast(error, { error: true });
				return;
			}
			error = '';
			saved = { title, body, kind, pinned }; // before the redirect, so the guard stays quiet
			if (result.type === 'redirect') await update();
			else {
				await update({ reset: false, navigate: false });
				showToast('Saved');
			}
		};

	const remove: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type !== 'success') {
				confirmDelete = false;
				error = errorOf(result);
				return;
			}
			saved = { title, body, kind, pinned };
			showToast('Note deleted', { undo: `/notes/${note!.id}?/restore` });
			await goto(resolve('/notes'));
		};
</script>

<form method="POST" action="?/save" use:enhance={save}>
	<label>
		Title <input name="title" bind:value={title} maxlength={MAX_TITLE} autocomplete="off" />
	</label>
	<div class="row">
		<label>
			Kind
			<select name="kind" bind:value={kind}>
				{#each Object.entries(KIND_LABELS) as [k, label] (k)}
					<option value={k}>{label}</option>
				{/each}
			</select>
		</label>
		<label class="pin"><input type="checkbox" name="pinned" bind:checked={pinned} /> Pinned</label>
	</div>
	<label hidden={preview}>
		Body
		<textarea name="body" bind:value={body} bind:this={ta} maxlength={MAX_BODY} rows="8"></textarea>
	</label>
	{#if preview}
		<div class="preview" aria-label="Preview"><Markdown source={body} /></div>
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	<div class="actions">
		<button type="button" class="ghost" aria-pressed={preview} onclick={() => (preview = !preview)}>
			Preview
		</button>
		{#if note}
			<button type="button" class="ghost danger" onclick={() => (confirmDelete = true)}>
				Delete
			</button>
		{/if}
		<button>Save</button>
	</div>
</form>

{#if note}
	<Sheet open={confirmDelete} onclose={() => (confirmDelete = false)} title="Delete this note?">
		<form method="POST" action="?/delete" use:enhance={remove}>
			<div class="actions">
				<button type="button" class="ghost" onclick={() => (confirmDelete = false)}>Cancel</button>
				<button class="danger-fill">Delete</button>
			</div>
		</form>
	</Sheet>
{/if}

<style>
	.row {
		display: flex;
		gap: 12px;
		align-items: end;
	}
	.row label:first-child {
		flex: 1;
	}
	.pin {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		color: var(--text);
	}
	.pin input {
		width: 20px;
		height: 20px;
	}
	input,
	select,
	textarea {
		font-size: 1rem; /* below 16px iOS zooms the page on focus */
	}
	textarea {
		overflow: hidden;
		resize: none;
		min-height: 200px;
	}
	.preview {
		min-height: 200px;
		padding: 8px 12px;
		margin-bottom: 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	.danger {
		color: var(--danger);
	}
	.danger-fill {
		background: var(--danger);
		border-color: var(--danger);
		color: #fff;
	}
</style>
