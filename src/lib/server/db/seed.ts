import { projects } from './schema';
import type { Db } from './index';

const SEED = [
	{ name: 'Inbox', isDefault: true, kind: 'list' },
	{ name: 'Uni', kind: 'list' },
	{ name: 'Personal', kind: 'list' },
	{ name: 'Shopping', kind: 'checklist' }
] as const;

export function seed(db: Db): void {
	if (db.select({ id: projects.id }).from(projects).limit(1).get()) return;
	db.insert(projects)
		.values(SEED.map((p, position) => ({ ...p, position })))
		.run();
}
