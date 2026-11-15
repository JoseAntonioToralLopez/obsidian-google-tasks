import { googleFetch, TASKS_API } from "./GoogleFetch";
import type GoogleTasks from "../GoogleTasksPlugin";
import { GoogleTaskView, VIEW_TYPE_GOOGLE_TASK } from "../view/GoogleTaskView";
import type { Task, TaskInput } from "../helper/types";
import { createNotice } from "src/helper/NoticeHelper";

export async function CreateGoogleTask(
	plugin: GoogleTasks,
	taskInput: TaskInput
) : Promise<Task>{
	const createBody = {
		title: taskInput.title,
		notes: taskInput.details,
		due: taskInput.due,
	};

	if (taskInput.due) {
		createBody.due = new Date(taskInput.due).toISOString();
	}
	try {
		const response = await googleFetch(plugin, 
			`${TASKS_API}/lists/${encodeURIComponent(taskInput.taskListId)}/tasks`,
			{
				method: "POST",
				body: JSON.stringify(createBody),
			}
		);
		if (response.status == 200) {
			createNotice(plugin, "New task created");

			const task = await response.json();
			if(task.due){
				task.due = window.moment(task.due).add(12, "hour").toISOString();
			}
			
			plugin.app.workspace
				.getLeavesOfType(VIEW_TYPE_GOOGLE_TASK)
				.forEach((leaf) => {
					if (leaf.view instanceof GoogleTaskView) {
						leaf.view.addTodo(task);
						leaf.view.loadTaskView();
					}
				});
			return task;
		}
	} catch (error) {
		console.error(error);
	}

}

export async function CreateGoogleTaskFromOldTask(
	plugin: GoogleTasks,
	newTask: Task
): Promise<boolean> {
	const listId = newTask.parent;
	delete newTask.parent;

	if (newTask.due) {
		newTask.due = new Date(newTask.due).toISOString();
	}

	try {
		const response = await googleFetch(plugin, 
			`${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`,
			{
				method: "POST",
				body: JSON.stringify(newTask),
			}
		);
		if (response.status == 200) {
			createNotice(plugin, "Task updated");
			await response.json();

			plugin.app.workspace
				.getLeavesOfType(VIEW_TYPE_GOOGLE_TASK)
				.forEach((leaf) => {
					if (leaf.view instanceof GoogleTaskView) {
						leaf.view.onOpen();
					}
				});
			return true;
		}
	} catch (error) {
		console.error(error);
	}
	return false;
}
