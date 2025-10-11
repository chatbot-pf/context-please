# TESTING.md

This document provides comprehensive testing guidelines for the spec-kit-sdk project, combining industry best practices with project-specific patterns.

## Testing Philosophy

### FIRST Principles

All tests should follow the FIRST principles:

- **Fast**: Tests should run quickly
- **Isolated**: Tests should not depend on each other
- **Repeatable**: Tests should produce consistent results in any environment
- **Self-checking**: Tests should have clear pass/fail outcomes
- **Timely**: Tests should be written alongside production code

### Testing Approach

We follow a hybrid approach combining Classical TDD and Mockist TDD:

- **Classical TDD**: Use real objects when possible, focus on final state
- **Mockist TDD**: Use test doubles for external dependencies and complex collaborations

## Test Double Patterns

Based on Martin Fowler's Test Double taxonomy, we use these patterns:

### 1. Dummy Objects
Objects passed around but never actually used. Typically fill parameter lists.

```typescript
// Example: Dummy callback that's never called
const dummyCallback = () => {}
await someFunction(data, dummyCallback)
```

### 2. Fake Objects
Working implementations with shortcuts unsuitable for production.

**Example**: `MockSyncAdapter` (plugins/sync/test/fixtures/mock-adapter.ts:5)
```typescript
export class MockSyncAdapter extends SyncAdapter {
  private mockSpecs = new Map<string, any>() // In-memory storage instead of real sync

  async push(spec: SpecDocument): Promise<RemoteRef> {
    // Simplified implementation for testing
    this.mockSpecs.set(spec.name, { id: Math.random(), title: spec.name })
    return { id: mockData.id, type: 'parent' }
  }
}
```

### 3. Stubs
Provide predetermined answers to calls made during tests.

```typescript
// Example: Stub that returns predefined values
class StubAuthService {
  async checkAuth(): Promise<boolean> {
    return true // Always returns true
  }
}
```

### 4. Spies
Stubs that record information about how they were called.

```typescript
// Example: Tracking calls in our test doubles
class SpyGitHubClient {
  public createIssueCalls: Array<{ title: string, body: string }> = []

  async createIssue(title: string, body: string): Promise<number> {
    this.createIssueCalls.push({ title, body }) // Records the call
    return 123
  }
}
```

### 5. Mocks
Pre-programmed with expectations of the calls they should receive.

**Example**: `EnhancedMockGitHubClient` (plugins/sync/test/mocks/github-client.mock.ts:16)
```typescript
export class EnhancedMockGitHubClient extends GitHubClient {
  // Call tracking for behavior verification
  public createIssueCalls: Array<{ title: string, body: string, labels?: string[] }> = []
  public updateIssueCalls: Array<{ number: number, updates: GitHubIssueUpdate }> = []

  // Error injection capabilities
  private methodErrorMap = new Map<string, Error>()

  setMethodError(methodName: string, error: Error): void {
    this.methodErrorMap.set(methodName, error)
  }

  override async createIssue(title: string, body: string, labels?: string[]): Promise<number> {
    this.checkMethodError('createIssue') // Can throw expected errors
    this.createIssueCalls.push({ title, body, labels })
    return this.mockCreateIssueResult ?? this.nextIssueId++
  }
}
```

## Verification Strategies

### State Verification
Verify the final state after an operation.

```typescript
test('should update issue state', async () => {
  // Arrange
  const mockClient = new EnhancedMockGitHubClient()
  mockClient.setMockIssue(123, { number: 123, state: 'OPEN' })

  // Act
  await mockClient.closeIssue(123)

  // Assert - Check final state
  const issue = await mockClient.getIssue(123)
  expect(issue?.state).toBe('CLOSED')
})
```

### Behavior Verification
Verify the interactions between objects.

```typescript
test('should call GitHub API with correct parameters', async () => {
  // Arrange
  const mockClient = new MockGitHubClient()
  const adapter = new GitHubAdapter({ owner: 'test', repo: 'test' })
  adapter.client = mockClient

  // Act
  await adapter.push(mockSpec)

  // Assert - Check behavior
  expect(mockClient.createIssueCalls).toHaveLength(1)
  expect(mockClient.createIssueCalls[0]).toEqual({
    title: 'Test Spec',
    body: expect.stringContaining('This is a test'),
    labels: ['spec']
  })
})
```

## Test Structure

