/** The 8 colours projects and labels can have; they read on both themes. Server validates against this. */
export const SWATCHES = [
	{ value: '#E3A93B', name: 'Gold' },
	{ value: '#5B9BD5', name: 'Blue' },
	{ value: '#58B37A', name: 'Green' },
	{ value: '#E07B39', name: 'Orange' },
	{ value: '#E05252', name: 'Red' },
	{ value: '#A78BDA', name: 'Purple' },
	{ value: '#4FB3BF', name: 'Teal' },
	{ value: '#9A9DA5', name: 'Grey' }
] as const;

/** '' / null / undefined mean "no colour"; anything else must be a swatch. */
export function cleanColor(color: string | null | undefined): string | null {
	if (!color) return null;
	if (!SWATCHES.some((s) => s.value === color)) throw new Error('Invalid colour');
	return color;
}
