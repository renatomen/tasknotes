import { TaskCreationModal } from '../../../src/modals/TaskCreationModal';
import { MockObsidian } from '../../__mocks__/obsidian';
import type { App } from 'obsidian';

jest.mock('obsidian');

describe('TaskCreationModal project suggestion rendering (MVP)', () => {
  let mockApp: App;
  let mockPlugin: any;

  beforeEach(() => {
    MockObsidian.reset();
    mockApp = MockObsidian.createMockApp() as unknown as App;

    // Minimal plugin mock with settings for autosuggest config
    mockPlugin = {
      app: mockApp,
      settings: {
        enableNaturalLanguageInput: true,
        projectSuggest: {
          enableFuzzy: false,
          rows: [
            '{title|n(Title)}',
            '{aliases|n(Aliases)}',
            '{file.path|n(Path)}',
          ],
        },
        storeTitleInFilename: false,
      },
      fieldMapper: {
        mapFromFrontmatter: jest.fn((fm: any, path: string) => ({ title: fm?.title || '' }))
      }
    };

    // Provide two markdown files
    const files: any[] = [
      { basename: 'Plan', path: 'Work/Plan.md', extension: 'md' },
      { basename: 'Plan', path: 'Personal/Plan.md', extension: 'md' },
    ];

    (mockPlugin.app.vault.getMarkdownFiles as jest.Mock).mockReturnValue(files);
    (mockPlugin.app.metadataCache.getFileCache as jest.Mock).mockImplementation((file: any) => ({
      frontmatter: { title: file.path.startsWith('Work/') ? 'Work Plan' : 'Personal Plan', aliases: ['P'] },
    }));
  });

  it('produces multi-line suggestion content with filename row and configured rows', async () => {
    const modal = new TaskCreationModal(mockApp, mockPlugin);
    await (modal as any).onOpen();

    const textarea: HTMLTextAreaElement = (modal as any).nlInput;
    textarea.value = '+pla';
    textarea.selectionStart = textarea.value.length;

    const suggest: any = (modal as any).nlpSuggest;
    const suggestions = await suggest.getSuggestions('+pla');
    expect(suggestions.length).toBeGreaterThan(0);

    // Simulate render of first suggestion
    const el = document.createElement('div');
    suggest['currentTrigger'] = '+';
    suggest.renderSuggestion(suggestions[0] as any, el);

    // Filename row present
    expect(el.querySelector('.nlp-suggest-project__filename')).toBeTruthy();
    // Configured rows present (Title, Aliases, Path)
    expect(el.textContent).toContain('Work Plan');
    expect(el.textContent).toContain('Aliases');
    expect(el.textContent).toContain('Work/Plan.md');
  });
});

