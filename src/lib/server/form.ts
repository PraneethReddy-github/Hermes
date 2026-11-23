/** A text form field, '' when missing or a file. */
export const field = (f: FormData, key: string): string => {
	const v = f.get(key);
	return typeof v === 'string' ? v : '';
};
