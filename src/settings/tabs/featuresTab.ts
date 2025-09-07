import { Notice } from 'obsidian';
import TaskNotesPlugin from '../../main';
import { 
    createSectionHeader, 
    createTextSetting, 
    createToggleSetting, 
    createDropdownSetting,
    createNumberSetting,
    createHelpText,
    // createButtonSetting
} from '../components/settingHelpers';
import { showStorageLocationConfirmationModal } from '../../modals/StorageLocationConfirmationModal';

/**
 * Renders the Features tab - optional plugin modules and their configuration
 */
export function renderFeaturesTab(container: HTMLElement, plugin: TaskNotesPlugin, save: () => void): void {
    container.empty();

    // Inline Tasks Section
    createSectionHeader(container, 'Inline Tasks');
    createHelpText(container, 'Configure inline task features for seamless task management within any note.');

    createToggleSetting(container, {
        name: 'Task link overlay',
        desc: 'Show interactive overlays when hovering over task links',
        getValue: () => plugin.settings.enableTaskLinkOverlay,
        setValue: async (value: boolean) => {
            plugin.settings.enableTaskLinkOverlay = value;
            save();
        }
    });

    createToggleSetting(container, {
        name: 'Instant task convert',
        desc: 'Enable instant conversion of text to tasks using keyboard shortcuts',
        getValue: () => plugin.settings.enableInstantTaskConvert,
        setValue: async (value: boolean) => {
            plugin.settings.enableInstantTaskConvert = value;
            save();
            // Re-render to show additional settings
            renderFeaturesTab(container, plugin, save);
        }
    });

    if (plugin.settings.enableInstantTaskConvert) {
        createTextSetting(container, {
            name: 'Inline task convert folder',
            desc: 'Folder for inline task conversion. Use {{currentNotePath}} for relative to current note',
            placeholder: 'TaskNotes',
            getValue: () => plugin.settings.inlineTaskConvertFolder,
            setValue: async (value: string) => {
                plugin.settings.inlineTaskConvertFolder = value;
                save();
            }
        });
    }

    // Natural Language Processing Section
    createSectionHeader(container, 'Natural Language Processing');
    createHelpText(container, 'Enable smart parsing of task details from natural language input.');

    createToggleSetting(container, {
        name: 'Enable natural language task input',
        desc: 'Parse due dates, priorities, and contexts from natural language when creating tasks',
        getValue: () => plugin.settings.enableNaturalLanguageInput,
        setValue: async (value: boolean) => {
            plugin.settings.enableNaturalLanguageInput = value;
            save();
            // Re-render to show NLP settings
            renderFeaturesTab(container, plugin, save);
        }
    });

    if (plugin.settings.enableNaturalLanguageInput) {
        createToggleSetting(container, {
            name: 'Default to scheduled',
            desc: 'When NLP detects a date without context, treat it as scheduled rather than due',
            getValue: () => plugin.settings.nlpDefaultToScheduled,
            setValue: async (value: boolean) => {
                plugin.settings.nlpDefaultToScheduled = value;
                save();
            }
        });

        // Status suggestion trigger (single character; empty to disable)
        createTextSetting(container, {
            name: 'Status suggestion trigger',
            desc: 'Single character to trigger status suggestions in NLP input (empty to disable). Example: *',
            placeholder: '*',
            getValue: () => plugin.settings.statusSuggestionTrigger || '',
            setValue: async (value: string) => {
                plugin.settings.statusSuggestionTrigger = (value || '').trim();
                save();
            }
        });
    }

    // Project Autosuggest Section
    createSectionHeader(container, 'Project autosuggest');
    createHelpText(container, 'Configure how project suggestions appear when typing + in the natural language input.');

    // Fuzzy matching toggle
    createToggleSetting(container, {
        name: 'Enable fuzzy matching (experimental)',
        desc: 'When enabled: Allows fuzzy matching for project names (slower, better for finding projects with typos). When disabled: Uses exact prefix matching (faster performance, recommended for large vaults).',
        getValue: () => !!(plugin.settings.projectAutosuggest?.enableFuzzy),
        setValue: async (value: boolean) => {
            plugin.settings.projectAutosuggest = plugin.settings.projectAutosuggest || { enableFuzzy: false, rows: [] };
            plugin.settings.projectAutosuggest.enableFuzzy = value;
            save();
        }
    });

    // Display rows (up to 3)
    createHelpText(container, 'Display rows (up to 3). Use tokens like {title|n(Title)}, {aliases|n(Aliases)}, {file.path|n(Path)|s}. Flags: n or n(Label) shows field name; s includes that field in + search (in addition to defaults).');

    const getRow = (idx: number): string => (plugin.settings.projectAutosuggest?.rows?.[idx] ?? '');
    const setRow = (idx: number, value: string) => {
        const current = plugin.settings.projectAutosuggest?.rows ?? [];
        const next = [...current];
        next[idx] = value;
        plugin.settings.projectAutosuggest = plugin.settings.projectAutosuggest || { enableFuzzy: false, rows: [] };
        plugin.settings.projectAutosuggest.rows = next.slice(0, 3);
        save();
    };

    createTextSetting(container, {
        name: 'Row 1',
        desc: 'First line of each suggestion card',
        placeholder: '{title|n(Title)}',
        getValue: () => getRow(0),
        setValue: async (value: string) => setRow(0, value)
    });

    createTextSetting(container, {
        name: 'Row 2',
        desc: 'Second line of each suggestion card',
        placeholder: '{aliases}',
        getValue: () => getRow(1),
        setValue: async (value: string) => setRow(1, value)
    });

    createTextSetting(container, {
        name: 'Row 3',
        desc: 'Third line of each suggestion card',
        placeholder: '{file.path|n(Path)|s}',
        getValue: () => getRow(2),
        setValue: async (value: string) => setRow(2, value)
    });

    // Pomodoro Timer Section
    createSectionHeader(container, 'Pomodoro Timer');
    createHelpText(container, 'Built-in Pomodoro timer for time management and productivity tracking.');

    // Work duration
    createNumberSetting(container, {
        name: 'Work duration',
        desc: 'Duration of work intervals in minutes',
        placeholder: '25',
        min: 1,
        max: 120,
        getValue: () => plugin.settings.pomodoroWorkDuration,
        setValue: async (value: number) => {
            plugin.settings.pomodoroWorkDuration = value;
            save();
        }
    });

    // Short break duration  
    createNumberSetting(container, {
        name: 'Short break duration',
        desc: 'Duration of short breaks in minutes',
        placeholder: '5',
        min: 1,
        max: 60,
        getValue: () => plugin.settings.pomodoroShortBreakDuration,
        setValue: async (value: number) => {
            plugin.settings.pomodoroShortBreakDuration = value;
            save();
        }
    });

    // Long break duration
    createNumberSetting(container, {
        name: 'Long break duration',
        desc: 'Duration of long breaks in minutes',
        placeholder: '15',
        min: 1,
        max: 120,
        getValue: () => plugin.settings.pomodoroLongBreakDuration,
        setValue: async (value: number) => {
            plugin.settings.pomodoroLongBreakDuration = value;
            save();
        }
    });

    // Long break interval
    createNumberSetting(container, {
        name: 'Long break interval',
        desc: 'Number of work sessions before a long break',
        placeholder: '4',
        min: 1,
        max: 10,
        getValue: () => plugin.settings.pomodoroLongBreakInterval,
        setValue: async (value: number) => {
            plugin.settings.pomodoroLongBreakInterval = value;
            save();
        }
    });

    // Auto-start options
    createToggleSetting(container, {
        name: 'Auto-start breaks',
        desc: 'Automatically start break timers after work sessions',
        getValue: () => plugin.settings.pomodoroAutoStartBreaks,
        setValue: async (value: boolean) => {
            plugin.settings.pomodoroAutoStartBreaks = value;
            save();
        }
    });

    createToggleSetting(container, {
        name: 'Auto-start work',
        desc: 'Automatically start work sessions after breaks',
        getValue: () => plugin.settings.pomodoroAutoStartWork,
        setValue: async (value: boolean) => {
            plugin.settings.pomodoroAutoStartWork = value;
            save();
        }
    });

    // Notification settings
    createToggleSetting(container, {
        name: 'Pomodoro notifications',
        desc: 'Show notifications when Pomodoro sessions end',
        getValue: () => plugin.settings.pomodoroNotifications,
        setValue: async (value: boolean) => {
            plugin.settings.pomodoroNotifications = value;
            save();
        }
    });

    // Sound settings
    createToggleSetting(container, {
        name: 'Sound enabled',
        desc: 'Play sound when Pomodoro sessions end',
        getValue: () => plugin.settings.pomodoroSoundEnabled,
        setValue: async (value: boolean) => {
            plugin.settings.pomodoroSoundEnabled = value;
            save();
            // Re-render to show volume setting
            renderFeaturesTab(container, plugin, save);
        }
    });

    if (plugin.settings.pomodoroSoundEnabled) {
        createNumberSetting(container, {
            name: 'Sound volume',
            desc: 'Volume for Pomodoro sounds (0-100)',
            placeholder: '50',
            min: 0,
            max: 100,
            getValue: () => plugin.settings.pomodoroSoundVolume,
            setValue: async (value: number) => {
                plugin.settings.pomodoroSoundVolume = value;
                save();
            }
        });
    }

    // Storage location setting
    createDropdownSetting(container, {
        name: 'Pomodoro data storage',
        desc: 'Where to store Pomodoro session history',
        options: [
            { value: 'plugin', label: 'Plugin data (recommended)' },
            { value: 'daily-notes', label: 'Daily notes' }
        ],
        getValue: () => plugin.settings.pomodoroStorageLocation,
        setValue: async (value: string) => {
            const newLocation = value as 'plugin' | 'daily-notes';
            if (newLocation !== plugin.settings.pomodoroStorageLocation) {
                // Check if there's existing data to migrate
                const data = await plugin.loadData();
                const hasExistingData = data?.pomodoroHistory && Array.isArray(data.pomodoroHistory) && data.pomodoroHistory.length > 0;
                
                // Show confirmation modal for storage location change
                const confirmed = await showStorageLocationConfirmationModal(plugin.app, hasExistingData);
                
                if (confirmed) {
                    plugin.settings.pomodoroStorageLocation = newLocation;
                    save();
                    new Notice(`Pomodoro storage location changed to ${newLocation === 'plugin' ? 'plugin data' : 'daily notes'}`);
                } else {
                    // Reset the dropdown to the current value
                    renderFeaturesTab(container, plugin, save);
                }
            }
        }
    });

    // Notifications Section
    createSectionHeader(container, 'Notifications');
    createHelpText(container, 'Configure task reminder notifications and alerts.');

    createToggleSetting(container, {
        name: 'Enable notifications',
        desc: 'Enable task reminder notifications',
        getValue: () => plugin.settings.enableNotifications,
        setValue: async (value: boolean) => {
            plugin.settings.enableNotifications = value;
            save();
            // Re-render to show notification type setting
            renderFeaturesTab(container, plugin, save);
        }
    });

    if (plugin.settings.enableNotifications) {
        createDropdownSetting(container, {
            name: 'Notification type',
            desc: 'Type of notifications to show',
            options: [
                { value: 'in-app', label: 'In-app notifications' },
                { value: 'system', label: 'System notifications' }
            ],
            getValue: () => plugin.settings.notificationType,
            setValue: async (value: string) => {
                plugin.settings.notificationType = value as 'in-app' | 'system';
                save();
            }
        });
    }

    // Performance & Behavior Section
    createSectionHeader(container, 'Performance & Behavior');
    createHelpText(container, 'Configure plugin performance and behavioral options.');

    createToggleSetting(container, {
        name: 'Hide completed tasks from overdue',
        desc: 'Exclude completed tasks from overdue task calculations',
        getValue: () => plugin.settings.hideCompletedFromOverdue,
        setValue: async (value: boolean) => {
            plugin.settings.hideCompletedFromOverdue = value;
            save();
        }
    });

    createToggleSetting(container, {
        name: 'Disable note indexing',
        desc: 'Disable automatic indexing of notes for better performance (may reduce some features)',
        getValue: () => plugin.settings.disableNoteIndexing,
        setValue: async (value: boolean) => {
            plugin.settings.disableNoteIndexing = value;
            save();
        }
    });

    // Suggestion debounce setting
    if (plugin.settings.suggestionDebounceMs !== undefined) {
        createNumberSetting(container, {
            name: 'Suggestion debounce',
            desc: 'Debounce delay for file suggestions in milliseconds (0 = disabled)',
            placeholder: '300',
            min: 0,
            max: 2000,
            getValue: () => plugin.settings.suggestionDebounceMs || 0,
            setValue: async (value: number) => {
                plugin.settings.suggestionDebounceMs = value > 0 ? value : undefined;
                save();
            }
        });
    }

    // Time Tracking Section
    createSectionHeader(container, 'Time Tracking');
    createHelpText(container, 'Configure automatic time tracking behaviors.');

    createToggleSetting(container, {
        name: 'Auto-stop tracking on complete',
        desc: 'Automatically stop time tracking when a task is marked complete',
        getValue: () => plugin.settings.autoStopTimeTrackingOnComplete,
        setValue: async (value: boolean) => {
            plugin.settings.autoStopTimeTrackingOnComplete = value;
            save();
        }
    });

    createToggleSetting(container, {
        name: 'Time tracking stop notification',
        desc: 'Show notification when time tracking is automatically stopped',
        getValue: () => plugin.settings.autoStopTimeTrackingNotification,
        setValue: async (value: boolean) => {
            plugin.settings.autoStopTimeTrackingNotification = value;
            save();
        }
    });

    // Recurring Tasks Section
    createSectionHeader(container, 'Recurring Tasks');
    createHelpText(container, 'Configure behavior for recurring task management.');

    createToggleSetting(container, {
        name: 'Maintain due date offset in recurring tasks',
        desc: 'When completing recurring tasks, maintain the offset between due and scheduled dates',
        getValue: () => plugin.settings.maintainDueDateOffsetInRecurring,
        setValue: async (value: boolean) => {
            plugin.settings.maintainDueDateOffsetInRecurring = value;
            save();
        }
    });
}