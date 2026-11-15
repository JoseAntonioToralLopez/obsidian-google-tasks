import type { Task } from "../helper/types";

/**
 * Query language of the ```google-tasks code block.
 *
 *   list: Lectura Pendiente, Trabajo     (default: every list)
 *   due: today, overdue                  (today | tomorrow | overdue | none | note | any | YYYY-MM-DD)
 *   sort: due desc                       (due | title | list) [asc | desc]
 *   limit: 10
 *
 * Spanish aliases are accepted for keys and values.
 */

export type SortField = "due" | "title" | "list";

export interface TaskQuery {
	lists: string[];
	due: string[];
	sortBy: SortField;
	sortDesc: boolean;
	limit: number;
	errors: string[];
}

export interface QueryDates {
	today: string; // YYYY-MM-DD
	tomorrow: string;
	noteDate: string; // date of the note holding the block
}

const KEY_ALIASES: Record<string, string> = {
	list: "list", lists: "list", lista: "list", listas: "list",
	due: "due", date: "due", fecha: "due",
	sort: "sort", order: "sort", orden: "sort",
	limit: "limit", limite: "limit",
};

const DUE_ALIASES: Record<string, string> = {
	today: "today", hoy: "today",
	tomorrow: "tomorrow", manana: "tomorrow",
	overdue: "overdue", atrasadas: "overdue", atrasada: "overdue", vencidas: "overdue",
	none: "none", "no-date": "none", "sin-fecha": "none", "sin fecha": "none",
	note: "note", nota: "note",
	any: "any", all: "any", todas: "any", cualquiera: "any",
};

const SORT_ALIASES: Record<string, SortField> = {
	due: "due", date: "due", fecha: "due",
	title: "title", titulo: "title",
	list: "list", lista: "list",
};

const normalize = (text: string): string =>
	text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const splitValues = (value: string): string[] =>
	value
		.split(",")
		.map((part) => part.trim().replace(/^["']|["']$/g, "").trim())
		.filter((part) => part.length > 0);

export function parseTaskQuery(source: string): TaskQuery {
	const query: TaskQuery = {
		lists: [],
		due: [],
		sortBy: "due",
		sortDesc: false,
		limit: 0,
		errors: [],
	};

	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith("//")) continue;

		const separator = line.indexOf(":");
		if (separator < 0) {
			query.errors.push(`Cannot read "${line}" (expected "key: value")`);
			continue;
		}

		const key = KEY_ALIASES[normalize(line.substring(0, separator))];
		const value = line.substring(separator + 1).trim();

		switch (key) {
			case "list":
				query.lists.push(...splitValues(value));
				break;
			case "due":
				for (const part of splitValues(value)) {
					const due = DUE_ALIASES[normalize(part)] ?? part;
					if (DUE_ALIASES[normalize(part)] || /^\d{4}-\d{2}-\d{2}$/.test(part)) {
						query.due.push(due);
					} else {
						query.errors.push(`Unknown due value "${part}"`);
					}
				}
				break;
			case "sort": {
				const [field, direction] = normalize(value).split(/\s+/);
				if (SORT_ALIASES[field]) {
					query.sortBy = SORT_ALIASES[field];
					query.sortDesc = direction === "desc";
				} else {
					query.errors.push(`Unknown sort field "${value}"`);
				}
				break;
			}
			case "limit": {
				const limit = parseInt(value);
				if (limit > 0) {
					query.limit = limit;
				} else {
					query.errors.push(`Invalid limit "${value}"`);
				}
				break;
			}
			default:
				query.errors.push(`Unknown option "${line.substring(0, separator).trim()}"`);
		}
	}

	return query;
}

export const listMatches = (query: TaskQuery, listTitle: string): boolean =>
	query.lists.length === 0 ||
	query.lists.some((name) => normalize(name) === normalize(listTitle));

/** Due dates are stored at noon UTC by ListAllTasks, so the date part is safe to read. */
export const taskDueDate = (task: Task): string =>
	task.due ? task.due.substring(0, 10) : "";

function dueMatches(task: Task, due: string, dates: QueryDates): boolean {
	const date = taskDueDate(task);
	switch (due) {
		case "any":
			return true;
		case "none":
			return date === "";
		case "today":
			return date === dates.today;
		case "tomorrow":
			return date === dates.tomorrow;
		case "overdue":
			return date !== "" && date < dates.today;
		case "note":
			return date === dates.noteDate;
		default:
			return date === due;
	}
}

/** Keeps the pending tasks that match the query, sorted and limited. */
export function runTaskQuery(tasks: Task[], query: TaskQuery, dates: QueryDates): Task[] {
	let result = tasks.filter((task) => task.status !== "completed");

	if (query.due.length > 0) {
		result = result.filter((task) => query.due.some((due) => dueMatches(task, due, dates)));
	}

	const direction = query.sortDesc ? -1 : 1;
	result.sort((a, b) => {
		if (query.sortBy === "title") {
			return direction * (a.title ?? "").localeCompare(b.title ?? "");
		}
		if (query.sortBy === "list") {
			return direction * (a.taskListName ?? "").localeCompare(b.taskListName ?? "");
		}
		// Tasks without a due date always go last
		const dateA = taskDueDate(a);
		const dateB = taskDueDate(b);
		if (dateA === dateB) return 0;
		if (!dateA) return 1;
		if (!dateB) return -1;
		return direction * dateA.localeCompare(dateB);
	});

	return query.limit > 0 ? result.slice(0, query.limit) : result;
}
