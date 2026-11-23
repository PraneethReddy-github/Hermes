import { getDb } from '../../../lib/server/db';
import { listCompleted } from '../../../lib/server/services/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ tasks: listCompleted(getDb(), new Date()) });