### Naming Conventions
Use descriptive test names that clearly indicate the scenario and expected behavior. Group related tests using `describe` blocks to organize by method or functionality.

```typescript
// ✅ Good - Group by method, clear scenario descriptions
describe('GitHubAdapter', () => {
  describe('push', () => {
    test('should create GitHub issue when spec is valid', async () => {})
    test('should handle missing labels gracefully', async () => {})
  })

  describe('getLabels', () => {
    test('should fallback to file type when document type missing from config', () => {})
    test('should combine common and type labels correctly', () => {})
  })
})

// ❌ Avoid - unclear or too generic
test('test push', async () => {})
test('labels work correctly', () => {})
```

### Arrange-Act-Assert (AAA) Pattern
Structure tests in three clear sections:

```typescript
test('should_combine_common_and_type_labels', () => {
  // Arrange
  const adapter = new GitHubAdapter({
    owner: 'test',
    repo: 'test',
    labels: {
      spec: ['spec', 'feature'],
      common: ['project', 'epic']
    }
  })

  // Act
  const result = adapter.getLabels('spec')

  // Assert
  expect(result).toEqual(['project', 'epic', 'spec', 'feature'])
})
```

### Test Organization
Group related tests using nested `describe` blocks:

```typescript
describe('GitHubAdapter', () => {
  describe('Label configuration', () => {
    test('should use default labels when no config provided', () => {})
    test('should use single string label from config', () => {})
    test('should use array labels from config', () => {})
  })

  describe('Repository configuration', () => {
    test('should pass owner and repo to GitHubClient', () => {})
  })
})
```

## Best Practices

### Test Independence
Each test should be independent and not rely on other tests:

```typescript
describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter
  let mockClient: MockGitHubClient

  beforeEach(() => {
    mockClient = new MockGitHubClient()
    mockClient.reset() // Clean state for each test
  })
})
```

### Error Testing
Test both success and failure scenarios:

```typescript
test('should handle authentication failure', async () => {
  // Arrange
  const mockClient = new EnhancedMockGitHubClient()
  mockClient.setMockAuthResult(false)

  // Act & Assert
  await expect(adapter.authenticate()).resolves.toBe(false)
})

test('should handle API errors gracefully', async () => {
  // Arrange
  const mockClient = new EnhancedMockGitHubClient()
  mockClient.setMethodError('createIssue', new Error('API Error'))

  // Act & Assert
  await expect(adapter.push(mockSpec)).rejects.toThrow('API Error')
})
```

### Private Method Testing
Don't test private methods directly. Test them through public interfaces:

```typescript
// ❌ Don't do this
test('private method works', () => {
  // @ts-expect-error - accessing private method
  expect(adapter.privateMethod()).toBe(expected)
})

// ✅ Do this instead
test('public method that uses private method works', () => {
  const result = adapter.publicMethod()
  expect(result).toBe(expected)
})
```

## Anti-Patterns to Avoid

### 1. Magic Strings and Numbers
```typescript
// ❌ Avoid
expect(result.id).toBe(123)
expect(result.status).toBe('open')

// ✅ Better
const EXPECTED_ISSUE_ID = 123
const ISSUE_STATUS_OPEN = 'open'
expect(result.id).toBe(EXPECTED_ISSUE_ID)
expect(result.status).toBe(ISSUE_STATUS_OPEN)
```

### 2. Testing Implementation Details
```typescript
// ❌ Avoid - testing internal structure
expect(adapter.client.owner).toBe('test-owner')

// ✅ Better - testing behavior
const result = await adapter.push(spec)
expect(result.id).toBeDefined()
```

### 3. Multiple Acts per Test
```typescript
// ❌ Avoid
test('multiple operations', async () => {
  await adapter.createIssue() // First act
  await adapter.updateIssue() // Second act - confusing
})

// ✅ Better - separate tests
test('should create issue', async () => {
  const result = await adapter.createIssue()
  expect(result).toBeDefined()
})

test('should update issue', async () => {
  const result = await adapter.updateIssue(123, updates)
  expect(result).toBeUndefined()
})
```

### 4. Overly Complex Test Setup
```typescript
// ❌ Avoid - complex setup obscures test intent
test('complex scenario', () => {
  const spec = createComplexSpecWithMultipleFilesAndDependencies()
  // ... 20 lines of setup
  expect(result).toBe(expected)
})

// ✅ Better - simple, focused setup
test('should handle basic spec', () => {
  const spec = createMockSpec('simple-feature')
  expect(adapter.push(spec)).resolves.toBeDefined()
})
```

