import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

const BASE = 'https://hermes.invalid';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'A' && node.hasAttribute('href')) {
		node.setAttribute('target', '_blank');
		node.setAttribute('rel', 'noopener noreferrer');
	}
	if (node.tagName === 'IMG') {
		// Only inline (data:) or same-origin images; everything else would be an outbound request.
		let ok = false;
		try {
			const u = new URL(node.getAttribute('src') ?? '', BASE);
			ok = u.protocol === 'data:' || u.origin === BASE;
		} catch {
			/* unparsable src: drop it */
		}
		if (!ok) node.remove();
	}
});

/** Markdown → sanitised HTML. Raw HTML in the source is parsed, then scrubbed by DOMPurify. */
export const renderMarkdown = (src: string): string =>
	DOMPurify.sanitize(marked.parse(src, { async: false, gfm: true, breaks: true }), {
		// Everything that can make the browser fetch a URL, or shadow window properties, goes.
		FORBID_ATTR: ['style', 'srcset', 'background', 'poster'],
		FORBID_TAGS: ['form', 'input', 'style', 'video', 'audio', 'source', 'picture', 'track', 'svg'],
		SANITIZE_NAMED_PROPS: true
	});
