# Filtering and Views

[← Back to Features](../features.md)

TaskNotes v4 uses the Bases core plugin for filtering, sorting, and grouping tasks. Filtering is configured through YAML frontmatter in `.base` files using Bases expression syntax. This approach replaces the v3 FilterBar UI component, which has been removed.

## Bases Core Plugin

Bases is an official Obsidian core plugin built directly into the application, not a community plugin. It provides data querying and visualization capabilities that TaskNotes uses for its main views.

**To enable Bases:**
1. Open Settings → Core Plugins
2. Enable "Bases"
3. Restart Obsidian

All TaskNotes views (Task List, Kanban, Calendar) are implemented as Bases views and stored as `.base` files in the `TaskNotes/Views/` directory.

## Filter Configuration

Filters are defined in the YAML frontmatter of `.base` files using Bases expression syntax. Each view file can specify its own filtering criteria.

### Basic Filter Structure

Filters use object notation with `and` and `or` operators to combine conditions:

```yaml
filters:
  and:
    - note.status == "todo"
    - note.priority == "high"
```

### Multiple Conditions with OR Logic

```yaml
filters:
  or:
    - note.status == "in-progress"
    - note.status == "todo"
```

### Nested Logic

Combine `and` and `or` operators for complex queries:

```yaml
filters:
  and:
    - note.priority == "high"
    - or:
        - note.status == "todo"
        - note.status == "in-progress"
```

## Available Properties

TaskNotes tasks expose properties that can be used in Bases filter expressions. Property names depend on your field mapping configuration in TaskNotes settings.

### Default Property Names

These are the default property names used in Bases expressions (assuming standard field mapping):

**Task Properties:**
- `note.status` - Task status
- `note.priority` - Priority level
- `note.due` - Due date
- `note.scheduled` - Scheduled date
- `note.contexts` - Task contexts (array)
- `note.projects` - Task projects (array)
- `note.time-estimate` - Time estimate in minutes
- `note.recurrence` - Recurrence pattern
- `note.completed-date` - Date when task was completed
- `note.complete-instances` - Array of completed dates for recurring tasks
- `note.blocked-by` - Tasks blocking this task (array)

**File Properties:**
- `file.name` - Task title (filename without extension)
- `file.basename` - Task title (filename without extension)
- `file.path` - Full file path
- `file.parent` - Parent folder path
- `file.tags` - File tags (array)
- `file.ctime` - File creation date
- `file.mtime` - File modification date

**Custom User Fields:**
Any custom fields configured in Settings → TaskNotes → Task Properties → Custom User Fields can be accessed as `note.<field-key>`.

### Property Mapping

If you have customized field mapping in TaskNotes settings, use the configured property names instead of the defaults. For example, if you mapped the status field to `task-status`, use `note.task-status` in filters.

## Filter Operators and Expressions

Bases uses expression syntax for filtering. Common patterns include:

### Equality

```yaml
# Exact match
- note.status == "todo"

# Not equal
- note.status != "done"
```

### Comparison

```yaml
# Greater than
- note.time-estimate > 60

# Less than
- note.time-estimate < 30

# Greater than or equal
- note.priority >= "medium"

# Less than or equal
- note.due <= "2024-12-31"
```

### Date Comparisons

```yaml
# Before a date
- note.due < "2024-12-31"

# After a date
- note.scheduled > "2024-01-01"

# Date range
- and:
    - note.due >= "2024-01-01"
    - note.due <= "2024-01-31"
```

### Contains (for arrays and strings)

```yaml
# Array contains value
- note.contexts.contains("work")
- file.tags.contains("important")

# String contains substring (case-insensitive)
- file.name.lower().contains("meeting")

# Projects (handles wiki links)
- note.projects.contains("[[Project Name]]")
```

### Existence Checks

```yaml
# Property exists and is not empty
- note.due && note.due != "" && note.due != null

# Property is empty or null
- !note.due || note.due == "" || note.due == null

# Array has items
- note.contexts && note.contexts.length > 0
```

### Boolean Properties

```yaml
# Check completed status (based on configured status values)
# This checks both status field and recurring task instances
- (note.status == "done") || (note.complete-instances && note.complete-instances.map(date(value).format("YYYY-MM-DD")).contains(today().format("YYYY-MM-DD")))

# Negation
- note.status != "done"
```

### Natural Language Dates

Bases supports dynamic date expressions:

