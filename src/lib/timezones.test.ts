import { expect, it } from 'vitest';
import { TIMEZONES } from './timezones';

it('lists IANA zones plus UTC, sorted and unique', () => {
	expect(TIMEZONES).toContain('UTC');
	expect(TIMEZONES).toContain('Europe/Berlin');
	expect(TIMEZONES).toContain('America/New_York');
	expect(TIMEZONES).toEqual([...new Set(TIMEZONES)].sort());
});
