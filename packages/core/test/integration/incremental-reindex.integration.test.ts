import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TestContextBuilder } from '../doubles/test-context-builder.js';
import { FakeVectorDatabase } from '../doubles/fake-vector-database.js';
import { FakeEmbedding } from '../doubles/fake-embedding.js';
import { Context } from '../../src/context.js';
import { FileSynchronizer } from '../../src/sync/synchronizer.js';

/**
 * Integration tests for incremental reindexing (reindexByChange)
 *
 * Tests the complete workflow of detecting and reindexing changed files:
 * - Adding new files and indexing their chunks
 * - Modifying existing files and updating their chunks
 * - Deleting files and removing their chunks
 * - Combined operations in a single reindex
 */
describe('Incremental Reindex Integration', () => {
    let context: Context;
    let fakeDb: FakeVectorDatabase;
    let fakeEmbedding: FakeEmbedding;
    let testDir: string;
    let collectionName: string;

    beforeEach(async () => {
        // Create test doubles
        fakeDb = new FakeVectorDatabase({ address: 'test' });
        fakeEmbedding = new FakeEmbedding(128);

        // Create context with test doubles
        context = new TestContextBuilder()
            .withEmbedding(fakeEmbedding)
            .withVectorDatabase(fakeDb)
            .build();

        // Create temporary test directory
        testDir = path.join(os.tmpdir(), `context-reindex-test-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });

        collectionName = context.getCollectionName(testDir);
    });

    afterEach(async () => {
        // Clean up test directory and snapshot
        try {
            await fs.rm(testDir, { recursive: true, force: true });
            await FileSynchronizer.deleteSnapshot(testDir);
        } catch (error) {
            console.warn('Cleanup error:', error);
        }

        // Reset test doubles
        fakeDb.reset();
        fakeEmbedding.reset();
    });

    describe('Initial Indexing', () => {
        it('should perform full index on first call', async () => {
            // Arrange: Create initial files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const x = 1;');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const y = 2;');

            // Act: First index (full index, not incremental)
            const result = await context.indexCodebase(testDir);

            // Assert: Files indexed
            expect(result.indexedFiles).toBe(2);
            expect(result.totalChunks).toBeGreaterThan(0);
            expect(result.status).toBe('completed');

            // Verify collection created and populated
            expect(await fakeDb.hasCollection(collectionName)).toBe(true);
            const docCount = fakeDb.getCollectionDocumentCount(collectionName);
            expect(docCount).toBeGreaterThan(0);
        });

        it('should create synchronizer when reindexByChange is called', async () => {
            // Arrange
            await fs.writeFile(path.join(testDir, 'file.ts'), 'code');
            await context.indexCodebase(testDir);

            // Act: reindexByChange creates the synchronizer
            await context.reindexByChange(testDir);

            // Assert: Synchronizer should exist
            const synchronizers = context.getSynchronizers();
            expect(synchronizers.has(collectionName)).toBe(true);
        });
    });

    describe('Adding New Files', () => {
        beforeEach(async () => {
            // Create initial codebase and index
            await fs.writeFile(path.join(testDir, 'existing.ts'), 'export const existing = true;');
            await context.indexCodebase(testDir);

            // IMPORTANT: Call reindexByChange once to create baseline snapshot
            await context.reindexByChange(testDir);
        });

        it('should index newly added file', async () => {
            // Arrange: Get initial document count
            const initialCount = fakeDb.getCollectionDocumentCount(collectionName);

            // Act: Add new file
            await fs.writeFile(path.join(testDir, 'new.ts'), 'export const newFile = true;');

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.added).toBe(1);
            expect(result.modified).toBe(0);
            expect(result.removed).toBe(0);

            // Verify new chunks added
            const finalCount = fakeDb.getCollectionDocumentCount(collectionName);
            expect(finalCount).toBeGreaterThan(initialCount);
        });

        it('should index multiple new files', async () => {
            // Arrange
            const initialCount = fakeDb.getCollectionDocumentCount(collectionName);

            // Act: Add multiple files
            await fs.writeFile(path.join(testDir, 'new1.ts'), 'export const a = 1;');
            await fs.writeFile(path.join(testDir, 'new2.ts'), 'export const b = 2;');
            await fs.writeFile(path.join(testDir, 'new3.ts'), 'export const c = 3;');

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.added).toBe(3);
            expect(result.modified).toBe(0);
            expect(result.removed).toBe(0);

            // Verify chunks added for all files
            const finalCount = fakeDb.getCollectionDocumentCount(collectionName);
            expect(finalCount).toBeGreaterThan(initialCount);
        });

        it('should index file added in new subdirectory', async () => {
            // Act: Add file in new directory
            await fs.mkdir(path.join(testDir, 'components'), { recursive: true });
            await fs.writeFile(
                path.join(testDir, 'components', 'Button.tsx'),
                'export const Button = () => <button />;'
            );

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.added).toBe(1);

            // Verify document contains correct relative path
            const documents = fakeDb.getStoredDocuments(collectionName);
            const buttonDocs = documents.filter(doc =>
                doc.relativePath.includes('Button.tsx')
            );
            expect(buttonDocs.length).toBeGreaterThan(0);
        });
    });

    describe('Modifying Existing Files', () => {
        beforeEach(async () => {
            // Create and index initial files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const x = 1;');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const y = 2;');
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);
        });

        it('should reindex modified file', async () => {
            // Arrange: Get initial state
            const initialDocs = fakeDb.getStoredDocuments(collectionName);
            const initialFile1Chunks = initialDocs.filter(doc => doc.relativePath.includes('file1.ts'));
            const initialCount = fakeDb.getCollectionDocumentCount(collectionName);

            // Act: Modify file
            await fs.writeFile(
                path.join(testDir, 'file1.ts'),
                'export const x = 100; // Modified with more content to change chunk count'
            );

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.added).toBe(0);
            expect(result.modified).toBe(1);
            expect(result.removed).toBe(0);

            // Verify old chunks removed and new chunks added
            const finalDocs = fakeDb.getStoredDocuments(collectionName);
            const finalFile1Chunks = finalDocs.filter(doc => doc.relativePath.includes('file1.ts'));

            // Old chunks should be gone
            const oldChunkIds = initialFile1Chunks.map(doc => doc.id);
            const remainingOldChunks = finalDocs.filter(doc => oldChunkIds.includes(doc.id));
            expect(remainingOldChunks).toHaveLength(0);

            // New chunks should exist
            expect(finalFile1Chunks.length).toBeGreaterThan(0);
        });

        it('should handle multiple modified files', async () => {
            // Act: Modify both files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const x = 1000;');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const y = 2000;');

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.modified).toBe(2);
            expect(result.added).toBe(0);
            expect(result.removed).toBe(0);
        });

        it('should update chunks with new content', async () => {
            // Arrange: Get original content
            const originalDocs = fakeDb.getStoredDocuments(collectionName);
            const originalFile1Doc = originalDocs.find(doc => doc.relativePath.includes('file1.ts'));
            const originalContent = originalFile1Doc?.content;

            // Act: Modify with distinctive content (use code, not comments, to ensure it's captured)
            const newContent = 'export const UNIQUE_MARKER_12345 = 999;';
            await fs.writeFile(path.join(testDir, 'file1.ts'), newContent);

            await context.reindexByChange(testDir);

            // Assert: New content indexed
            const updatedDocs = fakeDb.getStoredDocuments(collectionName);
            const updatedFile1Docs = updatedDocs.filter(doc => doc.relativePath.includes('file1.ts'));
            const hasNewContent = updatedFile1Docs.some(doc =>
                doc.content.includes('UNIQUE_MARKER_12345')
            );

            expect(hasNewContent).toBe(true);
            expect(updatedFile1Docs[0].content).not.toBe(originalContent);
        });
    });

    describe('Deleting Files', () => {
        beforeEach(async () => {
            // Create and index initial files
            await fs.writeFile(path.join(testDir, 'keep.ts'), 'export const keep = true;');
            await fs.writeFile(path.join(testDir, 'delete1.ts'), 'export const delete1 = true;');
            await fs.writeFile(path.join(testDir, 'delete2.ts'), 'export const delete2 = true;');
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);
        });

        it('should remove chunks for deleted file', async () => {
            // Arrange: Get initial state
            const initialDocs = fakeDb.getStoredDocuments(collectionName);
            const delete1Chunks = initialDocs.filter(doc => doc.relativePath.includes('delete1.ts'));
            expect(delete1Chunks.length).toBeGreaterThan(0);

            // Act: Delete file
            await fs.unlink(path.join(testDir, 'delete1.ts'));

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.removed).toBe(1);
            expect(result.added).toBe(0);
            expect(result.modified).toBe(0);

            // Verify chunks removed
            const finalDocs = fakeDb.getStoredDocuments(collectionName);
            const remainingDelete1Chunks = finalDocs.filter(doc =>
                doc.relativePath.includes('delete1.ts')
            );
            expect(remainingDelete1Chunks).toHaveLength(0);

            // Verify other files still present
            const keepChunks = finalDocs.filter(doc => doc.relativePath.includes('keep.ts'));
            expect(keepChunks.length).toBeGreaterThan(0);
        });

        it('should handle multiple deleted files', async () => {
            // Act: Delete multiple files
            await fs.unlink(path.join(testDir, 'delete1.ts'));
            await fs.unlink(path.join(testDir, 'delete2.ts'));

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.removed).toBe(2);

            // Verify all chunks removed
            const finalDocs = fakeDb.getStoredDocuments(collectionName);
            const deletedChunks = finalDocs.filter(doc =>
                doc.relativePath.includes('delete1.ts') || doc.relativePath.includes('delete2.ts')
            );
            expect(deletedChunks).toHaveLength(0);
        });
    });

    describe('Combined Operations', () => {
        beforeEach(async () => {
            // Create initial codebase
            await fs.writeFile(path.join(testDir, 'keep.ts'), 'export const keep = true;');
            await fs.writeFile(path.join(testDir, 'modify.ts'), 'export const modify = 1;');
            await fs.writeFile(path.join(testDir, 'delete.ts'), 'export const delete = true;');
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);
        });

        it('should handle add, modify, and delete in same reindex', async () => {
            // Act: All three operations
            await fs.writeFile(path.join(testDir, 'new.ts'), 'export const newFile = true;');
            await fs.writeFile(path.join(testDir, 'modify.ts'), 'export const modify = 999;');
            await fs.unlink(path.join(testDir, 'delete.ts'));

            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.added).toBe(1);
            expect(result.modified).toBe(1);
            expect(result.removed).toBe(1);

            // Verify final state
            const finalDocs = fakeDb.getStoredDocuments(collectionName);

            // New file present
            const newChunks = finalDocs.filter(doc => doc.relativePath.includes('new.ts'));
            expect(newChunks.length).toBeGreaterThan(0);

            // Modified file has updated content
            const modifyChunks = finalDocs.filter(doc => doc.relativePath.includes('modify.ts'));
            expect(modifyChunks.length).toBeGreaterThan(0);
            expect(modifyChunks[0].content).toContain('999');

            // Deleted file absent
            const deleteChunks = finalDocs.filter(doc => doc.relativePath.includes('delete.ts'));
            expect(deleteChunks).toHaveLength(0);

            // Kept file still present
            const keepChunks = finalDocs.filter(doc => doc.relativePath.includes('keep.ts'));
            expect(keepChunks.length).toBeGreaterThan(0);
        });

        it('should handle sequential reindex operations', async () => {
            // Act: First change
            await fs.writeFile(path.join(testDir, 'new1.ts'), 'export const new1 = true;');
            const result1 = await context.reindexByChange(testDir);

            // Act: Second change
            await fs.writeFile(path.join(testDir, 'new2.ts'), 'export const new2 = true;');
            await fs.writeFile(path.join(testDir, 'new1.ts'), 'export const new1 = false; // modified');
            const result2 = await context.reindexByChange(testDir);

            // Assert: First reindex
            expect(result1.added).toBe(1);
            expect(result1.modified).toBe(0);

            // Assert: Second reindex
            expect(result2.added).toBe(1); // new2.ts
            expect(result2.modified).toBe(1); // new1.ts modified
        });
    });

    describe('No Changes', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(testDir, 'file.ts'), 'export const x = 1;');
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);
        });

        it('should return zero changes when nothing changed', async () => {
            // Act: Reindex without making changes
            const result = await context.reindexByChange(testDir);

            // Assert
            expect(result.added).toBe(0);
            expect(result.modified).toBe(0);
            expect(result.removed).toBe(0);
        });

        it('should not modify collection when no changes', async () => {
            // Arrange
            const initialCount = fakeDb.getCollectionDocumentCount(collectionName);

            // Act
            await context.reindexByChange(testDir);

            // Assert: Document count unchanged
            const finalCount = fakeDb.getCollectionDocumentCount(collectionName);
            expect(finalCount).toBe(initialCount);
        });
    });

    describe('Progress Tracking', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const x = 1;');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const y = 2;');
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);
        });

        it('should report progress during reindex', async () => {
            // Arrange: Track progress updates
            const progressUpdates: Array<{ phase: string; percentage: number }> = [];
            const progressCallback = (progress: any) => {
                progressUpdates.push({
                    phase: progress.phase,
                    percentage: progress.percentage
                });
            };

            // Act: Make changes and reindex with progress tracking
            await fs.writeFile(path.join(testDir, 'new.ts'), 'new');
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'modified');
            await fs.unlink(path.join(testDir, 'file2.ts'));

            await context.reindexByChange(testDir, progressCallback);

            // Assert: Progress reported
            expect(progressUpdates.length).toBeGreaterThan(0);

            // Should start with checking phase
            expect(progressUpdates[0].phase).toContain('Checking');

            // Should reach 100% if changes exist
            const finalUpdate = progressUpdates[progressUpdates.length - 1];
            if (progressUpdates.length > 1) {
                expect(finalUpdate.percentage).toBe(100);
            }
        });

        it('should report no changes with progress callback', async () => {
            // Arrange
            const progressUpdates: any[] = [];
            const progressCallback = (progress: any) => {
                progressUpdates.push(progress);
            };

            // Act: No changes
            await context.reindexByChange(testDir, progressCallback);

            // Assert: Progress reported even with no changes
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates.some(p => p.phase.includes('No changes'))).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent codebase path', async () => {
            // Arrange
            const nonExistentPath = path.join(testDir, 'does-not-exist');

            // Act & Assert
            await expect(context.reindexByChange(nonExistentPath)).rejects.toThrow();
        });

        it('should handle corrupted snapshot gracefully', async () => {
            // Arrange: Create and index codebase
            await fs.writeFile(path.join(testDir, 'file.ts'), 'code');
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);

            // Corrupt the snapshot by deleting it
            await FileSynchronizer.deleteSnapshot(testDir);

            // Act: Should reinitialize and detect new file as added
            await fs.writeFile(path.join(testDir, 'new.ts'), 'new file');
            const result = await context.reindexByChange(testDir);

            // Assert: Should work despite corrupted snapshot
            // Will reinitialize and detect the new file
            expect(result.added).toBeGreaterThan(0);
        });
    });

    describe('Large Scale Changes', () => {
        it('should handle many files efficiently', async () => {
            // Arrange: Create initial files
            for (let i = 0; i < 20; i++) {
                await fs.writeFile(path.join(testDir, `file${i}.ts`), `export const x${i} = ${i};`);
            }
            await context.indexCodebase(testDir);

            // Create baseline snapshot
            await context.reindexByChange(testDir);

            // Act: Modify subset and add new files
            // Start at i=1 to avoid file0.ts having same content (0 * 100 = 0)
            for (let i = 1; i <= 5; i++) {
                await fs.writeFile(path.join(testDir, `file${i}.ts`), `export const x${i} = ${i * 100};`);
            }
            for (let i = 0; i < 3; i++) {
                await fs.writeFile(path.join(testDir, `new${i}.ts`), `export const new${i} = true;`);
            }

            const startTime = Date.now();
            const result = await context.reindexByChange(testDir);
            const duration = Date.now() - startTime;

            // Assert
            expect(result.modified).toBe(5);
            expect(result.added).toBe(3);
            expect(duration).toBeLessThan(5000); // Should complete in reasonable time
        });
    });
});
