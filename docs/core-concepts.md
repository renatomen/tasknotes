# Core Concepts

TaskNotes follows the "one note per task" principle, where each task lives as a separate Markdown note with structured metadata in YAML frontmatter.

## The Note-Per-Task Approach

Individual Markdown notes replace centralized databases or proprietary formats. Each task file can be read, edited, and backed up with any text editor or automation tool.

The note body holds additional context like research findings, meeting notes, or links to related documents. Since tasks are proper notes, they work with Obsidian's backlinking, graph visualization, and tag management.

This approach does create many small files, which may not suit every organizational preference.

## YAML Frontmatter for Structured Data

Task metadata like due dates, priorities, and status live in YAML frontmatter. This standard has tool support for integrating task data with external systems and extending the data model with custom fields.

TaskNotes queries Obsidian's metadata cache directly. Version 4 requires the Bases core plugin to be enabled for main views. Plain text files work with version control systems like Git.

## Methodology-Agnostic Design

TaskNotes does not enforce a specific productivity methodology. The tools support various approaches:

Getting Things Done uses contexts, status workflows, and calendar integration. Time-based planning uses calendar integration and time tracking. Project-centric workflows use the projects feature with tags, contexts, and linking. Kanban and Agile methodologies use the Kanban view and customizable status systems.