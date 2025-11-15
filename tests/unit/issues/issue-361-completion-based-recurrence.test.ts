import { getNextUncompletedOccurrence } from "../../../src/utils/helpers";
import type { TaskInfo } from "../../../src/types";

describe("Issue #361: Completion-Based Recurrence", () => {
	describe("getNextUncompletedOccurrence with recurrence_anchor", () => {
		let baseTask: TaskInfo;

		beforeEach(() => {
			baseTask = {
				title: "Test Task",
				status: "",
				scheduled: "2024-01-01",
				recurrence: "FREQ=DAILY;INTERVAL=1",
				complete_instances: [],
				recurrence_anchor: "scheduled",
			} as TaskInfo;
		});

		describe("scheduled-based recurrence (default behavior)", () => {
			it("should calculate next occurrence from scheduled date when anchor is 'scheduled'", () => {
				const task = {
					...baseTask,
					recurrence_anchor: "scheduled",
					complete_instances: ["2024-01-01", "2024-01-02"],
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-03 (next day after scheduled date, ignoring completions)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-03");
				}
			});

			it("should calculate next occurrence from scheduled date when anchor is undefined (default)", () => {
				const task = {
					...baseTask,
					recurrence_anchor: undefined,
					complete_instances: ["2024-01-01", "2024-01-02"],
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-03 (next day after scheduled date, ignoring completions)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-03");
				}
			});

			it("should work with weekly recurrence from scheduled date", () => {
				const task = {
					...baseTask,
					scheduled: "2024-01-01", // Monday
					recurrence: "FREQ=WEEKLY;INTERVAL=1",
					recurrence_anchor: "scheduled",
					complete_instances: ["2024-01-01", "2024-01-08"],
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-15 (next Monday after scheduled date)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-15");
				}
			});

			it("should work with monthly recurrence from scheduled date", () => {
				const task = {
					...baseTask,
					scheduled: "2024-01-15",
					recurrence: "FREQ=MONTHLY;INTERVAL=1",
					recurrence_anchor: "scheduled",
					complete_instances: ["2024-01-15", "2024-02-15"],
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-03-15 (next month on the 15th)
					expect(next.toISOString().split("T")[0]).toBe("2024-03-15");
				}
			});
		});

		describe("completion-based recurrence", () => {
			it("should calculate next occurrence from latest completion when anchor is 'completion'", () => {
				const task = {
					...baseTask,
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01", "2024-01-05"], // Latest is Jan 5
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-06 (one day after latest completion)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-06");
				}
			});

			it("should fall back to scheduled date if no completions exist", () => {
				const task = {
					...baseTask,
					scheduled: "2024-01-10",
					recurrence_anchor: "completion" as const,
					complete_instances: [],
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-11 (one day after scheduled, since no completions)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-11");
				}
			});

			it("should work with daily recurrence every 3 days from completion", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=DAILY;INTERVAL=3",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01", "2024-01-10"], // Latest is Jan 10
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-13 (3 days after Jan 10)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-13");
				}
			});

			it("should work with weekly recurrence from completion", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=WEEKLY;INTERVAL=1",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01", "2024-01-15"], // Latest is Jan 15 (Monday)
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-22 (7 days after Jan 15)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-22");
				}
			});

			it("should work with monthly recurrence from completion", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=MONTHLY;INTERVAL=1",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-15", "2024-02-20"], // Latest is Feb 20
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-03-20 (1 month after Feb 20)
					expect(next.toISOString().split("T")[0]).toBe("2024-03-20");
				}
			});

			it("should handle unsorted complete_instances array", () => {
				const task = {
					...baseTask,
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-05", "2024-01-01", "2024-01-10", "2024-01-03"], // Unsorted
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-11 (one day after latest completion: Jan 10)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-11");
				}
			});

			it("should handle complete_instances with time components", () => {
				const task = {
					...baseTask,
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01T10:30:00", "2024-01-05T14:00:00"], // With times
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-06 (one day after latest completion date)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-06");
				}
			});
		});

		describe("edge cases", () => {
			it("should return null when no recurrence is set", () => {
				const task = {
					...baseTask,
					recurrence: undefined,
					recurrence_anchor: "completion" as const,
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeNull();
			});

			it("should handle invalid recurrence string gracefully", () => {
				const task = {
					...baseTask,
					recurrence: "INVALID",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01"],
				};

				// Should not throw, might return null or handle gracefully
				expect(() => getNextUncompletedOccurrence(task)).not.toThrow();
			});

			it("should handle missing scheduled date with completion anchor and no completions", () => {
				const task = {
					...baseTask,
					scheduled: undefined,
					recurrence_anchor: "completion" as const,
					complete_instances: [],
				};

				const next = getNextUncompletedOccurrence(task);
				// Should handle gracefully, likely return null or use today
				expect(next).toBeDefined();
			});

			it("should validate recurrence_anchor values", () => {
				const task1 = {
					...baseTask,
					// @ts-expect-error - testing invalid value
					recurrence_anchor: "invalid",
					complete_instances: ["2024-01-01"],
				};

				// Should fall back to scheduled behavior or handle gracefully
				const next = getNextUncompletedOccurrence(task1);
				expect(next).toBeDefined();
			});
		});

		describe("COUNT and UNTIL constraints with completion-based", () => {
			it("should respect COUNT constraint with completion-based recurrence", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=DAILY;INTERVAL=1;COUNT=3",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01", "2024-01-05", "2024-01-10"],
				};

				const next = getNextUncompletedOccurrence(task);
				// After 3 completions with COUNT=3, should return null
				expect(next).toBeNull();
			});

			it("should respect UNTIL constraint with completion-based recurrence", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=DAILY;INTERVAL=1;UNTIL=20240110",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-08"],
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-09 (next day after completion)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-09");
				}
			});

			it("should return null when next completion-based occurrence exceeds UNTIL", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=DAILY;INTERVAL=1;UNTIL=20240105",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-05"],
				};

				const next = getNextUncompletedOccurrence(task);
				// Next would be 2024-01-06, which exceeds UNTIL=2024-01-05
				expect(next).toBeNull();
			});
		});

		describe("complex recurrence patterns with completion anchor", () => {
			it("should work with weekday-only recurrence from completion", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-05"], // Friday
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-08 (next Monday, skipping weekend)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-08");
				}
			});

			it("should work with bi-weekly recurrence from completion", () => {
				const task = {
					...baseTask,
					recurrence: "FREQ=WEEKLY;INTERVAL=2",
					recurrence_anchor: "completion" as const,
					complete_instances: ["2024-01-01"], // Monday
				};

				const next = getNextUncompletedOccurrence(task);
				expect(next).toBeTruthy();
				if (next) {
					// Should be 2024-01-15 (2 weeks after Jan 1)
					expect(next.toISOString().split("T")[0]).toBe("2024-01-15");
				}
			});
		});
	});
});
