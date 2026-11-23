import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders markdown', () => {
		expect(renderMarkdown('# Hi\n\n**bold**')).toContain('<h1>Hi</h1>');
	});

	it('strips scripts, handlers, style, forms', () => {
		const out = renderMarkdown(
			'<script>window.__xss=1</script><img src=x onerror="window.__xss=1"><p style="color:red">a</p><form><input name=x></form>'
		);
		expect(out).not.toMatch(/script|onerror|style|<form|<input/);
	});

	it('forces safe link attributes', () => {
		const out = renderMarkdown('[x](https://example.com) [y](javascript:alert(1))');
		expect(out).toContain('target="_blank"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).not.toContain('javascript:');
	});

	it('keeps data: and same-origin images, drops remote ones', () => {
		expect(renderMarkdown('![a](data:image/png;base64,AAAA)')).toContain('<img');
		expect(renderMarkdown('![a](/assets/x.png)')).toContain('<img');
		expect(renderMarkdown('![a](https://evil.example/x.png)')).not.toContain('<img');
		expect(renderMarkdown('![a](//evil.example/x.png)')).not.toContain('<img');
	});

	it('removes every other URL-fetching attribute and tag', () => {
		const h = 'https://evil.example/x';
		const out = renderMarkdown(
			[
				`<img srcset="${h} 2x">`,
				`<img src="/a.png" srcset="${h} 2x">`,
				`<picture><source srcset="${h}"><img src="/a.png"></picture>`,
				`<video src="${h}" poster="${h}"></video>`,
				`<audio src="${h}"></audio>`,
				`<video><source src="${h}"></video>`,
				`<table background="${h}"><tr><td background="${h}">x</td></tr></table>`,
				`<svg><image href="${h}"/></svg>`
			].join('\n\n')
		);
		expect(out).not.toMatch(/srcset|background|poster|<video|<audio|<source|<picture|<svg|<image/i);
		expect(out).not.toContain('evil.example');
	});

	it('prefixes id/name so they cannot clobber window properties', () => {
		const out = renderMarkdown('<div id="__xss">a</div><a name="x" href="/y">b</a>');
		expect(out).not.toContain('id="__xss"');
		expect(out).not.toContain('name="x"');
	});
});