## Integration Testing

Integration tests verify that multiple components work together correctly. Context Please includes comprehensive integration test suites for both the core indexing engine and the MCP server.

### Test Organization

```
packages/
├── core/test/integration/          # Core integration tests
│   ├── context.integration.test.ts              # Full indexing workflow (50 tests)
│   ├── file-synchronizer.integration.test.ts   # Merkle DAG sync (28 tests)
│   └── incremental-reindex.integration.test.ts # Incremental updates (27 tests)
└── mcp/test/integration/           # MCP server integration tests
    └── tool-handlers.integration.test.ts        # MCP tool handlers (30 tests)
```

### Core Integration Tests

#### Context Integration Tests (50 tests)
Tests the complete indexing and search workflow using real components with fake vector database and embeddings.

**Coverage**:
- Collection management (create, drop, check existence)
- Hybrid collection creation with BM25 + dense vectors
- Document indexing with AST-based code splitting
- Semantic search with relevance scoring
- Hybrid search combining BM25 and vector similarity
- Extension-based filtering
- Error handling and edge cases

**Example**:
```typescript
describe('Context Integration', () => {
    let context: Context;
    let fakeDb: FakeVectorDatabase;
    let fakeEmbedding: FakeEmbedding;

    beforeEach(() => {
        fakeDb = new FakeVectorDatabase({ address: 'test' });
        fakeEmbedding = new FakeEmbedding(128);
        context = new TestContextBuilder()
            .withEmbedding(fakeEmbedding)
            .withVectorDatabase(fakeDb)
            .build();
    });

    it('should index codebase and enable search', async () => {
        const result = await context.indexCodebase(fixturesPath);
        expect(result.status).toBe('completed');

        const searchResults = await context.semanticSearch(
            fixturesPath,
            'user authentication',
            5
        );
        expect(searchResults.results.length).toBeGreaterThan(0);
    });
});
```

#### File Synchronizer Integration Tests (28 tests)
Tests Merkle DAG-based change detection for incremental indexing.

**Coverage**:
- File addition detection
- File modification detection
- File deletion detection
- Directory structure changes
- Snapshot persistence and recovery
- Cross-instance state sharing
- Ignore pattern handling

**Key Pattern**: Uses temporary directories with file I/O to test real file system changes.

#### Incremental Reindex Integration Tests (27 tests)
Tests the complete incremental reindexing workflow using `reindexByChange`.

**Coverage**:
- Adding new files and indexing their chunks
- Modifying existing files and updating chunks
- Deleting files and removing chunks
- Combined operations in single reindex
- Error handling for non-existent paths
- Corrupted snapshot recovery
- Large-scale change performance

**Critical Pattern**: Always call `reindexByChange()` after `indexCodebase()` to establish baseline snapshot:

```typescript
beforeEach(async () => {
    await fs.writeFile(path.join(testDir, 'existing.ts'), 'code');
    await context.indexCodebase(testDir);

    // CRITICAL: Create baseline snapshot
    await context.reindexByChange(testDir);
});

it('should detect new files', async () => {
    await fs.writeFile(path.join(testDir, 'new.ts'), 'new code');
    const result = await context.reindexByChange(testDir);

    expect(result.added).toBe(1);
});
```

### MCP Integration Tests (30 tests)

Tests all MCP server tool handlers with realistic scenarios.

**Coverage**:
- `index_codebase`: Background indexing with all parameters
- `search_code`: Semantic search with various queries
- `clear_index`: Collection cleanup and error handling
- `get_indexing_status`: Progress tracking and status reporting
- Path resolution (relative to absolute)
- Extension and ignore pattern filtering
- Cloud synchronization simulation

**Test Doubles**:
- `FakeVectorDatabase`: In-memory vector storage with cosine similarity
- `FakeEmbedding`: Deterministic embeddings based on content hashing
- `FakeSnapshotManager`: In-memory snapshot tracking for MCP state
- `TestToolHandlerBuilder`: Fluent API for test setup

