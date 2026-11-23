// One-off: node scripts/icons.mjs. Rasterises the wing icon into static/icons/*.png (PNGs are committed).
import sharp from 'sharp';

const WING =
	'M120 392 C136 262 246 152 404 120 C376 182 334 212 282 226 C332 228 362 218 384 204 ' +
	'C354 272 304 302 242 312 C292 318 322 312 344 300 C314 352 252 382 120 392 Z';

// scale = share of the canvas the wing occupies; maskable keeps it inside the 20% safe padding.
const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#0F1115"/>
<g transform="translate(256 256) scale(${scale}) translate(-262 -256)">
<path d="${WING}" fill="none" stroke="#E3A93B" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</g></svg>`;

const out = [
	['icon-192.png', 192, 1],
	['icon-512.png', 512, 1],
	['icon-maskable-512.png', 512, 0.6],
	['apple-touch-icon.png', 180, 1]
];
for (const [name, size, scale] of out)
	await sharp(Buffer.from(svg(scale)))
		.resize(size, size)
		.png()
		.toFile(`static/icons/${name}`);
