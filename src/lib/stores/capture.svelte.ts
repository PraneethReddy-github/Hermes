import { flushSync } from 'svelte';

// Shared flag: the + button / sidebar button open the capture sheet.
export const capture = $state({ open: false });

/** Open synchronously inside the click, so the sheet's input gets focus within the user gesture (iOS keyboard). */
export function openCapture() {
	capture.open = true;
	flushSync();
}