```yaml
# Relative to today
- note.due == today()
- note.scheduled < tomorrow()

# Dynamic date filters
- note.due >= today()
- note.due <= today() + 7d
```

## Example Filter Scenarios

### High Priority Incomplete Tasks

```yaml
filters:
  and:
    - note.priority == "high"
    - note.status != "done"
```

### Tasks Due This Week

```yaml
filters:
  and:
    - note.due >= today()
    - note.due <= today() + 7d
```

### Tasks in Specific Project

```yaml
filters:
  and:
    - note.projects.contains("[[Work Project]]")
```

### Tasks with Multiple Criteria

```yaml
filters:
  and:
    - or:
        - note.status == "todo"
        - note.status == "in-progress"
    - note.priority == "high"
    - note.contexts.contains("work")
    - note.due >= today()
```

### Tasks in Specific Folder

```yaml
filters:
  and:
    - file.path.contains("Work/Projects")
```

### Tasks Without Due Date

```yaml
filters:
  and:
    - !note.due || note.due == "" || note.due == null
```

### Recurring Tasks

```yaml
filters:
  and:
    - note.recurrence && note.recurrence != "" && note.recurrence != null
```

### Custom User Field Examples

Assuming you have a custom number field "effort-level":

```yaml
filters:
  and:
    - note.effort-level >= 3
```

Assuming you have a custom list field "assigned-to":

```yaml
filters:
  and:
    - note.assigned-to.contains("John Smith")
```

## Sorting

Sorting is configured in the `sort` section of the view definition:

```yaml
views:
  - type: tasknotesTaskList
    name: "My Tasks"
    sort:
      - column: due
        direction: ASC
```

### Available Sort Columns

- `due` - Due date
- `scheduled` - Scheduled date
- `priority` - Priority level
- `status` - Task status
- `file.name` - Task title
- `file.ctime` - Creation date
- `file.mtime` - Modification date
- `completed-date` - Completion date
- `time-estimate` - Time estimate
- Custom user field keys

### Sort Direction

- `ASC` - Ascending (earliest first for dates, A-Z for text)
- `DESC` - Descending (latest first for dates, Z-A for text)

### Multiple Sort Criteria

```yaml
sort:
  - column: priority
    direction: DESC
  - column: due
    direction: ASC
```

## Grouping

Grouping is configured in the `groupBy` section of the view definition:

```yaml
views:
  - type: tasknotesTaskList
    name: "My Tasks"
    groupBy:
      property: status
      direction: ASC
```

### Available Grouping Properties

- `status` - Group by task status
- `priority` - Group by priority level
- `contexts` - Group by first context
- `projects` - Group by project (tasks can appear in multiple groups)
- `due` - Group by due date ranges
- `scheduled` - Group by scheduled date ranges
- Custom user field keys

### Hierarchical Subgrouping

Bases supports two-level grouping where tasks are first grouped by a primary criterion, then subdivided within each group:

```yaml
views:
  - type: tasknotesTaskList
    name: "My Tasks"
    groupBy:
      property: status
      direction: ASC
    subgroupBy:
      property: priority
      direction: DESC
```

This creates groups by status, with subgroups by priority within each status group.

## Saved Views

In TaskNotes v4, saved views are `.base` files stored in your vault rather than in plugin settings. Each `.base` file represents a complete view configuration including filters, sorting, grouping, and view-specific options.

### Creating a Saved View

1. Create a new `.base` file in your vault (recommended location: `TaskNotes/Views/`)
2. Add YAML frontmatter with your filter configuration
3. Define the view type and options

Example `.base` file:

```yaml
# High Priority Tasks

filters:
  and:
    - note.priority == "high"
    - note.status != "done"

views:
  - type: tasknotesTaskList
    name: "High Priority"
    sort:
      - column: due
        direction: ASC
    groupBy:
      property: status
      direction: ASC
```

### View Types

- `tasknotesTaskList` - List view
- `tasknotesKanban` - Kanban board view
- `tasknotesCalendar` - Calendar view
- `tasknotesMiniCalendar` - Mini calendar view

### View-Specific Options

Different view types support different options:

**Kanban View:**
```yaml
views:
  - type: tasknotesKanban
    name: "Kanban Board"
    groupBy:
      property: status
    options:
      columnWidth: 280
      hideEmptyColumns: false
```

