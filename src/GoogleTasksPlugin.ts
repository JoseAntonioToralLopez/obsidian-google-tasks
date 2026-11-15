import { getRT } from './helper/LocalStorage';
import { Editor, MarkdownView, Plugin, WorkspaceLeaf, moment, Notice, TFile } from "obsidian";
import type { GoogleTasksSettings } from "./helper/types";
import { getAllUncompletedTasksOrderdByDue, getOneTaskById } from "./googleApi/ListAllTasks";
import {
	GoogleCompleteTaskById,
	GoogleUnCompleteTaskById,
} from "./googleApi/GoogleCompleteTask";
import { CreateTaskModal } from "./modal/CreateTaskModal";
import { GoogleTaskView, VIEW_TYPE_GOOGLE_TASK } from "./view/GoogleTaskView";
import { TaskListModal } from "./modal/TaskListModal";
import {
	GoogleTasksSettingTab,
	settingsAreCompleteAndLoggedIn,
} from "./view/GoogleTasksSettingTab";
import { taskToList } from './helper/TaskToList';
import { SelectInsertTaskModal } from './modal/SelectInsertTaskModal';
import { registerTaskQueryBlock, TASK_QUERY_BLOCK } from './view/TaskQueryBlock';

const DEFAULT_SETTINGS: GoogleTasksSettings = {
	googleRefreshToken: "",
	googleClientId: "",
	googleClientSecret: "",
	askConfirmation: true,
	refreshInterval: 60,
	showNotice: true,
};

export default class GoogleTasks extends Plugin {
	settings: GoogleTasksSettings;
	plugin: GoogleTasks;
	showHidden = false;
	initView = async () => {
		if (
			this.app.workspace.getLeavesOfType(VIEW_TYPE_GOOGLE_TASK).length ===
			0
		) {
			await this.app.workspace.getRightLeaf(false).setViewState({
				type: VIEW_TYPE_GOOGLE_TASK,
			});
		}
		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_GOOGLE_TASK).first()
		);
	};

	onLayoutReady = async () => {
		// Sync the checkbox state of inserted tasks ("- [ ] ... %%id%%") when a note is opened
		this.registerEvent(
			this.app.workspace.on("file-open", async (file: TFile) => {
				if (!file || file.extension !== "md") return;
				if (!settingsAreCompleteAndLoggedIn(this, false)) return;

				const content = await this.app.vault.cachedRead(file);
				if (!content.includes("%%")) return;

				const matches = [...content.matchAll(/\- \[[ xX]\] .* %%[A-Za-z0-9]{22}%%/g)];
				const changes = new Map<string, string>();

				for (const match of matches) {
					const oldLine = match[0];
					const id = oldLine.match(/%%[A-Za-z0-9]{22}%%/)[0].slice(2, -2);
					try {
						const task = await getOneTaskById(this, id);
						if (!task) continue;

						const newLine =
							task.status === "completed"
								? oldLine.replace("- [ ] ", "- [x] ")
								: oldLine.replace("- [x] ", "- [ ] ");
						if (newLine !== oldLine) {
							changes.set(oldLine, newLine);
						}
					} catch (err) {
						console.error(err);
						return;
					}
				}

				if (changes.size === 0) return;

				// Apply on the current content so edits made meanwhile are not overwritten
				await this.app.vault.process(file, (data) => {
					changes.forEach((newLine, oldLine) => {
						data = data.replace(oldLine, () => newLine);
					});
					return data;
				});
			})
		);
	};

	async onload() {
		await this.loadSettings();
		this.plugin = this;
		this.app.workspace.onLayoutReady(this.onLayoutReady);

		this.registerView(
			VIEW_TYPE_GOOGLE_TASK,
			(leaf: WorkspaceLeaf) => new GoogleTaskView(leaf, this)
		);

		// Live ```google-tasks query blocks (e.g. inside daily notes)
		registerTaskQueryBlock(this);

		this.addCommand({
			id: "insert-google-tasks-query",
			name: "Insert Google Tasks query block",
			editorCallback: (editor: Editor) => {
				editor.replaceSelection(
					"```" + TASK_QUERY_BLOCK + "\nlist: \ndue: today, overdue\nsort: due\n```\n"
				);
			},
		});

		this.addRibbonIcon(
			"check-in-circle",
			"Google Tasks",
			(evt: MouseEvent) => {
				this.initView();
			}
		);

		this.registerDomEvent(document, "click", (event) => {
			if (!(event.target instanceof HTMLInputElement)) {
				return;
			}

			const checkPointElement = event.target as HTMLInputElement;
			if (
				!checkPointElement.classList.contains("task-list-item-checkbox")
			)
				return;

			const idElement = checkPointElement.parentElement?.parentElement?.querySelectorAll(
				".cm-comment.cm-list-1"
			)[1] as HTMLElement;

			// Ordinary checkboxes have no task id comment next to them
			const taskId = idElement?.textContent ?? "";
			if (!/^[A-Za-z0-9_-]{10,}$/.test(taskId)) return;

			if (!settingsAreCompleteAndLoggedIn(this, false)) return;

			if (checkPointElement.checked) {
				GoogleCompleteTaskById(this, taskId);
			} else {
				GoogleUnCompleteTaskById(this, taskId);
			}
		});

		const createTodoListModal = async () => {
			const list = await getAllUncompletedTasksOrderdByDue(this);

			new TaskListModal(this, list).open();
		};

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "list-google-tasks",
			name: "List Google Tasks",
			checkCallback: (checking: boolean) => {
				const canRun = settingsAreCompleteAndLoggedIn(this.plugin, false);

				if (checking) {
					return canRun;
				}
				if (!canRun) {
					return;
				}
				createTodoListModal();
			},
		});

		//Create a new task command
		this.addCommand({
			id: "create-google-task",
			name: "Create Google Tasks",

			checkCallback: (checking: boolean) => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				new CreateTaskModal(this).open();
			},
		});

		//Create a new task command
		this.addCommand({
			id: "create-google-task-with-insert",
			name: "Create Google Tasks and insert it",
			editorCheckCallback: (checking, editor, view): boolean => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				new CreateTaskModal(this, editor).open();
			}
		});

		const writeTodoIntoFile = async (editor: Editor) => {
			const tasks = await getAllUncompletedTasksOrderdByDue(this);
			tasks.forEach((task) => {
				editor.replaceRange(
					taskToList(task),
					editor.getCursor()
				);
			});
		};

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "insert-uncompleted-google-tasks",
			name: "Insert Uncompleted Google Tasks",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				view: MarkdownView
			): boolean => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				writeTodoIntoFile(editor);
			},
		});


		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "insert-google-tasks",
			name: "Insert Google Tasks",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				view: MarkdownView
			): boolean => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				new SelectInsertTaskModal(this, editor).open();
			},
		});


		//Copy Refresh token to clipboard
		this.addCommand({
			id: "copy-google-refresh-token",
			name: "Copy Google Refresh Token to Clipboard",

			callback: () => {
				const token = getRT();
				if(token == undefined || token == ''){
					new Notice("No Refresh Token. Please Login.")
					return;
				}

				navigator.clipboard.writeText(token).then(function() {
					new Notice("Token copied")
				}, function(err) {
					new Notice("Could not copy token")
				});
				
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GoogleTasksSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_GOOGLE_TASK);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