**Example**:
```typescript
describe('MCP Tool Handlers Integration', () => {
    let handlers: ToolHandlers;
    let fakeDb: FakeVectorDatabase;

    beforeEach(() => {
        const setup = new TestToolHandlerBuilder().build();
        handlers = setup.handlers;
        fakeDb = setup.fakeDb;
    });

    it('should index and search codebase', async () => {
        await handlers.handleIndexCodebase({
            path: fixturesPath,
            force: false
        });

        const result = await handlers.handleSearchCode({
            path: fixturesPath,
            query: 'user service',
            limit: 5
        });

        expect(result.content[0].text).toContain('Found');
    });
});
```

### Running Integration Tests

```bash
# Run all integration tests (both core and MCP)
pnpm test:integration

# Run core integration tests only
cd packages/core && pnpm test:integration

# Run specific integration test file
cd packages/core && pnpm test test/integration/context.integration.test.ts

# Run with verbose output
cd packages/core && pnpm test test/integration/incremental-reindex.integration.test.ts --reporter=verbose
```

### Integration Test Best Practices

1. **Use Real File System**: Create temporary directories for file-based tests
   ```typescript
   testDir = path.join(os.tmpdir(), `context-test-${Date.now()}`);
   await fs.mkdir(testDir, { recursive: true });
   ```

2. **Clean Up Resources**: Always clean up in `afterEach`
   ```typescript
   afterEach(async () => {
       await fs.rm(testDir, { recursive: true, force: true });
       await FileSynchronizer.deleteSnapshot(testDir);
       fakeDb.reset();
   });
   ```

3. **Test Realistic Scenarios**: Use actual code files, not minimal stubs
   ```typescript
   await fs.writeFile(
       path.join(testDir, 'service.ts'),
       'export class UserService { authenticate() {} }'
   );
   ```

4. **Verify End-to-End**: Check final state, not intermediate steps
   ```typescript
   // Good: Verify final database state
   const docs = fakeDb.getStoredDocuments(collectionName);
   expect(docs.some(d => d.content.includes('UserService'))).toBe(true);

   // Avoid: Testing internal implementation details
   ```

5. **Handle Async Operations**: Await all async operations properly
   ```typescript
   const result = await context.reindexByChange(testDir);
   expect(result.added).toBe(1);
   ```

### Test Coverage Goals

- **Core integration tests**: 93 tests (100% passing)
- **MCP integration tests**: 30 tests (100% passing)
- **Total**: 123 integration tests

Integration tests complement unit tests by verifying that components work together correctly in realistic scenarios.

## Project-Specific Guidelines

### Using Our Test Doubles

1. **Use `EnhancedMockGitHubClient`** for comprehensive GitHub API testing
2. **Use `MockSyncAdapter`** for sync engine testing
3. **Use `MockSpecToIssueMapper`** for mapping logic testing

### Test File Organization
```
plugins/sync/test/
├── adapters/           # Adapter-specific tests
├── core/              # Core functionality tests
├── fixtures/          # Test data and helpers
├── mocks/             # Reusable test doubles
└── schemas/           # Schema validation tests
```

### Running Tests

**Context Please (pnpm/vitest)**:
```bash
# Run all tests (unit + integration)
pnpm test

# Run only integration tests
pnpm test:integration

# Run core package tests
cd packages/core && pnpm test

# Run MCP package tests
cd packages/mcp && pnpm test

# Run specific test file
pnpm test packages/core/test/integration/context.integration.test.ts
```

### Test Configuration
Tests should be deterministic and independent. Our test doubles provide:
- **State management**: Track internal state for verification
- **Error injection**: Test error handling scenarios
- **Call tracking**: Verify behavior and interactions
- **Reset functionality**: Clean state between tests

## XState Testing Patterns

For testing XState machines and actors in the workflow engine, follow these patterns:

### Basic XState Testing Structure

Follow the **Arrange-Act-Assert** pattern specifically for XState actors:

```typescript
describe('WorkflowMachine', () => {
  test('should transition to next state on valid answer', () => {
    // Arrange - Create actor and start it
    const machine = createWorkflowMachine(mockWorkflowDefinition)
    const actor = createActor(machine)
    actor.start()

    // Act - Send event to actor
    actor.send({ type: 'SUBMIT_ANSWER', answer: 'yes' })

    // Assert - Verify state and context
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('nextQuestion')
    expect(snapshot.context.answers).toContain('yes')
  })
})
```

### Testing State Transitions

Test that machines transition correctly between states:

