jest.mock('obsidian');

import type { App } from 'obsidian';
import { TaskCreationModal } from '../../../src/modals/TaskCreationModal';
import { MockObsidian } from '../../__mocks__/obsidian';

class MockPlugin {
  app: App;
  settings: any;
  cacheManager: any;
  fieldMapper: any;
  constructor(app: App, settings: any) {
    this.app = app;
    this.settings = settings;
    this.cacheManager = { getAllContexts: jest.fn(() => []), getAllTags: jest.fn(() => []) };
    this.fieldMapper = { mapFromFrontmatter: (fm: any) => ({ title: fm?.title || '' }) };
  }
}

describe('+ project suggestions with |s searchable flag', () => {
  let mockApp: App;
  let mockPlugin: any;

  beforeEach(() => {
    MockObsidian.reset();
    mockApp = MockObsidian.createMockApp() as unknown as App;

    // Create a file with a path that we will search by
    const yaml = require('yaml');
    const fm = yaml.stringify({ title: 'Foobar', customer: 'Acme Corp' });
    const content = `---\n${fm}---\n`;
    MockObsidian.createTestFile('Clients/Acme/Project.md', content);

    const settings = {
      enableNaturalLanguageInput: true,
      projectAutosuggest: {
        enableFuzzy: false,
        rows: [
          '{title|n(Title)}',
          '{file.path|n(Path)}',
          '{customer|n(Customer)}'
        ],
      },
        excludedFolders: '',
        storeTitleInFilename: false,
        defaultTaskPriority: 'normal',
        defaultTaskStatus: 'open',
        taskCreationDefaults: {
          defaultDueDate: '',
          defaultScheduledDate: '',
          defaultContexts: '',
          defaultTags: '',
          defaultProjects: '',
          defaultTimeEstimate: 0,
          defaultReminders: [],
        },
      };

    mockPlugin = new MockPlugin(mockApp, settings);
  });

  function setupModal() {
    const modal = new TaskCreationModal(mockApp, mockPlugin);
    const root = document.createElement('div') as unknown as HTMLElement;
    (modal as any).createNaturalLanguageInput(root);
    const textarea: HTMLTextAreaElement = (modal as any).nlInput;
    const suggest: any = (modal as any).nlpSuggest;
    // Ensure the NLPSuggest instance has explicit app and plugin references
    suggest.plugin = mockPlugin;
    suggest.obsidianApp = mockApp;
    return { modal, textarea, suggest };
  }

  it('does NOT match unflagged fields (file.path, customer) when searching', async () => {
    const { textarea, suggest } = setupModal();
    // Enter +acme (folder name) which appears only in file.path
    textarea.value = '+acme';
    textarea.selectionStart = textarea.value.length;

    const suggestions = await suggest.getSuggestions('');
    // Should not match because neither file.path nor customer are flagged with |s
    const projects = (suggestions as any[]).filter(s => s.type === 'project');
    expect(projects.length).toBe(0);
  });

  it('matches only flagged fields when |s is present', async () => {
    // Mark file.path as searchable
    mockPlugin.settings.projectAutosuggest.rows = [
      '{title|n(Title)}',
      '{file.path|n(Path)|s}',
      '{customer|n(Customer)}'
    ];

    const { textarea, suggest } = setupModal();
    textarea.value = '+acme';
    textarea.selectionStart = textarea.value.length;

    const suggestions = await suggest.getSuggestions('');
    const projects = (suggestions as any[]).filter(s => s.type === 'project');
    expect(projects.length).toBeGreaterThan(0);
  });

  it('matches custom frontmatter field when |s is present', async () => {
    mockPlugin.settings.projectAutosuggest.rows = [
      '{customer|n(Customer)|s}',
      '{title|n(Title)}'
    ];

    const { textarea, suggest } = setupModal();
    textarea.value = '+acme';
    textarea.selectionStart = textarea.value.length;

    const suggestions = await suggest.getSuggestions('');
    const projects = (suggestions as any[]).filter(s => s.type === 'project');
    expect(projects.length).toBeGreaterThan(0);
  });
});

