import type { SortField } from "./TaskQuery";

/**
 * Keywords of the ```google-tasks query block.
 *
 * English is the reference language. Every other entry only adds aliases for
 * the same keywords, so a block can be written in the language of the vault.
 * To add a language, add an entry here: aliases are matched case-insensitively
 * and without accents, and must not clash with another language's meaning.
 */

export type QueryKey = "list" | "due" | "sort" | "limit";
export type DueKeyword = "today" | "tomorrow" | "overdue" | "none" | "note" | "any";

export interface QueryLocale {
	keys: Record<QueryKey, string[]>;
	due: Record<DueKeyword, string[]>;
	sort: Record<SortField, string[]>;
	descending: string[];
}

export const QUERY_LOCALES: Record<string, QueryLocale> = {
	en: {
		keys: {
			list: ["list", "lists"],
			due: ["due", "date"],
			sort: ["sort", "order"],
			limit: ["limit"],
		},
		due: {
			today: ["today"],
			tomorrow: ["tomorrow"],
			overdue: ["overdue"],
			none: ["none", "no date", "no-date"],
			note: ["note"],
			any: ["any", "all"],
		},
		sort: { due: ["due", "date"], title: ["title"], list: ["list"] },
		descending: ["desc", "descending"],
	},
	es: {
		keys: {
			list: ["lista", "listas"],
			due: ["fecha", "vence"],
			sort: ["orden", "ordenar"],
			limit: ["límite"],
		},
		due: {
			today: ["hoy"],
			tomorrow: ["mañana"],
			overdue: ["atrasadas", "vencidas"],
			none: ["sin fecha", "sin-fecha", "ninguna"],
			note: ["nota"],
			any: ["todas", "cualquiera"],
		},
		sort: { due: ["fecha"], title: ["título"], list: ["lista"] },
		descending: ["descendente"],
	},
	fr: {
		keys: {
			list: ["liste", "listes"],
			due: ["échéance", "date"],
			sort: ["tri", "trier"],
			limit: ["limite"],
		},
		due: {
			today: ["aujourd'hui"],
			tomorrow: ["demain"],
			overdue: ["en retard", "en-retard"],
			none: ["sans date", "sans-date", "aucune"],
			note: ["note"],
			any: ["toutes"],
		},
		sort: { due: ["échéance", "date"], title: ["titre"], list: ["liste"] },
		descending: ["décroissant"],
	},
	de: {
		keys: {
			list: ["liste", "listen"],
			due: ["fällig", "datum"],
			sort: ["sortierung", "sortieren"],
			limit: ["limit"],
		},
		due: {
			today: ["heute"],
			tomorrow: ["morgen"],
			overdue: ["überfällig"],
			none: ["ohne datum", "ohne-datum", "ohne"],
			note: ["notiz"],
			any: ["alle"],
		},
		sort: { due: ["fällig", "datum"], title: ["titel"], list: ["liste"] },
		descending: ["absteigend"],
	},
	pt: {
		keys: {
			list: ["lista", "listas"],
			due: ["data", "vencimento"],
			sort: ["ordem", "ordenar"],
			limit: ["limite"],
		},
		due: {
			today: ["hoje"],
			tomorrow: ["amanhã"],
			overdue: ["atrasadas", "vencidas"],
			none: ["sem data", "sem-data", "nenhuma"],
			note: ["nota"],
			any: ["todas", "qualquer"],
		},
		sort: { due: ["data"], title: ["título"], list: ["lista"] },
		descending: ["decrescente"],
	},
	it: {
		keys: {
			list: ["lista", "liste"],
			due: ["scadenza", "data"],
			sort: ["ordine", "ordina"],
			limit: ["limite"],
		},
		due: {
			today: ["oggi"],
			tomorrow: ["domani"],
			overdue: ["scadute", "in ritardo", "in-ritardo"],
			none: ["senza data", "senza-data", "nessuna"],
			note: ["nota"],
			any: ["tutte"],
		},
		sort: { due: ["scadenza", "data"], title: ["titolo"], list: ["lista"] },
		descending: ["decrescente"],
	},
};

/** Lower case, no accents: "Mañana" and "manana" are the same keyword. */
export const normalizeKeyword = (text: string): string =>
	text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function buildLookup<T extends string>(
	pick: (locale: QueryLocale) => Record<T, string[]>
): Record<string, T> {
	const lookup: Record<string, T> = {};
	for (const locale of Object.values(QUERY_LOCALES)) {
		const group = pick(locale);
		for (const keyword of Object.keys(group) as T[]) {
			for (const alias of group[keyword]) {
				lookup[normalizeKeyword(alias)] = keyword;
			}
		}
	}
	return lookup;
}

export const KEY_LOOKUP = buildLookup<QueryKey>((locale) => locale.keys);
export const DUE_LOOKUP = buildLookup<DueKeyword>((locale) => locale.due);
export const SORT_LOOKUP = buildLookup<SortField>((locale) => locale.sort);
export const DESCENDING = new Set(
	Object.values(QUERY_LOCALES).flatMap((locale) => locale.descending.map(normalizeKeyword))
);
