import { rmSync } from 'node:fs';

export default function globalSetup() {
	rmSync('./.e2e-data', { recursive: true, force: true });
}
