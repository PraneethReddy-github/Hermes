export const NAV = [
	{ href: '/', label: 'Today', icon: 'today' },
	{ href: '/tasks', label: 'Tasks', icon: 'tasks' },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar' },
	{ href: '/notes', label: 'Notes', icon: 'notes' }
] as const;

export const isActive = (pathname: string, href: string): boolean =>
	href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
