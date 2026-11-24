import { describe, expect, it } from 'vitest';
import { SWATCHES, cleanColor } from './swatches';

describe('swatches', () => {
	it('gold is #D4AF37; the retired #E3A93B is no longer accepted for new writes', () => {
		expect(SWATCHES[0]).toEqual({ value: '#D4AF37', name: 'Gold' });
		expect(cleanColor('#D4AF37')).toBe('#D4AF37');
		expect(() => cleanColor('#E3A93B')).toThrow('Invalid colour');
	});
	it('empty means no colour', () => {
		expect(cleanColor('')).toBeNull();
		expect(cleanColor(null)).toBeNull();
	});
});
