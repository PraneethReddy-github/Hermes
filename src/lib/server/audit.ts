import type { Db } from './db';
import { auditLog } from './db/schema';

export function audit(
	db: Db,
	actor: string,
	action: string,
	entity?: string,
	entityId?: string,
	detail?: unknown
): void {
	db.insert(auditLog)
		.values({
			actor,
			action,
			entity,
			entityId,
			detailJson: detail === undefined ? null : JSON.stringify(detail)
		})
		.run();
}
