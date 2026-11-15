import { MarkdownRenderChild, Notice, setIcon } from "obsidian";
import type GoogleTasks from "../GoogleTasksPlugin";
import type { Task } from "../helper/types";
import { googleFetch } from "../googleApi/GoogleFetch";
import { getAllTaskLists, getAllTasksFromList } from "../googleApi/ListAllTasks";
import { settingsAreCompleteAndLoggedIn } from "./GoogleTasksSettingTab";
import {
	listMatches,
	parseTaskQuery,
	runTaskQuery,
	taskDueDate,
	TaskQuery,
} from "../query/TaskQuery";

export const TASK_QUERY_BLOCK = "google-tasks";

/** Marks a task as completed in Google. Unlike GoogleCompleteTask it reports HTTP errors. */
async function completeTask(plugin: GoogleTasks, task: Task): Promise<boolean> {
	for (const child of task.children ?? []) {
		if (child.status !== "completed" && !(await completeTask(plugin, child))) {
			return false;
		}
	}

	try {
		const response = await googleFetch(plugin, task.selfLink, {
			method: "PATCH",
			body: JSON.stringify({ status: "completed" }),
		});
		return response.ok;
	} catch (error) {
		console.error(error);
		return false;
	}
}

class TaskQueryBlock extends MarkdownRenderChild {
	private query: TaskQuery;
	private busy = 0;
	private heading = "Google Tasks";

	constructor(
		containerEl: HTMLElement,
		private plugin: GoogleTasks,
		source: string,
		private sourcePath: string
	) {
		super(containerEl);
		this.query = parseTaskQuery(source);
	}

	onload() {
		this.containerEl.addClass("googleTaskQuery");
		this.refresh();

		const seconds = this.plugin.settings.refreshInterval;
		if (seconds > 0) {
			this.registerInterval(
				window.setInterval(() => this.refresh(), Math.max(seconds, 10) * 1000)
			);
		}
	}

	/** Date in the file name of the note (daily notes), today otherwise. */
	private noteDate(): string {
		const name = this.sourcePath.split("/").pop() ?? "";
		const match = name.match(/\d{4}-\d{2}-\d{2}/);
		return match ? match[0] : window.moment().format("YYYY-MM-DD");
	}

	private showMessage(text: string, isError = false) {
		this.containerEl.empty();
		this.containerEl.createDiv({
			text,
			cls: isError ? "googleTaskQueryError" : "googleTaskQueryEmpty",
		});
	}

	private async fetchTasks(): Promise<Task[]> {
		const taskLists = (await getAllTaskLists(this.plugin)) ?? [];
		const wanted = taskLists.filter((list) => listMatches(this.query, list.title));

		if (wanted.length === 0) {
			const names = taskLists.map((list) => list.title).join(", ");
			throw new Error(
				taskLists.length === 0
					? "Could not load the Google task lists"
					: `No list named "${this.query.lists.join(", ")}". Available: ${names}`
			);
		}

		// Heading of the block: the real list names, or a generic one for "every list"
		this.heading =
			this.query.lists.length > 0
				? wanted.map((list) => list.title).join(", ")
				: "Google Tasks";

		const perList = await Promise.all(
			wanted.map(async (list) => {
				const tasks = await getAllTasksFromList(this.plugin, list.id);
				tasks.forEach((task) => (task.taskListName = list.title));
				return tasks;
			})
		);
		return perList.flat();
	}

	async refresh() {
		// Never repaint while a completion is being sent to Google
		if (this.busy > 0) return;

		if (this.query.errors.length > 0) {
			this.showMessage(this.query.errors.join("\n"), true);
			return;
		}
		if (!settingsAreCompleteAndLoggedIn(this.plugin, false)) {
			this.showMessage("Google Tasks missing settings or not logged in", true);
			return;
		}

		let tasks: Task[];
		try {
			tasks = runTaskQuery(await this.fetchTasks(), this.query, {
				today: window.moment().format("YYYY-MM-DD"),
				tomorrow: window.moment().add(1, "day").format("YYYY-MM-DD"),
				noteDate: this.noteDate(),
			});
		} catch (error) {
			this.showMessage(error.message, true);
			return;
		}

		if (this.busy > 0) return;
		this.render(tasks);
	}

	private render(tasks: Task[]) {
		this.containerEl.empty();

		const header = this.containerEl.createDiv({ cls: "googleTaskQueryHeader" });
		header.createSpan({ text: `${this.heading} (${tasks.length})`, cls: "googleTaskQueryHeading" });
		const refreshButton = header.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": "Refresh" },
		});
		setIcon(refreshButton, "refresh-cw");
		refreshButton.addEventListener("click", () => this.refresh());

		if (tasks.length === 0) {
			this.containerEl.createDiv({ text: "No pending tasks", cls: "googleTaskQueryEmpty" });
			return;
		}

		const listEl = this.containerEl.createEl("ul", { cls: "googleTaskQueryList" });
		tasks.forEach((task) => this.renderTask(listEl, task, true));
	}

	private renderTask(parentEl: HTMLElement, task: Task, showList: boolean) {
		const itemEl = parentEl.createEl("li", { cls: "googleTaskQueryItem" });
		const rowEl = itemEl.createEl("label", { cls: "googleTaskQueryRow" });

		// Not "task-list-item-checkbox": the plugin's global click handler would grab it
		const checkbox = rowEl.createEl("input", {
			type: "checkbox",
			cls: "googleTaskQueryCheckbox",
		});
		rowEl.createSpan({ text: task.title || "(untitled)", cls: "googleTaskQueryTitle" });
		if (task.notes) rowEl.setAttribute("title", task.notes);

		const date = taskDueDate(task);
		if (date) {
			const overdue = date < window.moment().format("YYYY-MM-DD");
			rowEl.createSpan({
				text: date,
				cls: "googleTaskQueryMeta" + (overdue ? " googleTaskOverDue" : ""),
			});
		}
		if (showList && !(this.query.lists.length === 1) && task.taskListName) {
			rowEl.createSpan({ text: task.taskListName, cls: "googleTaskQueryMeta" });
		}

		checkbox.addEventListener("change", async () => {
			if (!checkbox.checked) return;
			checkbox.disabled = true;
			this.busy++;
			const done = await completeTask(this.plugin, task);
			this.busy--;

			if (!done) {
				checkbox.checked = false;
				checkbox.disabled = false;
				new Notice(`Could not complete "${task.title}" in Google Tasks`);
				return;
			}
			itemEl.remove();
			if (this.busy === 0) this.refresh();
		});

		const children = (task.children ?? []).filter((child) => child.status !== "completed");
		if (children.length > 0) {
			const childrenEl = itemEl.createEl("ul", { cls: "googleTaskQueryList" });
			children.forEach((child) => this.renderTask(childrenEl, child, false));
		}
	}
}

export function registerTaskQueryBlock(plugin: GoogleTasks) {
	plugin.registerMarkdownCodeBlockProcessor(TASK_QUERY_BLOCK, (source, el, ctx) => {
		ctx.addChild(new TaskQueryBlock(el, plugin, source, ctx.sourcePath));
	});
}
