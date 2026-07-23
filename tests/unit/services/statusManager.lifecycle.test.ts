import { StatusManager } from "../../../src/services/StatusManager";
import { StatusConfig, StatusCategory } from "../../../src/types";
import { normalizeStatusCategories, DEFAULT_STATUSES } from "../../../src/settings/defaults";

const createStatus = (
	value: string,
	overrides: Partial<StatusConfig> = {}
): StatusConfig => ({
	id: value,
	value,
	label: value,
	color: "#808080",
	isCompleted: value === "done",
	order: 0,
	autoArchive: false,
	autoArchiveDelay: 5,
	...overrides,
});

describe("StatusManager status lifecycle", () => {
	describe("isCompletedStatus characterization (must stay unchanged)", () => {
		it("keeps the default statuses' completion behavior", () => {
			const manager = new StatusManager(DEFAULT_STATUSES);
			expect(manager.isCompletedStatus("done")).toBe(true);
			expect(manager.isCompletedStatus("open")).toBe(false);
			expect(manager.isCompletedStatus("in-progress")).toBe(false);
			expect(manager.isCompletedStatus("none")).toBe(false);
		});
	});

	describe("normalizeStatusCategories migration", () => {
		it("derives category 'completed' only for statuses already flagged isCompleted", () => {
			const [done] = normalizeStatusCategories([createStatus("done", { isCompleted: true })]);
			expect(done.category).toBe("completed");
			expect(done.isCompleted).toBe(true);
		});

		it("leaves a non-completed status uncategorized (category absent), isCompleted unchanged", () => {
			const [open] = normalizeStatusCategories([createStatus("open", { isCompleted: false })]);
			expect(open.category).toBeUndefined();
			expect(open.isCompleted).toBe(false);
		});

		it("leaves a status that already carries a category as-is", () => {
			const [inProgress] = normalizeStatusCategories([
				createStatus("doing", { isCompleted: false, category: "in-progress" }),
			]);
			expect(inProgress.category).toBe("in-progress");
			expect(inProgress.isCompleted).toBe(false);
		});

		it("enforces isCompleted for the completed case (category 'completed' implies isCompleted)", () => {
			const [finished] = normalizeStatusCategories([
				createStatus("shipped", { isCompleted: false, category: "completed" }),
			]);
			expect(finished.category).toBe("completed");
			expect(finished.isCompleted).toBe(true);
		});

		it("reconciles a completed status carrying a non-completed category to completed", () => {
			const [status] = normalizeStatusCategories([
				createStatus("legacy", { isCompleted: true, category: "planned" }),
			]);
			expect(status.category).toBe("completed");
			expect(status.isCompleted).toBe(true);
		});

		it("is idempotent", () => {
			const once = normalizeStatusCategories(DEFAULT_STATUSES);
			const twice = normalizeStatusCategories(once);
			expect(twice).toEqual(once);
		});
	});

	describe("isStarted / isFinished predicates", () => {
		const buildManager = () =>
			new StatusManager([
				createStatus("planned", { category: "planned", isCompleted: false }),
				createStatus("uncategorized", { isCompleted: false }),
				createStatus("doing", { category: "in-progress", isCompleted: false }),
				createStatus("done", { category: "completed", isCompleted: true }),
			]);

		it("isStarted is true for in-progress and completed, false for planned and uncategorized", () => {
			const manager = buildManager();
			expect(manager.isStarted("doing")).toBe(true);
			expect(manager.isStarted("done")).toBe(true);
			expect(manager.isStarted("planned")).toBe(false);
			expect(manager.isStarted("uncategorized")).toBe(false);
		});

		it("isFinished is true only for completed and equals isCompleted for every status", () => {
			const manager = buildManager();
			for (const value of ["planned", "uncategorized", "doing", "done"]) {
				expect(manager.isFinished(value)).toBe(manager.isCompletedStatus(value));
			}
			expect(manager.isFinished("done")).toBe(true);
			expect(manager.isFinished("doing")).toBe(false);
		});

		it("getCategory returns the configured category or undefined when uncategorized", () => {
			const manager = buildManager();
			expect(manager.getCategory("doing")).toBe<StatusCategory>("in-progress");
			expect(manager.getCategory("uncategorized")).toBeUndefined();
		});

		it("treats an unknown status as neither started nor finished", () => {
			const manager = buildManager();
			expect(manager.isStarted("missing")).toBe(false);
			expect(manager.isFinished("missing")).toBe(false);
		});
	});
});
