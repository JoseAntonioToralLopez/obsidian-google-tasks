import type GoogleTasksPlugin from "../GoogleTasksPlugin";
import type { Task } from "../helper/types";
import { googleFetch } from "./GoogleFetch";
import { getOneTaskById } from "./ListAllTasks";
import { createNotice } from "src/helper/NoticeHelper";

//=======================================
//Complete the tasks
//=======================================

export async function GoogleCompleteTask(
	plugin: GoogleTasksPlugin,
	task: Task
): Promise<boolean> {

	task.children?.forEach(subTask => GoogleCompleteTask(plugin,subTask))

	task.status = "completed";
	task.completed = new Date().toISOString();
	delete task.taskListName;

	try {
		const response = await googleFetch(plugin, task.selfLink,
			{
				method: "PUT",
				body: JSON.stringify(task),
			}
		);
		if (!response.ok) {
			throw new Error("HTTP " + response.status);
		}
	} catch (error) {
		console.error(error);
		createNotice(plugin, "Could not complete task");
		return false;
	}
	return true;
}

export async function GoogleCompleteTaskById(
	plugin: GoogleTasksPlugin,
	taskId: string
): Promise<boolean> {
	const task = await getOneTaskById(plugin, taskId);
	return await GoogleCompleteTask(plugin, task);
}

//=======================================
//Uncomplete the tasks
//=======================================

export async function GoogleUnCompleteTask(
	plugin: GoogleTasksPlugin,
	task: Task
): Promise<boolean> {

	task.status = "needsAction";
	delete task.completed;
	delete task.taskListName;

	try {
		const response = await googleFetch(plugin, task.selfLink,
			{
				method: "PUT",
				body: JSON.stringify(task),
			}
		);
		if (!response.ok) {
			throw new Error("HTTP " + response.status);
		}
	} catch (error) {
		console.error(error);
		createNotice(plugin, "Could not uncomplete task");
		return false;
	}

	task.children?.forEach(subTask => GoogleUnCompleteTask(plugin,subTask))

	return true;
}

export async function GoogleUnCompleteTaskById(
	plugin: GoogleTasksPlugin,
	taskId: string
): Promise<boolean> {
	const task = await getOneTaskById(plugin, taskId);
	return await GoogleUnCompleteTask(plugin, task);
}
