<script lang="ts">
	// Straight segments at 45/90 degrees only: no circles, no rounded corners.
	const PATHS = {
		today:
			'<rect x="8" y="8" width="8" height="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
		tasks: '<rect x="3" y="3" width="18" height="18"/><path d="M7 12.5l3.5 3.5L17 9"/>',
		calendar: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
		notes: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h8"/>',
		pin: '<path d="M9 3h6v6l3 3v2H6v-2l3-3z"/><path d="M12 14v7"/>',
		check: '<path d="M5 12.5l5 5L19 7"/>',
		clock: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M12 7v5l3 3"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		search: '<path d="M7.6 3.5h5.8l4.1 4.1v5.8l-4.1 4.1H7.6l-4.1-4.1V7.6z"/><path d="M16 16l5 5"/>',
		settings:
			'<path d="M3 7h11M18 7h3M3 17h3M10 17h11"/><rect x="14" y="5" width="4" height="4"/><rect x="6" y="15" width="4" height="4"/>',
		'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
		'chevron-right': '<path d="M9 5l7 7-7 7"/>',
		close: '<path d="M6 6l12 12M18 6L6 18"/>'
	};
	let { name, size = 24 }: { name: keyof typeof PATHS; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="square"
	stroke-linejoin="miter"
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- constant strings above -->
	{@html PATHS[name]}
</svg>
