import type { App } from "obsidian";

/**
 * Storage for the Google login.
 *
 * Secrets go to Obsidian's secret storage (Obsidian 1.11.4+), which keeps them
 * out of the vault and out of plain localStorage. On older versions, or if the
 * secret storage rejects a write, they fall back to localStorage as before.
 */

interface SecretStore {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

interface SecretKey {
	local: string; // legacy localStorage key
	secret: string; // secret storage id (lowercase alphanumeric with dashes)
}

const ACCESS_TOKEN: SecretKey = {
	local: "googleTaskAccessToken",
	secret: "google-tasks-access-token",
};
const REFRESH_TOKEN: SecretKey = {
	local: "googleTaskRefreshToken",
	secret: "google-tasks-refresh-token",
};
const CLIENT_SECRET: SecretKey = {
	local: "googleTaskClientSecret",
	secret: "google-tasks-client-secret",
};
const EXPIRATION_TIME = "googleTaskExpirationTime";

let secrets: SecretStore | null = null;

/** Call once when the plugin loads. Moves tokens left in localStorage by older versions. */
export const initTokenStore = (app: App): void => {
	const storage = (app as unknown as { secretStorage?: SecretStore }).secretStorage;
	secrets =
		storage &&
		typeof storage.getSecret === "function" &&
		typeof storage.setSecret === "function"
			? storage
			: null;

	if (!secrets) return;

	for (const key of [ACCESS_TOKEN, REFRESH_TOKEN]) {
		const legacy = window.localStorage.getItem(key.local);
		if (legacy) {
			writeSecret(key, legacy);
		}
	}
};

export const hasSecretStorage = (): boolean => secrets !== null;

const readSecret = (key: SecretKey): string => {
	// A value in localStorage means the secret storage could not be written: it wins
	const local = window.localStorage.getItem(key.local);
	if (local !== null) return local;

	if (secrets) {
		try {
			return secrets.getSecret(key.secret) ?? "";
		} catch (error) {
			console.error("Google Tasks: could not read from the secret storage");
		}
	}
	return "";
};

const writeSecret = (key: SecretKey, value: string): void => {
	if (secrets) {
		try {
			secrets.setSecret(key.secret, value);
			if ((secrets.getSecret(key.secret) ?? "") === value) {
				window.localStorage.removeItem(key.local);
				return;
			}
		} catch (error) {
			console.error("Google Tasks: could not write to the secret storage");
		}
	}
	window.localStorage.setItem(key.local, value);
};

//===================
//GETTER
//===================

/**
 * getAccessToken
 * @returns googleAccessToken
 */
export const getAT = (): string => readSecret(ACCESS_TOKEN);

/**
 * getRefreshToken
 * @returns googleRefreshToken
 */
export const getRT = (): string => readSecret(REFRESH_TOKEN);

/**
 * OAuth client secret kept in the secret storage ("" if it is not there)
 */
export const getClientSecret = (): string => readSecret(CLIENT_SECRET);

/**
 * getExpirationTime from LocalStorage
 * @returns googleExpirationTime
 */
export const getET = (): number => {
	const expirationTimeString =
		window.localStorage.getItem(EXPIRATION_TIME) ?? "0";
	return parseInt(expirationTimeString, 10);
};

//===================
//SETTER
//===================

export const setAT = (googleAccessToken: string) => {
	writeSecret(ACCESS_TOKEN, googleAccessToken ?? "");
};

export const setRT = (googleRefreshToken: string) => {
	writeSecret(REFRESH_TOKEN, googleRefreshToken ?? "");
};

export const setClientSecret = (clientSecret: string) => {
	writeSecret(CLIENT_SECRET, clientSecret ?? "");
};

/**
 * set ExpirationTime in LocalStorage
 */
export const setET = (googleExpirationTime: number) => {
	window.localStorage.setItem(EXPIRATION_TIME, googleExpirationTime + "");
};
