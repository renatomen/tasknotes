/**
 * Test to verify Issue #1005: Mini calendar not showing daily note dots
 *
 * Bug Description:
 * When switching the mini calendar to "Daily notes" mode, no days are marked with dots
 * (except today) even though daily notes exist in the configured folder.
 * However, double-clicking opens the correct daily note, and Ctrl+hover previews work.
 *
 * Root Cause:
 * The getAllDailyNotes() function from obsidian-daily-notes-interface returns an object
 * where keys are in the format "day-<ISO_TIMESTAMP>" (e.g., "day-2025-01-15T00:00:00Z"),
 * but the calendar colorization code expects date strings in "YYYY-MM-DD" format.
 *
 * Location: src/utils/MinimalNativeCache.ts:440
 */

describe('Issue #1005: Daily notes not showing on mini calendar', () => {

    it('demonstrates the date format mismatch between getAllDailyNotes() and calendar', () => {
        // Simulate what getAllDailyNotes() returns
        // The keys use getDateUID() format: "day-<ISO_TIMESTAMP>"
        const mockAllDailyNotes = {
            'day-2025-01-15T00:00:00+00:00': { basename: '2025-01-15', path: 'days/2025-01-15.md' },
            'day-2025-01-16T00:00:00+00:00': { basename: '2025-01-16', path: 'days/2025-01-16.md' },
            'day-2025-01-17T00:00:00+00:00': { basename: '2025-01-17', path: 'days/2025-01-17.md' },
        };

        // Simulate the buggy code in MinimalNativeCache.ts:440
        const dailyNotesSet = new Set<string>();
        for (const [dateStr] of Object.entries(mockAllDailyNotes)) {
            dailyNotesSet.add(dateStr);
        }

        console.log('Daily notes set contains:', Array.from(dailyNotesSet));

        // What the calendar checks for (from MiniCalendarView.ts:1097)
        const calendarDateFormats = ['2025-01-15', '2025-01-16', '2025-01-17'];

        console.log('Calendar checks for dates in format:', calendarDateFormats);

        // This demonstrates the bug: the formats don't match
        calendarDateFormats.forEach(dateStr => {
            const hasMatch = dailyNotesSet.has(dateStr);
            console.log(`  ${dateStr}: ${hasMatch ? '✓ Found' : '✗ NOT FOUND (BUG!)'}`);

            // This will fail, demonstrating the bug
            // expect(hasMatch).toBe(true);
        });

        // Show that none of the calendar dates are found in the set
        const foundCount = calendarDateFormats.filter(date => dailyNotesSet.has(date)).length;
        expect(foundCount).toBe(0); // Bug: 0 matches found

        // But the set DOES contain entries (just in wrong format)
        expect(dailyNotesSet.size).toBe(3);
    });

    it('shows the correct fix: extract date from the file object instead of using the key', () => {
        // Simulate what getAllDailyNotes() returns
        const mockAllDailyNotes = {
            'day-2025-01-15T00:00:00+00:00': { basename: '2025-01-15', path: 'days/2025-01-15.md' },
            'day-2025-01-16T00:00:00+00:00': { basename: '2025-01-16', path: 'days/2025-01-16.md' },
            'day-2025-01-17T00:00:00+00:00': { basename: '2025-01-17', path: 'days/2025-01-17.md' },
        };

        // FIXED APPROACH: Extract date from the file object's basename
        const dailyNotesSet = new Set<string>();
        for (const [, file] of Object.entries(mockAllDailyNotes)) {
            // Use the file's basename which is in YYYY-MM-DD format
            dailyNotesSet.add(file.basename);
        }

        console.log('\n=== FIXED APPROACH ===');
        console.log('Daily notes set contains:', Array.from(dailyNotesSet));

        // What the calendar checks for
        const calendarDateFormats = ['2025-01-15', '2025-01-16', '2025-01-17'];

        console.log('Calendar checks for dates in format:', calendarDateFormats);

        // This should now work
        calendarDateFormats.forEach(dateStr => {
            const hasMatch = dailyNotesSet.has(dateStr);
            console.log(`  ${dateStr}: ${hasMatch ? '✓ Found' : '✗ Not found'}`);
            expect(hasMatch).toBe(true); // Fix: all should be found
        });

        // All calendar dates should be found
        const foundCount = calendarDateFormats.filter(date => dailyNotesSet.has(date)).length;
        expect(foundCount).toBe(3); // Fixed: all 3 matches found
    });

    it('verifies the dateUID format from obsidian-daily-notes-interface', () => {
        // This test documents the actual format returned by getDateUID()
        // From obsidian-daily-notes-interface/dist/main.js:210-212

        // The format is: "day-<ISO_TIMESTAMP>"
        // where ISO_TIMESTAMP is the result of moment.format() which gives ISO 8601 format

        const exampleKeys = [
            'day-2025-01-15T00:00:00+00:00',
            'day-2025-01-16T00:00:00+00:00',
            'day-2025-01-17T00:00:00+00:00',
        ];

        exampleKeys.forEach(key => {
            // The key starts with "day-"
            expect(key).toMatch(/^day-/);

            // The key contains an ISO timestamp
            expect(key).toMatch(/day-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

            // But it's NOT in the simple YYYY-MM-DD format that the calendar uses
            expect(key).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    it('demonstrates that filename pattern fallback works but primary method fails', () => {
        // The code has a fallback that extracts dates from filenames using regex
        // This explains why the user might see SOME dates marked (from fallback)
        // but not all dates (because the primary getAllDailyNotes() method fails)

        const fileName = '2025-01-15';
        const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);

        expect(dateMatch).not.toBeNull();
        expect(dateMatch![1]).toBe('2025-01-15');

        // The fallback adds dates in the correct format
        const dailyNotesSet = new Set<string>();
        if (dateMatch) {
            dailyNotesSet.add(dateMatch[1]);
        }

        // Calendar check would work for dates added via fallback
        expect(dailyNotesSet.has('2025-01-15')).toBe(true);

        console.log('Note: Fallback regex method works, but primary getAllDailyNotes() method fails');
    });
});
