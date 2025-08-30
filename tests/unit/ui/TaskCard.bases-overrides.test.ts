import { createTaskCard } from '../../../src/ui/TaskCard';
import { PluginFactory, TaskFactory } from '../../helpers/mock-factories';

describe('TaskCard Bases overrides rendering', () => {
  it('renders custom labels and separators, supports suppressed labels', () => {
    const plugin = PluginFactory.createMockPlugin({
      priorityManager: {
        getPriorityConfig: jest.fn().mockReturnValue({ label: 'Normal', color: '#888' })
      },
      statusManager: {
        isCompletedStatus: jest.fn(() => false),
        getStatusConfig: jest.fn().mockReturnValue({ label: 'Open', color: '#0a0' }),
        getNextStatus: jest.fn(() => 'in-progress'),
        getAllStatuses: jest.fn(() => ['open','in-progress','done'])
      },
      projectSubtasksService: {
        isTaskUsedAsProject: jest.fn().mockResolvedValue(false)
      },
      settings: {
        // Only include fields accessed by createTaskCard
        subtaskChevronPosition: 'right'
      }
    });
    const task = TaskFactory.createTask({ path: '/t.md', title: 'T' });

    const element = createTaskCard(task, plugin as any, {
      extraPropertiesRows: [{
        selected: [
          { id: 'note.in', displayName: 'In', visible: true, tnLabel: '👤', tnSeparator: '' },
          { id: 'note.assignee', displayName: 'Assignee', visible: true, tnLabel: '↳', tnSeparator: '' },
          { id: 'note.tags', displayName: 'Tags', visible: true, tnSeparator: '' },
          { id: 'due', displayName: 'Due', visible: true, tnLabel: '📅', tnSeparator: ' | ' },
          { id: 'no.label', displayName: 'No Label', visible: true, tnLabel: null, tnSeparator: '' }
        ],
        getValue: (_path: string, propId: string) => {
          switch (propId) {
            case 'note.in': return 'Inbox';
            case 'note.assignee': return 'Me';
            case 'note.tags': return ['#a'];
            case 'due': return '2030-01-01';
            case 'no.label': return 'X';
            default: return undefined;
          }
        }
      }]
    });

    const rows = element.querySelectorAll('.task-card__properties');
    expect(rows.length).toBe(1);
    const chips = rows[0].querySelectorAll('.task-card__property');
    expect(chips.length).toBe(5);

    const texts = Array.from(chips).map(ch => ch.textContent || '');
    // Expected formatting:
    // 1) label '👤' + sep '' + value => '👤Inbox'
    // 2) label '↳' + sep '' + value => '↳Me'
    // 3) label default 'Tags' + sep '' + value '#a' => 'Tags#a'
    // 4) label '📅' + sep ' | ' + value => '📅 | 2030-01-01'
    // 5) suppressed label -> only value 'X'
    expect(texts[0]).toBe('👤Inbox');
    expect(texts[1]).toBe('↳Me');
    expect(texts[2]).toContain('Tags');
    expect(texts[2]).toContain('#a');
    expect(texts[3]).toBe('📅 | 2030-01-01');
    expect(texts[4]).toBe('X');
  });
});

