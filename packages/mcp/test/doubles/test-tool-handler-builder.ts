import { Context } from '@pleaseai/context-please-core';
import { FakeVectorDatabase } from '@pleaseai/context-please-core/test/doubles/fake-vector-database.js';
import { FakeEmbedding } from '@pleaseai/context-please-core/test/doubles/fake-embedding.js';
import { TestContextBuilder } from '@pleaseai/context-please-core/test/doubles/test-context-builder.js';
import { ToolHandlers } from '../../src/handlers.js';
import { FakeSnapshotManager } from './fake-snapshot-manager.js';

/**
 * TestToolHandlerBuilder
 *
 * Fluent API for building ToolHandlers with test doubles for integration testing.
 *
 * Example:
 *   const {handlers, context, snapshotManager} = new TestToolHandlerBuilder()
 *     .withFakeEmbedding(128)
 *     .withFakeVectorDatabase()
 *     .build();
 */
export class TestToolHandlerBuilder {
    private context?: Context;
    private snapshotManager?: FakeSnapshotManager;
    private embeddingDimension: number = 128;

    public withContext(context: Context): this {
        this.context = context;
        return this;
    }

    public withSnapshotManager(snapshotManager: FakeSnapshotManager): this {
        this.snapshotManager = snapshotManager;
        return this;
    }

    public withEmbeddingDimension(dimension: number): this {
        this.embeddingDimension = dimension;
        return this;
    }

    public build(): {
        handlers: ToolHandlers;
        context: Context;
        snapshotManager: FakeSnapshotManager;
        fakeDb: FakeVectorDatabase;
        fakeEmbedding: FakeEmbedding;
    } {
        // Create default test doubles if not provided
        const fakeDb = new FakeVectorDatabase({ address: 'test' });
        const fakeEmbedding = new FakeEmbedding(this.embeddingDimension);

        const context = this.context || new TestContextBuilder()
            .withEmbedding(fakeEmbedding)
            .withVectorDatabase(fakeDb)
            .build();

        const snapshotManager = this.snapshotManager || new FakeSnapshotManager();

        const handlers = new ToolHandlers(context, snapshotManager as any);

        return {
            handlers,
            context,
            snapshotManager,
            fakeDb,
            fakeEmbedding,
        };
    }

    /**
     * Static helper to create a fully configured test setup in one call
     */
    public static createDefault(): {
        handlers: ToolHandlers;
        context: Context;
        snapshotManager: FakeSnapshotManager;
        fakeDb: FakeVectorDatabase;
        fakeEmbedding: FakeEmbedding;
    } {
        return new TestToolHandlerBuilder().build();
    }
}
