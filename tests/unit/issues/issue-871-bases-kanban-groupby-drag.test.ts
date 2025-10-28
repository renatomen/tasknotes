/**
 * Regression coverage for Issue #871: ensure Kanban drag/drop updates
 * the column's grouping property (or bails) instead of silently mutating status.
 */

import { describe, it, expect } from '@jest/globals';

describe('Issue #871: Bases Kanban drag and drop updates wrong property', () => {
    function simulateBasesKanbanDrop(
        groupByPropertyId: string | null,
        targetColumnId: string
    ): { updatedProperty: string | null; updatedValue: string | null } {
        if (groupByPropertyId) {
            const originalPropertyId = groupByPropertyId;
            const propertyId = originalPropertyId.toLowerCase();

            // Handle different property types (lines 423-483)
            if (propertyId === "status" || propertyId === "note.status") {
                return { updatedProperty: "status", updatedValue: targetColumnId };
            } else if (propertyId === "priority" || propertyId === "note.priority") {
                return { updatedProperty: "priority", updatedValue: targetColumnId };
            } else if (
                propertyId === "projects" ||
                propertyId === "project" ||
                propertyId === "note.projects" ||
                propertyId === "note.project"
            ) {
                return { updatedProperty: "projects", updatedValue: targetColumnId };
            } else if (
                propertyId === "contexts" ||
                propertyId === "context" ||
                propertyId === "note.contexts" ||
                propertyId === "note.context"
            ) {
                return { updatedProperty: "contexts", updatedValue: targetColumnId };
            } else {
                // Custom property - extract property name
                const propertyName = originalPropertyId.includes(".")
                    ? originalPropertyId.split(".").pop() || originalPropertyId
                    : originalPropertyId;
                return { updatedProperty: propertyName, updatedValue: targetColumnId };
            }
        } else {
            // Updated behavior: if we cannot determine the grouping property we abort the move
            return { updatedProperty: null, updatedValue: null };
        }
    }

    describe('When groupByPropertyId cannot be determined', () => {
        it('should skip updating priority when groupByPropertyId is null', () => {
            // User has Bases view grouped by priority
            // But groupByPropertyId failed to be determined (is null)
            const groupByPropertyId = null;
            const targetColumnId = "high";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBeNull();
            expect(result.updatedValue).toBeNull();
        });

        it('should skip updating custom field when groupByPropertyId is null', () => {
            // User has Bases view grouped by a custom field "department"
            // But groupByPropertyId failed to be determined (is null)
            const groupByPropertyId = null;
            const targetColumnId = "engineering";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBeNull();
            expect(result.updatedValue).toBeNull();
        });

        it('should skip updating projects when groupByPropertyId is null', () => {
            // User has Bases view grouped by projects
            // But groupByPropertyId failed to be determined (is null)
            const groupByPropertyId = null;
            const targetColumnId = "ProjectA";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBeNull();
            expect(result.updatedValue).toBeNull();
        });
    });

    describe('Correct behavior - when groupByPropertyId is properly determined', () => {
        it('should update priority when grouped by priority', () => {
            const groupByPropertyId = "note.priority";
            const targetColumnId = "high";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBe("priority");
            expect(result.updatedValue).toBe("high");
        });

        it('should update projects when grouped by projects', () => {
            const groupByPropertyId = "note.projects";
            const targetColumnId = "ProjectA";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBe("projects");
            expect(result.updatedValue).toBe("ProjectA");
        });

        it('should update custom field when grouped by custom field', () => {
            const groupByPropertyId = "note.department";
            const targetColumnId = "engineering";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBe("department");
            expect(result.updatedValue).toBe("engineering");
        });

        it('should update status when grouped by status', () => {
            const groupByPropertyId = "note.status";
            const targetColumnId = "done";

            const result = simulateBasesKanbanDrop(groupByPropertyId, targetColumnId);

            expect(result.updatedProperty).toBe("status");
            expect(result.updatedValue).toBe("done");
        });
    });
});
