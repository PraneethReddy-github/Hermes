import { createDb, type Db } from './index';
import { seed } from './seed';

export function createTestDb(): Db {
	const db = createDb(':memory:');
	seed(db);
	return db;
}
