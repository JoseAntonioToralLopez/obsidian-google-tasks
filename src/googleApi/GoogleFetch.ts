import type GoogleTasks from "../GoogleTasksPlugin";
import { getGoogleAuthToken } from "./GoogleAuth";

const GOOGLE_TASKS_HOSTS = ["tasks.googleapis.com", "www.googleapis.com"];

export const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

/** Task and list ids come from the API or from note text; never trust them inside a URL. */
export function safeId(id: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(id ?? "")) {
		throw new Error("Google Tasks: invalid id");
	}
	return encodeURIComponent(id);
}

/** The access token must only ever be sent to the Google Tasks API over https. */
export function assertGoogleTasksUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch (error) {
		throw new Error("Google Tasks: invalid request URL");
	}
	if (
		parsed.protocol !== "https:" ||
		!GOOGLE_TASKS_HOSTS.includes(parsed.hostname) ||
		!parsed.pathname.startsWith("/tasks/v1/")
	) {
		throw new Error("Google Tasks: refusing to send the token to " + parsed.hostname);
	}
}

/** fetch() against the Google Tasks API with the login token attached. */
export async function googleFetch(
	plugin: GoogleTasks,
	url: string,
	init: RequestInit = {}
): Promise<Response> {
	assertGoogleTasksUrl(url);

	const token = await getGoogleAuthToken(plugin);
	if (!token) {
		throw new Error("Google Tasks: not logged in");
	}

	return fetch(url, {
		...init,
		headers: {
			Authorization: "Bearer " + token,
			"Content-Type": "application/json",
		},
	});
}