```typescript
test('should handle back navigation and reset answers', () => {
  // Arrange
  const actor = createActor(workflowMachine)
  actor.start()

  // Navigate forward first
  actor.send({ type: 'SUBMIT_ANSWER', answer: 'option1' })
  actor.send({ type: 'SUBMIT_ANSWER', answer: 'option2' })

  // Act - Navigate back
  actor.send({ type: 'GO_BACK' })

  // Assert - Check state and context reset
  const snapshot = actor.getSnapshot()
  expect(snapshot.value).toBe('question1')
  expect(snapshot.context.visitCounts.question2).toBe(0)
})
```

### Testing Guards and Actions

Test guards (conditions) and actions separately:

```typescript
describe('FEEL Guards', () => {
  test('should evaluate FEEL expression correctly', () => {
    // Arrange
    const context = { answers: { age: 25, hasInsurance: true } }
    const guard = createFeelGuard('age >= 18 and hasInsurance')

    // Act
    const result = guard({ context })

    // Assert
    expect(result).toBe(true)
  })
})

describe('Context Actions', () => {
  test('should record answer in context', () => {
    // Arrange
    const initialContext = { answers: {}, visitCounts: {} }
    const action = recordAnswerAction

    // Act
    const newContext = action({
      context: initialContext,
      event: { type: 'SUBMIT_ANSWER', questionId: 'q1', answer: 'yes' }
    })

    // Assert
    expect(newContext.answers.q1).toBe('yes')
  })
})
```

### Mocking External Services

Mock external dependencies like Firebase or API calls:

```typescript
describe('Document Service', () => {
  test('should calculate required documents', async () => {
    // Arrange - Mock Firebase service
    const mockStorageService = {
      loadWorkflow: vi.fn().mockResolvedValue(mockWorkflowData),
      saveExecution: vi.fn().mockResolvedValue({ id: 'exec-123' })
    }

    const service = new DocumentService(mockStorageService)

    // Act
    const documents = await service.calculateRequiredDocuments(context)

    // Assert
    expect(documents).toHaveLength(3)
    expect(mockStorageService.loadWorkflow).toHaveBeenCalledOnce()
  })
})
```

### Testing Asynchronous Actors

For testing actors with async operations:

```typescript
test('should handle async document loading', async () => {
  // Arrange
  const mockFetch = vi.fn().mockResolvedValue({
    data: mockDocumentRequirements
  })

  const machine = createWorkflowMachine({
    services: { loadDocuments: mockFetch }
  })
  const actor = createActor(machine)
  actor.start()

  // Act
  actor.send({ type: 'LOAD_DOCUMENTS' })

  // Wait for async operation
  await new Promise(resolve => setTimeout(resolve, 0))

  // Assert
  const snapshot = actor.getSnapshot()
  expect(snapshot.value).toBe('documentsLoaded')
  expect(snapshot.context.requiredDocuments).toBeDefined()
})
```

### Performance Testing for XState

Test performance requirements for state machines:

```typescript
describe('Performance Requirements', () => {
  test('should transition states in under 200ms', async () => {
    // Arrange
    const actor = createActor(complexWorkflowMachine)
    actor.start()

    // Act & Assert
    const startTime = performance.now()

    for (let i = 0; i < 100; i++) {
      actor.send({ type: 'SUBMIT_ANSWER', answer: `answer-${i}` })
    }

    const endTime = performance.now()
    const avgTransitionTime = (endTime - startTime) / 100

    expect(avgTransitionTime).toBeLessThan(200)
  })
})
```

### XState Testing Best Practices

1. **Use Real Machines**: Test with actual machine definitions, not mocks
2. **Test State and Context**: Verify both the current state and context changes
3. **Mock External Effects**: Use `vi.fn()` for services, but keep machine logic real
4. **Test Edge Cases**: Include loop prevention, invalid transitions, etc.
5. **Snapshot Testing**: Use snapshots for complex state structures

```typescript
test('should maintain correct state structure', () => {
  const actor = createActor(workflowMachine)
  actor.start()
  actor.send({ type: 'SUBMIT_ANSWER', answer: 'test' })

  expect(actor.getSnapshot()).toMatchSnapshot()
})
```

## Resources

- [Microsoft Unit Testing Best Practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)
- [Martin Fowler - Test Doubles](https://martinfowler.com/bliki/TestDouble.html)
- [Martin Fowler - Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
- [XState Testing Guide](https://stately.ai/docs/testing)
- [Project Standards](./STANDARDS.md)
- [Architecture Guide](./ARCHITECTURE.md)