import { SubgroupMenuBuilder, SubgroupMenuOptions } from '../../src/components/SubgroupMenuBuilder';
import { Menu } from 'obsidian';
import { TaskGroupKey, FilterOptions } from '../../src/types';

// Mock Obsidian Menu
jest.mock('obsidian', () => ({
    Menu: jest.fn().mockImplementation(() => ({
        addSeparator: jest.fn(),
        addItem: jest.fn()
    }))
}));

describe('SubgroupMenuBuilder', () => {
    let mockMenu: jest.Mocked<Menu>;
    let mockOnSubgroupSelect: jest.Mock;
    let subgroupMenuBuilder: SubgroupMenuBuilder;

    const createMockFilterOptions = (): FilterOptions => ({
        statuses: [],
        priorities: [],
        contexts: [],
        projects: [],
        tags: [],
        folders: [],
        userProperties: [
            { id: 'user:custom1', label: 'Custom Field 1' },
            { id: 'user:custom2', label: 'Custom Field 2' }
        ]
    });

    beforeEach(() => {
        mockMenu = new Menu() as jest.Mocked<Menu>;
        mockOnSubgroupSelect = jest.fn();
        
        // Reset mock implementations
        mockMenu.addSeparator.mockClear();
        mockMenu.addItem.mockClear();
    });

    describe('addSubgroupSection', () => {
        test('should not add subgroup section when group key is none', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'none',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            expect(mockMenu.addSeparator).not.toHaveBeenCalled();
            expect(mockMenu.addItem).not.toHaveBeenCalled();
        });

        test('should not add subgroup section when group key is undefined', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: undefined as any,
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            expect(mockMenu.addSeparator).not.toHaveBeenCalled();
            expect(mockMenu.addItem).not.toHaveBeenCalled();
        });

        test('should add subgroup section when group key is valid', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'status',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            expect(mockMenu.addSeparator).toHaveBeenCalledTimes(1);
            expect(mockMenu.addItem).toHaveBeenCalled();
            
            // Should add SUBGROUP heading + None option + available fields
            const expectedCalls = 1 + 1 + 6; // heading + none + (priority, context, project, due, scheduled, tags) - status is excluded
            expect(mockMenu.addItem).toHaveBeenCalledTimes(expectedCalls);
        });

        test('should exclude current group key from subgroup options', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'priority',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            // Verify that priority is not included in the options
            const addItemCalls = mockMenu.addItem.mock.calls;
            const menuTitles = addItemCalls.map(call => {
                const itemCallback = call[0];
                const mockItem = {
                    setTitle: jest.fn(),
                    setIcon: jest.fn(),
                    setDisabled: jest.fn(),
                    onClick: jest.fn()
                };
                itemCallback(mockItem);
                return mockItem.setTitle.mock.calls[0]?.[0];
            });

            expect(menuTitles).toContain('SUBGROUP');
            expect(menuTitles).toContain('None');
            expect(menuTitles).toContain('Status');
            expect(menuTitles).not.toContain('Priority'); // Should be excluded
            expect(menuTitles).toContain('Context');
        });

        test('should include user-defined properties in subgroup options', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'status',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            const addItemCalls = mockMenu.addItem.mock.calls;
            const menuTitles = addItemCalls.map(call => {
                const itemCallback = call[0];
                const mockItem = {
                    setTitle: jest.fn(),
                    setIcon: jest.fn(),
                    setDisabled: jest.fn(),
                    onClick: jest.fn()
                };
                itemCallback(mockItem);
                return mockItem.setTitle.mock.calls[0]?.[0];
            });

            expect(menuTitles).toContain('Custom Field 1');
            expect(menuTitles).toContain('Custom Field 2');
        });

        test('should mark current subgroup key as selected', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'status',
                currentSubgroupKey: 'priority',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            // Find the Priority item and verify it has a check icon
            const addItemCalls = mockMenu.addItem.mock.calls;
            let priorityItemFound = false;

            addItemCalls.forEach(call => {
                const itemCallback = call[0];
                const mockItem = {
                    setTitle: jest.fn(),
                    setIcon: jest.fn(),
                    setDisabled: jest.fn(),
                    onClick: jest.fn()
                };
                itemCallback(mockItem);
                
                if (mockItem.setTitle.mock.calls[0]?.[0] === 'Priority') {
                    expect(mockItem.setIcon).toHaveBeenCalledWith('check');
                    priorityItemFound = true;
                }
            });

            expect(priorityItemFound).toBe(true);
        });

        test('should call onSubgroupSelect when item is clicked', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'status',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            subgroupMenuBuilder.addSubgroupSection(mockMenu);

            // Find the Priority item and simulate click
            const addItemCalls = mockMenu.addItem.mock.calls;
            
            addItemCalls.forEach(call => {
                const itemCallback = call[0];
                const mockItem = {
                    setTitle: jest.fn(),
                    setIcon: jest.fn(),
                    setDisabled: jest.fn(),
                    onClick: jest.fn()
                };
                itemCallback(mockItem);
                
                if (mockItem.setTitle.mock.calls[0]?.[0] === 'Priority') {
                    // Simulate click
                    const onClickCallback = mockItem.onClick.mock.calls[0][0];
                    onClickCallback();
                    
                    expect(mockOnSubgroupSelect).toHaveBeenCalledWith('priority');
                }
            });
        });
    });

    describe('getAvailableSubgroupOptions', () => {
        test('should return all options except current group key', () => {
            const options: SubgroupMenuOptions = {
                currentGroupKey: 'status',
                filterOptions: createMockFilterOptions(),
                onSubgroupSelect: mockOnSubgroupSelect
            };

            subgroupMenuBuilder = new SubgroupMenuBuilder(options);
            const availableOptions = (subgroupMenuBuilder as any).getAvailableSubgroupOptions();

            expect(availableOptions).toHaveProperty('priority');
            expect(availableOptions).toHaveProperty('context');
            expect(availableOptions).toHaveProperty('project');
            expect(availableOptions).not.toHaveProperty('status'); // Should be excluded
            expect(availableOptions).toHaveProperty('user:custom1');
            expect(availableOptions).toHaveProperty('user:custom2');
        });
    });
});
