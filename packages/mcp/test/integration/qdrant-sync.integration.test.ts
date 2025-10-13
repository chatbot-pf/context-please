import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { Context, QdrantVectorDatabase } from '@pleaseai/context-please-core';
import { ToolHandlers } from '../../src/handlers.js';
import { FakeSnapshotManager } from '../doubles/fake-snapshot-manager.js';
import { FakeEmbedding } from '../../../core/test/doubles/fake-embedding.js';

/**
 * Integration test for Qdrant-specific syncIndexedCodebasesFromCloud() issue
 *
 * Reproduces the bug where:
 * 1. Background indexing starts (collection created but empty)
 * 2. syncIndexedCodebasesFromCloud() is called
 * 3. Empty collection causes codebase to be removed from snapshot
 * 4. search_code returns "not indexed" error
 */
describe('Qdrant Sync During Background Indexing', () => {
    let handlers: ToolHandlers;
    let context: Context;
    let snapshotManager: FakeSnapshotManager;
    let qdrantDb: QdrantVectorDatabase;
    let fixturesPath: string;

    // Use real Qdrant if available, otherwise skip tests
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const skipQdrant = !process.env.QDRANT_URL && !process.env.CI;

    beforeEach(async () => {
        if (skipQdrant) {
            console.log('⏭️  Skipping Qdrant tests (QDRANT_URL not set)');
            return;
        }

        // Create real Qdrant connection
        qdrantDb = new QdrantVectorDatabase({
            address: qdrantUrl
        });

        // Create Context with fake embedding and real Qdrant
        const fakeEmbedding = new FakeEmbedding();
        context = new Context({
            embedding: fakeEmbedding,
            vectorDatabase: qdrantDb
        });

        // Create fake snapshot manager
        snapshotManager = new FakeSnapshotManager();

        // Create handlers
        handlers = new ToolHandlers(context, snapshotManager);

        // Path to test fixtures
        fixturesPath = path.join(__dirname, '../../../core/test/fixtures/sample-codebase');
    });

    afterEach(async () => {
        if (skipQdrant) return;

        // Clean up: Clear any test collections
        try {
            await context.clearIndex(fixturesPath);
        } catch (e) {
            // Ignore if collection doesn't exist
        }

        snapshotManager.reset();
    });

    it('should reproduce: syncIndexedCodebasesFromCloud removes indexing codebase from snapshot', async () => {
        if (skipQdrant) return;

        // Arrange: Simulate background indexing starting
        // 1. Create collection (happens during indexing initialization)
        const collectionName = context.getCollectionName(fixturesPath);
        await qdrantDb.createCollection(collectionName, 1536, { useSparse: true });

        // 2. Mark as indexing in snapshot
        snapshotManager.setCodebaseIndexing(fixturesPath, 10); // 10% progress

        // 3. Collection exists but is empty (no documents inserted yet)
        const collections = await qdrantDb.listCollections();
        expect(collections).toContain(collectionName);

        // Act: Call syncIndexedCodebasesFromCloud (happens in handleSearchCode)
        // This simulates what happens when search_code is called during indexing
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Assert: Codebase should NOT be removed from snapshot
        // (This is where the bug occurs - it gets removed because collection is empty)
        const indexingCodebases = snapshotManager.getIndexingCodebases();
        expect(indexingCodebases).toContain(fixturesPath);
    });

    it('should fix: syncIndexedCodebasesFromCloud preserves indexing codebases', async () => {
        if (skipQdrant) return;

        // Arrange: Same setup as above
        const collectionName = context.getCollectionName(fixturesPath);
        await qdrantDb.createCollection(collectionName, 1536, { useSparse: true });
        snapshotManager.setCodebaseIndexing(fixturesPath, 25);

        // Act: Call sync
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Assert: With the fix, indexing codebases should be preserved
        const indexingCodebases = snapshotManager.getIndexingCodebases();
        expect(indexingCodebases).toContain(fixturesPath);

        // Verify snapshot is not empty
        const allCodebases = [...snapshotManager.getIndexedCodebases(), ...indexingCodebases];
        expect(allCodebases.length).toBeGreaterThan(0);
    });

    it('should allow search during indexing after sync', async () => {
        if (skipQdrant) return;

        // Arrange: Fully index a codebase
        await context.indexCodebase(fixturesPath);
        snapshotManager.setCodebaseIndexing(fixturesPath, 50);

        // Act 1: Sync (should preserve indexing status)
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Act 2: Try to search
        const searchResult = await handlers.handleSearchCode({
            path: fixturesPath,
            query: 'user service',
            limit: 5
        });

        // Assert: Search should work (not return "not indexed" error)
        expect(searchResult.isError).not.toBe(true);
        expect(searchResult.content[0].text).not.toContain('not indexed');
        expect(searchResult.content[0].text).toContain('Indexing in Progress');
    });

    it('should handle completed indexing correctly after sync', async () => {
        if (skipQdrant) return;

        // Arrange: Fully index and mark as completed
        await context.indexCodebase(fixturesPath);
        snapshotManager.setCodebaseIndexed(fixturesPath, {
            indexedFiles: 3,
            totalChunks: 28,
            status: 'completed'
        });

        // Act: Sync
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Assert: Indexed status should be preserved
        const indexedCodebases = snapshotManager.getIndexedCodebases();
        expect(indexedCodebases).toContain(fixturesPath);

        // Search should work
        const searchResult = await handlers.handleSearchCode({
            path: fixturesPath,
            query: 'user',
            limit: 5
        });

        expect(searchResult.isError).not.toBe(true);
        expect(searchResult.content[0].text).toContain('Found');
    });

    it('should remove truly orphaned indexed codebases from snapshot', async () => {
        if (skipQdrant) return;

        // Arrange: Add a codebase to snapshot that has NO collection in Qdrant
        // This codebase is marked as "indexed" (not "indexing"), so it should be removed
        const orphanedPath = '/tmp/orphaned-codebase-that-never-existed';
        snapshotManager.setCodebaseIndexed(orphanedPath, {
            indexedFiles: 10,
            totalChunks: 50,
            status: 'completed'
        });

        // Verify it's in snapshot before sync
        expect(snapshotManager.getIndexedCodebases()).toContain(orphanedPath);

        // Act: Sync
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Assert: Orphaned codebase should be removed (because it's not indexing)
        const indexedCodebases = snapshotManager.getIndexedCodebases();
        expect(indexedCodebases).not.toContain(orphanedPath);
    });

    it('should NOT remove orphaned indexing codebases from snapshot', async () => {
        if (skipQdrant) return;

        // Arrange: Add a codebase that is currently "indexing" but has no collection yet
        // This simulates the race condition where sync happens before collection is created
        const indexingOrphanPath = '/tmp/indexing-orphan-codebase';
        snapshotManager.setCodebaseIndexing(indexingOrphanPath, 5);

        // Verify it's in snapshot before sync
        expect(snapshotManager.getIndexingCodebases()).toContain(indexingOrphanPath);

        // Act: Sync
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Assert: Indexing codebase should NOT be removed (this is the fix)
        const indexingCodebases = snapshotManager.getIndexingCodebases();
        expect(indexingCodebases).toContain(indexingOrphanPath);
    });

    it('should handle empty collections during indexing gracefully', async () => {
        if (skipQdrant) return;

        // Arrange: Create collection but don't insert any documents yet
        const collectionName = context.getCollectionName(fixturesPath);
        await qdrantDb.createCollection(collectionName, 1536, { useSparse: true });
        snapshotManager.setCodebaseIndexing(fixturesPath, 0); // Just started

        // Act: Multiple syncs (simulates multiple search attempts)
        await (handlers as any).syncIndexedCodebasesFromCloud();
        await (handlers as any).syncIndexedCodebasesFromCloud();
        await (handlers as any).syncIndexedCodebasesFromCloud();

        // Assert: Codebase should still be in snapshot
        const indexingCodebases = snapshotManager.getIndexingCodebases();
        expect(indexingCodebases).toContain(fixturesPath);
    });
});