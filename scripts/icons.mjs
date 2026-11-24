// One-off: node scripts/icons.mjs. Rasterises the wing icon into static/icons/*.png and writes the
// favicon SVG (PNGs and SVG are committed). Flat gold #D4AF37 on #0B0C0E, straight-edged polygons only.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const GOLD = '#D4AF37';
const INK = '#0B0C0E';

// Three feather blades fanned from a straight shoulder cut, longest on top, each a polygon with a
// sharp slanted tip. Lower blades are painted first; the top blade's INK outline opens the gaps.
const rad = (deg) => (deg * Math.PI) / 180;
const SHOULDER = { normal: [Math.cos(rad(-50)), Math.sin(rad(-50))], at: 20 };
const BLADES = [
	{ angle: -58, length: 440 },
	{ angle: -40, length: 400 },
	{ angle: -22, length: 350 }
];
const HALF_W = 34;
const CUT = 140; // tip is cut back along the axis, which makes it sharp
const GAP = 14; // visible gap between blades, in 512px units

// Keep the part of `poly` on the far side of the shoulder line.
function clip(poly) {
	const { normal, at } = SHOULDER;
	const side = (p) => normal[0] * p[0] + normal[1] * p[1] - at;
	const out = [];
	poly.forEach((a, i) => {
		const b = poly[(i + 1) % poly.length];
		const [da, db] = [side(a), side(b)];
		if (da >= 0) out.push(a);
		if (da >= 0 !== db >= 0) {
			const t = da / (da - db);
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
		}
	});
	return out;
}
const polys = BLADES.map(({ angle, length }) => {
	const d = [Math.cos(rad(angle)), Math.sin(rad(angle))];
	const n = [-d[1], d[0]];
	const P = (r, k) => [d[0] * r + n[0] * k, d[1] * r + n[1] * k];
	return clip([P(-200, -HALF_W), P(length, -HALF_W), P(length - CUT, HALF_W), P(-200, HALF_W)]);
});

// Fit the mark into 512 x 512, centred; `share` is the fraction of the canvas it may fill.
function marks(share) {
	const pts = polys.flat();
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const k = (512 * share) / Math.max(x1 - x0, y1 - y0);
	const ox = (512 - (x1 - x0) * k) / 2 - x0 * k;
	const oy = (512 - (y1 - y0) * k) / 2 - y0 * k;
	return [...polys]
		.reverse()
		.map((p) => {
			const d =
				'M' +
				p.map(([x, y]) => `${(x * k + ox).toFixed(1)} ${(y * k + oy).toFixed(1)}`).join('L') +
				'Z';
			return `<path d="${d}" fill="${GOLD}" stroke="${INK}" stroke-width="${GAP * 2 * share}" paint-order="stroke" stroke-linejoin="miter" stroke-miterlimit="2"/>`;
		})
		.join('');
}

const svg = (share) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${INK}"/>
${marks(share)}
</svg>
`;

writeFileSync('src/lib/assets/favicon.svg', svg(0.78));

// maskable: the mark stays inside the 80% safe circle.
const out = [
	['icon-192.png', 192, 0.78],
	['icon-512.png', 512, 0.78],
	['icon-maskable-512.png', 512, 0.5],
	['apple-touch-icon.png', 180, 0.78]
];
for (const [name, size, share] of out)
	await sharp(Buffer.from(svg(share)))
		.resize(size, size)
		.png()
		.toFile(`static/icons/${name}`);
