import { googleFetch } from "./GoogleFetch";
import type GoogleTasks from "../GoogleTasksPlugin";
import { createNotice } from "src/helper/NoticeHelper";

export async function DeleteGoogleTask(
	plugin: GoogleTasks,
	selfLink: string,
	showNotice = true
): Promise<boolean> {
	try {
		const response = await googleFetch(plugin, selfLink,
			{
				method: "DELETE",
			}
		);
		if (response.status == 204) {
			if (showNotice) {
				createNotice(plugin, "Task updated");
			}
			return true;
		} else {
			return false;
		}
	} catch (error) {
		console.error(error);
		return false;
	}
}