**Calendar View:**
```yaml
views:
  - type: tasknotesCalendar
    name: "Calendar"
    options:
      showScheduled: true
      showDue: true
      showRecurring: true
      showTimeEntries: true
      showTimeblocks: true
      showPropertyBasedEvents: true
      calendarView: "timeGridWeek"
      firstDay: 0
      slotMinTime: "06:00:00"
      slotMaxTime: "22:00:00"
      slotDuration: "00:30:00"
```

### Managing Saved Views

- **Create**: Add a new `.base` file in your vault
- **Edit**: Modify the YAML frontmatter in the `.base` file
- **Delete**: Delete the `.base` file
- **Share**: Share the `.base` file with others or commit to version control

## Migration from v3

TaskNotes v3 used a FilterBar UI component with saved views stored in plugin settings. Version 4 replaces this with Bases-based filtering configured through YAML in `.base` files.

### What Changed

- **UI Removal**: The FilterBar component with its visual query builder has been removed
- **Configuration Method**: Filters are now defined in YAML rather than through UI interactions
- **Storage Location**: Saved views are now `.base` files in your vault rather than in plugin data
- **Syntax**: Filter expressions use Bases syntax instead of FilterBar condition objects

### Converting v3 Saved Views

TaskNotes v4 includes a conversion tool to help migrate v3 saved views to `.base` files:

1. Open Settings → TaskNotes → General
2. In the **View Commands** section, click **Export All Saved Views to Bases**
3. Confirm the file path to generate a `.base` file containing your saved views

The exporter creates a single `.base` file (default: `TaskNotes/Views/all-saved-views.base`) with each saved view represented as a separate TaskNotes view inside the file.

### Manual Conversion

To manually convert a v3 saved view to a `.base` file:

1. Review your v3 filter conditions
2. Create a new `.base` file
3. Translate each condition to Bases expression syntax
4. Use the examples in this document as reference

**v3 Filter Example:**
- Property: `priority`, Operator: `is`, Value: `high`
- Property: `status.isCompleted`, Operator: `is-not-checked`

**v4 Equivalent:**
```yaml
filters:
  and:
    - note.priority == "high"
    - note.status != "done"
```

## Property Order and Visibility

The `order` array in the view configuration controls which properties are displayed on task cards:

```yaml
views:
  - type: tasknotesTaskList
    name: "My Tasks"
    order:
      - file.name
      - note.status
      - note.priority
      - note.due
      - note.scheduled
      - note.projects
      - note.contexts
      - file.tags
```

Properties not listed in the `order` array are hidden from task cards but still available for filtering and sorting.

## Bases Expression Reference

Bases is a core plugin maintained by Obsidian. Refer to Obsidian's documentation for complete details on expression syntax, functions, and capabilities.

### Common Functions

- `today()` - Current date
- `tomorrow()` - Tomorrow's date
- `date(value)` - Parse date value
- `list(value)` - Convert to list/array
- `.contains(value)` - Check if array contains value
- `.map(expression)` - Transform array values
- `.filter(expression)` - Filter array values
- `.length` - Array length
- `.lower()` - Lowercase string
- `.upper()` - Uppercase string
- `.format(pattern)` - Format date/value

### Logical Operators

- `&&` - Logical AND
- `||` - Logical OR
- `!` - Logical NOT
- `==` - Equality
- `!=` - Inequality
- `<` - Less than
- `>` - Greater than
- `<=` - Less than or equal
- `>=` - Greater than or equal

## Performance Considerations

Bases handles query execution and optimization. Filter performance depends on:

- **Filter Complexity**: Simpler filters execute faster
- **Vault Size**: Larger vaults take longer to query
- **Property Access**: File properties are generally faster than computed properties
- **Array Operations**: Operations on large arrays may be slower

For best performance:
- Use specific filters rather than broad ones
- Avoid nested array operations when possible
- Limit the number of view-specific options that require computation

## Filter Evaluation

Bases evaluates filters against the Obsidian metadata cache. Understanding evaluation behavior:

- **Empty Values**: Properties that are null, undefined, or empty strings require explicit checks
- **Array Properties**: For multi-value properties (tags, contexts, projects), use `.contains()` to check membership
- **Type Coercion**: Bases performs automatic type conversion in comparisons
- **Date Precision**: Date comparisons include time components
- **Case Sensitivity**: String comparisons are case-sensitive unless using `.lower()` or `.upper()`

## Additional Resources

- **View Types**: See [Views](../views.md) for details on each view type
- **Properties**: See [Task Management](task-management.md) for complete property reference
- **Settings**: See [General Settings](../settings/general.md) for field mapping configuration
