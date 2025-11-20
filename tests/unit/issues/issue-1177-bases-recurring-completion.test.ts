import { TaskListView } from "../../../src/bases/TaskListView";
import { KanbanView } from "../../../src/bases/KanbanView";
import { formatDateForStorage, parseDateToUTC } from "../../../src/utils/dateUtils";
import { TaskInfo } from "../../../src/types";

describe("Issue #1177: Bases recurring completion uses correct instance date", () => {
	const makePlugin = () => ({
		toggleRecurringTaskComplete: jest.fn(),
		toggleTaskStatus: jest.fn(),
		fieldMapper: {}, // Minimal stub for PropertyMappingService construction
	});

	const makeRecurringTask = (): TaskInfo => ({
		title: "Recurring task",
		status: "open",
		path: "tasks/recurring.md",
		recurrence: "RRULE:FREQ=DAILY",
		scheduled: "2025-02-10",
	});

	it("passes the scheduled date (UTC-anchored) when completing from Bases TaskListView", async () => {
		const plugin = makePlugin();
		const view = new TaskListView({}, document.createElement("div"), plugin as any);
		// Simulate view render that set currentTargetDate to "today" (different from scheduled)
		(view as any).currentTargetDate = new Date("2025-02-01T12:00:00Z");

		const task = makeRecurringTask();
		await (view as any).handleToggleStatus(task, new MouseEvent("click"));

		expect(plugin.toggleRecurringTaskComplete).toHaveBeenCalledTimes(1);
		const [, passedDate] = plugin.toggleRecurringTaskComplete.mock.calls[0];
		const dateStr = formatDateForStorage(passedDate as Date);
		expect(dateStr).toBe(formatDateForStorage(parseDateToUTC(task.scheduled!)));
	});

	it("passes the scheduled date (UTC-anchored) when completing from Bases KanbanView", async () => {
		const plugin = makePlugin();
		const view = new KanbanView({}, document.createElement("div"), plugin as any);

		const task = makeRecurringTask();
		await (view as any).handleToggleStatus(task, new MouseEvent("click"));

		expect(plugin.toggleRecurringTaskComplete).toHaveBeenCalledTimes(1);
		const [, passedDate] = plugin.toggleRecurringTaskComplete.mock.calls[0];
		const dateStr = formatDateForStorage(passedDate as Date);
		expect(dateStr).toBe(formatDateForStorage(parseDateToUTC(task.scheduled!)));
	});
});
