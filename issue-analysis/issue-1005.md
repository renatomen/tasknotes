# Issue #1005: Mini Calendar Not Showing Daily Note Dots

## Problem Understanding

### User Report
When the mini calendar is set to "Daily notes" mode, no days are marked with dots (indicators) except for today, even though daily notes exist in the configured folder ("days"). However:
- Double-clicking on dates correctly opens the daily notes
- Ctrl+hover preview correctly shows the daily notes
- All daily notes are in YYYY-MM-DD format
- The "New file location" setting in the core daily notes plugin is correctly set to "days"

### Root Cause
The bug is caused by a **date format mismatch** in `src/utils/MinimalNativeCache.ts:440`.

The `getAllDailyNotes()` function from `obsidian-daily-notes-interface` returns an object where:
- **Keys** are in the format: `"day-<ISO_TIMESTAMP>"` (e.g., `"day-2025-01-15T00:00:00Z"`)
- **Values** are TFile objects with properties like `basename` and `path`

The current code incorrectly uses the **keys** as date strings:
```typescript
for (const [dateStr] of Object.entries(allDailyNotes)) {
    dailyNotesSet.add(dateStr);  // Adds "day-2025-01-15T00:00:00Z"
}
```

But the calendar colorization code in `src/views/MiniCalendarView.ts:1097` expects dates in simple `"YYYY-MM-DD"` format:
```typescript
if (dailyNotesCache.has(dateStr)) {  // Checks for "2025-01-15"
    // Create indicator...
}
```

This format mismatch means the calendar never finds matching daily notes, so no dots are displayed.

## Test File Location

**Test file:** `tests/unit/issues/issue-1005-daily-notes-not-showing.test.ts`

**Run test:**
```bash
npm test -- tests/unit/issues/issue-1005-daily-notes-not-showing.test.ts
```

The test demonstrates:
1. The date format mismatch between `getAllDailyNotes()` keys and calendar expectations
2. The correct fix (using file.basename instead of the key)
3. That the fallback regex method works (explaining partial functionality)
4. The actual dateUID format used by obsidian-daily-notes-interface

## Relevant Code Locations

### Primary Bug Location
- **File:** `src/utils/MinimalNativeCache.ts:440-442`
- **Function:** `getCalendarData(year: number, month: number)`
- **Issue:** Using Object.entries() keys instead of file.basename

### Calendar Colorization
- **File:** `src/views/MiniCalendarView.ts:1097`
- **Function:** `colorizeCalendarForDailyNotes()`
- **Behavior:** Checks for dates in "YYYY-MM-DD" format

### Date Format Generation
- **File:** `src/views/MiniCalendarView.ts:1086-1087`
- **Function:** `colorizeCalendarForDailyNotes()`
- **Code:** Uses `formatDateForStorage(dateObj)` which returns "YYYY-MM-DD"

### Daily Notes Interface (External Library)
- **File:** `node_modules/obsidian-daily-notes-interface/dist/main.js:210-212`
- **Function:** `getDateUID(date, granularity)`
- **Returns:** `"day-<ISO_TIMESTAMP>"` format

## Proposed Solutions

### Solution 1: Extract Date from File Basename (RECOMMENDED)

**Approach:** Use the `file.basename` property from the TFile object instead of the Object key.

**Changes Required:**
- Modify `src/utils/MinimalNativeCache.ts:440-442`

**Code Change:**
```typescript
// BEFORE (buggy):
for (const [dateStr] of Object.entries(allDailyNotes)) {
    dailyNotesSet.add(dateStr);
}

// AFTER (fixed):
for (const [, file] of Object.entries(allDailyNotes)) {
    // Extract date from filename (handles YYYY-MM-DD format)
    const dateMatch = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        dailyNotesSet.add(dateMatch[1]);
    }
}
```

**Pros:**
- Minimal code change
- Uses existing filename pattern matching (consistent with fallback logic)
- Handles both simple filenames (2025-01-15.md) and complex ones (2025-01-15 Notes.md)
- No dependencies on external date parsing libraries
- Maintains compatibility with current architecture

**Cons:**
- Relies on regex pattern matching
- Won't work if user has non-standard daily note filenames (but this is already a limitation)

### Solution 2: Parse dateUID Key Format

**Approach:** Parse the `"day-<ISO_TIMESTAMP>"` key format to extract the date.

**Code Change:**
```typescript
for (const [dateStr] of Object.entries(allDailyNotes)) {
    // Remove "day-" prefix and extract date portion
    const timestamp = dateStr.replace(/^day-/, '');
    const date = timestamp.split('T')[0]; // Get YYYY-MM-DD part
    dailyNotesSet.add(date);
}
```

**Pros:**
- Works directly with the API's return format
- No regex needed
- Guaranteed to work if daily notes interface doesn't change

**Cons:**
- Tightly coupled to obsidian-daily-notes-interface implementation
- Fragile if the library changes its key format
- Less intuitive code

### Solution 3: Use getDailyNote() Helper for Each Date

**Approach:** Instead of pre-building a Set, check for each date individually using `getDailyNote()`.

**Code Change:**
```typescript
// In colorizeCalendarForDailyNotes():
const allDailyNotes = getAllDailyNotes();

calendarDays.forEach((day) => {
    // ... existing date calculation ...
    const moment = (window as any).moment(dateObj);
    const dailyNote = getDailyNote(moment, allDailyNotes);

    if (dailyNote) {
        // Create indicator...
    }
});
```

**Pros:**
- Uses official API methods correctly
- More robust against library changes
- Leverages moment.js which is already available

**Cons:**
- Requires importing `getDailyNote` function
- Slightly more expensive (O(n) lookups vs O(1) Set lookups)
- Requires converting date strings to moment objects
- More invasive change to MiniCalendarView.ts

## Recommended Approach

**Solution 1 (Extract Date from File Basename)** is recommended because:

1. **Minimal risk:** Single line change in one file
2. **Consistent:** Matches the existing fallback pattern at line 479
3. **Simple:** No new dependencies or API usage
4. **Tested:** The fallback already proves this approach works
5. **Performance:** Maintains O(1) Set lookups for calendar rendering

The fix should also consider keeping the fallback pattern matching (lines 476-483) as it provides additional robustness for notes that might be processed differently.

## Implementation Notes

After implementing the fix:
1. Run the test to verify: `npm test -- tests/unit/issues/issue-1005-daily-notes-not-showing.test.ts`
2. Test manually with daily notes in different folder structures
3. Verify dots appear for all dates with daily notes
4. Confirm double-click and Ctrl+hover still work (they should be unaffected)
5. Test with both core daily notes plugin and periodic-notes plugin configurations
