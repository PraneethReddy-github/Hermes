export type Priority = 0 | 1 | 2 | 3 | 4;
export type ProjectKind = 'list' | 'checklist';
export type NoteKind = 'note' | 'idea' | 'research' | 'contact';
export type CaptureType = 'task' | 'event' | 'note' | 'shopping';
export type RecurrenceScope = 'this' | 'following' | 'all';
export interface TaskInput {
	title: string;
	notes?: string;
	projectId?: string;
	parentId?: string | null;
	labelNames?: string[];
	priority?: Priority;
	dueAt?: string | null;
	dueHasTime?: boolean;
	startAt?: string | null;
	estimateMin?: number | null;
	rrule?: string | null;
}
export interface EventInput {
	title: string;
	notes?: string;
	location?: string;
	startAt: string;
	endAt: string;
	allDay?: boolean;
	rrule?: string | null;
	color?: string | null;
	projectId?: string | null;
}
export interface EventOccurrence {
	eventId: string;
	title: string;
	location: string | null;
	color: string | null;
	startAt: string;
	endAt: string;
	allDay: boolean;
	originalStart: string;
	isRecurring: boolean;
}
