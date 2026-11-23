/** IANA zones for pickers and validation; 'UTC' is missing from Intl's list. */
export const TIMEZONES: string[] = [
	...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
].sort();
