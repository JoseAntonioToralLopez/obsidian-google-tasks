/* eslint-disable @typescript-eslint/no-var-requires */
import type GoogleTasks from "../GoogleTasksPlugin";
import {
	settingsAreComplete,
	settingsAreCompleteAndLoggedIn,
} from "../view/GoogleTasksSettingTab";
import {
	getAT,
	getET,
	getRT,
	setAT,
	setET,
	setRT,
} from "../helper/LocalStorage";
import { Notice, Platform } from "obsidian";

export async function getGoogleAuthToken(plugin: GoogleTasks): Promise<string> {
	if (!settingsAreCompleteAndLoggedIn(plugin)) return;

	if (
		getET() == 0 ||
		getET() == undefined ||
		isNaN(getET()) ||
		getET() < +new Date()
	) {
		if (getRT() != "") {
			const refreshBody = {
				client_id: plugin.settings.googleClientId,
				client_secret: plugin.settings.googleClientSecret,
				grant_type: "refresh_token",
				refresh_token: getRT(),
			};
			const response = await fetch("https://oauth2.googleapis.com/token",
				{
					method: "POST",
					body: JSON.stringify(refreshBody),
				}
			);

			const tokenData = await response.json();

			if (!response.ok || !tokenData.access_token) {
				// Keep the old values instead of storing "undefined" as a token
				console.error(
					"Google Tasks: could not refresh the access token",
					response.status,
					tokenData.error
				);
				return;
			}

			setAT(tokenData.access_token);
			// expires_in is in seconds; renew one minute early
			setET(+new Date() + (tokenData.expires_in - 60) * 1000);
		}
	}

	return getAT();
}

export async function LoginGoogle(plugin: GoogleTasks) {
	if (Platform.isDesktop) {
		if (!settingsAreComplete(plugin)) return;
		const { OAuth2Client } = require("google-auth-library");
		const http = require("http");
		const open = require("open");
		const url = require("url");
		const destroyer = require("server-destroy");
		const oAuth2Client = new OAuth2Client(
			plugin.settings.googleClientId,
			plugin.settings.googleClientSecret,
			"http://127.0.0.1:42813/callback"
		);
		// Random value echoed back by Google, so a callback we did not start is rejected
		const state = require("crypto").randomBytes(32).toString("hex");
		const authorizeUrl = oAuth2Client.generateAuthUrl({
			scope: "https://www.googleapis.com/auth/tasks",
			access_type: "offline",
			prompt: "consent",
			state,
		});

		const server = http
			.createServer(async (req: any, res: any) => {
				try {
					if (req.url.indexOf("/callback") > -1) {
						// acquire the code from the querystring, and close the web server.
						const qs = new url.URL(
							req.url,
							"http://localhost:42813"
						).searchParams;
						const code = qs.get("code");
						if (!code || qs.get("state") !== state) {
							res.statusCode = 400;
							res.end("Authentication failed. Please try again from obsidian.");
							server.destroy();
							new Notice("Google Tasks: login was cancelled or rejected");
							return;
						}
						res.end(
							"Authentication successful! Please return to obsidian."
						);
						server.destroy();

						// Now that we have the code, use that to acquire tokens.
						const r = await oAuth2Client.getToken(code);

						setRT(r.tokens.refresh_token);
						setAT(r.tokens.access_token);
						setET(r.tokens.expiry_date);

						console.info("Tokens acquired.");
					}
				} catch (e) {
					console.error("Error getting Tokens.");
				}
			})
			// Loopback only: the callback must not be reachable from the network
			.listen(42813, "127.0.0.1", () => {
				// open the browser to the authorize url to start the workflow
				open(authorizeUrl, { wait: false }).then((cp: any) =>
					cp.unref()
				);
			});

		destroyer(server);

		server.on("error", (error: any) => {
			console.error("Google Tasks: login server error", error.code);
			new Notice("Google Tasks: could not start the login (port 42813 in use?)");
		});

		// Do not leave the port open if the login is never finished
		const loginTimeout = setTimeout(() => server.destroy(), 5 * 60 * 1000);
		server.on("close", () => clearTimeout(loginTimeout));
	} else {
		new Notice("Can't use OAuth on this device");
	}
}
