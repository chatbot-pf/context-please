import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSynchronizer } from '../../src/sync/synchronizer.js';

/**
 * Integration tests for FileSynchronizer
 *
 * Tests Merkle DAG-based incremental file change detection:
 * - Initial snapshot creation
 * - Add/modify/delete file detection
 * - Ignore pattern handling
 * - Snapshot persistence and recovery
 */
describe('FileSynchronizer Integration', () => {
    let testDir: string;
    let synchronizer: FileSynchronizer;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = path.join(os.tmpdir(), `context-sync-test-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        // Clean up test directory and snapshot
        try {
            await fs.rm(testDir, { recursive: true, force: true });

            // Clean up snapshot file
            await FileSynchronizer.deleteSnapshot(testDir);
        } catch (error) {
            console.warn('Cleanup error:', error);
        }
    });

    describe('Initial Snapshot Creation', () => {
        it('should create initial snapshot for empty directory', async () => {
            // Arrange
            synchronizer = new FileSynchronizer(testDir);

            // Act
            await synchronizer.initialize();

            // Assert
            const changes = await synchronizer.checkForChanges();
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);
        });

        it('should create initial snapshot with existing files', async () => {
            // Arrange: Create some files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'console.log("hello");');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'console.log("world");');

            synchronizer = new FileSynchronizer(testDir);

            // Act
            await synchronizer.initialize();

            // Assert: No changes on first check
            const changes = await synchronizer.checkForChanges();
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);

            // Verify snapshot contains file hashes
            expect(synchronizer.getFileHash('file1.ts')).toBeDefined();
            expect(synchronizer.getFileHash('file2.ts')).toBeDefined();
        });

        it('should handle nested directory structures', async () => {
            // Arrange: Create nested structure
            await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
            await fs.mkdir(path.join(testDir, 'src/utils'), { recursive: true });
            await fs.writeFile(path.join(testDir, 'src/index.ts'), 'export {}');
            await fs.writeFile(path.join(testDir, 'src/utils/helper.ts'), 'export const help = () => {}');

            synchronizer = new FileSynchronizer(testDir);

            // Act
            await synchronizer.initialize();

            // Assert
            expect(synchronizer.getFileHash(path.join('src', 'index.ts'))).toBeDefined();
            expect(synchronizer.getFileHash(path.join('src', 'utils', 'helper.ts'))).toBeDefined();
        });
    });

    describe('File Addition Detection', () => {
        beforeEach(async () => {
            // Initialize with one file
            await fs.writeFile(path.join(testDir, 'existing.ts'), 'const x = 1;');
            synchronizer = new FileSynchronizer(testDir);
            await synchronizer.initialize();
            await synchronizer.checkForChanges(); // Baseline
        });

        it('should detect newly added file', async () => {
            // Arrange & Act: Add new file
            await fs.writeFile(path.join(testDir, 'new.ts'), 'const y = 2;');

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.added).toEqual(['new.ts']);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);
        });

        it('should detect multiple added files', async () => {
            // Arrange & Act: Add multiple files
            await fs.writeFile(path.join(testDir, 'new1.ts'), 'const a = 1;');
            await fs.writeFile(path.join(testDir, 'new2.ts'), 'const b = 2;');
            await fs.writeFile(path.join(testDir, 'new3.ts'), 'const c = 3;');

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.added).toHaveLength(3);
            expect(changes.added).toContain('new1.ts');
            expect(changes.added).toContain('new2.ts');
            expect(changes.added).toContain('new3.ts');
        });

        it('should detect added file in nested directory', async () => {
            // Arrange & Act: Add file in subdirectory
            await fs.mkdir(path.join(testDir, 'components'), { recursive: true });
            await fs.writeFile(path.join(testDir, 'components', 'Button.tsx'), '<button />');

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.added).toEqual([path.join('components', 'Button.tsx')]);
        });
    });

    describe('File Modification Detection', () => {
        beforeEach(async () => {
            // Initialize with files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'const x = 1;');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'const y = 2;');
            synchronizer = new FileSynchronizer(testDir);
            await synchronizer.initialize();
            await synchronizer.checkForChanges(); // Baseline
        });

        it('should detect modified file', async () => {
            // Arrange & Act: Modify file content
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'const x = 100; // changed');

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual(['file1.ts']);
        });

        it('should detect multiple modified files', async () => {
            // Arrange & Act: Modify multiple files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'modified 1');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'modified 2');

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.modified).toHaveLength(2);
            expect(changes.modified).toContain('file1.ts');
            expect(changes.modified).toContain('file2.ts');
        });

        it('should not detect unchanged files as modified', async () => {
            // Act: Check without making changes
            const changes = await synchronizer.checkForChanges();

            // Assert: No changes
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);
        });
    });

    describe('File Deletion Detection', () => {
        beforeEach(async () => {
            // Initialize with files
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'const x = 1;');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'const y = 2;');
            await fs.writeFile(path.join(testDir, 'file3.ts'), 'const z = 3;');
            synchronizer = new FileSynchronizer(testDir);
            await synchronizer.initialize();
            await synchronizer.checkForChanges(); // Baseline
        });

        it('should detect deleted file', async () => {
            // Arrange & Act: Delete file
            await fs.unlink(path.join(testDir, 'file2.ts'));

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual(['file2.ts']);
            expect(changes.modified).toEqual([]);
        });

        it('should detect multiple deleted files', async () => {
            // Arrange & Act: Delete multiple files
            await fs.unlink(path.join(testDir, 'file1.ts'));
            await fs.unlink(path.join(testDir, 'file3.ts'));

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.removed).toHaveLength(2);
            expect(changes.removed).toContain('file1.ts');
            expect(changes.removed).toContain('file3.ts');
        });
    });

    describe('Combined Changes', () => {
        beforeEach(async () => {
            // Initialize with files
            await fs.writeFile(path.join(testDir, 'existing.ts'), 'const x = 1;');
            await fs.writeFile(path.join(testDir, 'to-modify.ts'), 'const y = 2;');
            await fs.writeFile(path.join(testDir, 'to-delete.ts'), 'const z = 3;');
            synchronizer = new FileSynchronizer(testDir);
            await synchronizer.initialize();
            await synchronizer.checkForChanges(); // Baseline
        });

        it('should detect add, modify, and delete in same check', async () => {
            // Arrange & Act: Multiple operations
            await fs.writeFile(path.join(testDir, 'new.ts'), 'const new = 1;');
            await fs.writeFile(path.join(testDir, 'to-modify.ts'), 'const y = 200; // modified');
            await fs.unlink(path.join(testDir, 'to-delete.ts'));

            const changes = await synchronizer.checkForChanges();

            // Assert
            expect(changes.added).toEqual(['new.ts']);
            expect(changes.modified).toEqual(['to-modify.ts']);
            expect(changes.removed).toEqual(['to-delete.ts']);
        });

        it('should handle sequential change batches correctly', async () => {
            // Act: First batch of changes
            await fs.writeFile(path.join(testDir, 'new1.ts'), 'batch 1');
            const changes1 = await synchronizer.checkForChanges();

            // Act: Second batch of changes
            await fs.writeFile(path.join(testDir, 'new2.ts'), 'batch 2');
            await fs.writeFile(path.join(testDir, 'new1.ts'), 'batch 1 modified');
            const changes2 = await synchronizer.checkForChanges();

            // Assert: First batch
            expect(changes1.added).toEqual(['new1.ts']);

            // Assert: Second batch
            expect(changes2.added).toEqual(['new2.ts']);
            expect(changes2.modified).toEqual(['new1.ts']);
        });
    });

    describe('Ignore Patterns', () => {
        it('should ignore files matching patterns', async () => {
            // Arrange: Create files with some to ignore
            await fs.writeFile(path.join(testDir, 'include.ts'), 'included');
            await fs.writeFile(path.join(testDir, 'ignore.tmp'), 'ignored');
            await fs.writeFile(path.join(testDir, 'test.log'), 'ignored');

            synchronizer = new FileSynchronizer(testDir, ['*.tmp', '*.log']);
            await synchronizer.initialize();

            // Assert: Only included file is tracked
            expect(synchronizer.getFileHash('include.ts')).toBeDefined();
            expect(synchronizer.getFileHash('ignore.tmp')).toBeUndefined();
            expect(synchronizer.getFileHash('test.log')).toBeUndefined();
        });

        it('should ignore entire directories', async () => {
            // Arrange: Create directory structure
            await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
            await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
            await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'app code');
            await fs.writeFile(path.join(testDir, 'node_modules', 'lib.js'), 'library code');

            synchronizer = new FileSynchronizer(testDir, ['node_modules/**']);
            await synchronizer.initialize();

            // Assert: Only src files tracked
            expect(synchronizer.getFileHash(path.join('src', 'app.ts'))).toBeDefined();
            expect(synchronizer.getFileHash(path.join('node_modules', 'lib.js'))).toBeUndefined();
        });

        it('should ignore hidden files and directories', async () => {
            // Arrange: Create hidden files
            await fs.writeFile(path.join(testDir, 'visible.ts'), 'visible');
            await fs.writeFile(path.join(testDir, '.hidden'), 'hidden');
            await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
            await fs.writeFile(path.join(testDir, '.git', 'config'), 'git config');

            synchronizer = new FileSynchronizer(testDir); // No explicit patterns, should auto-ignore hidden
            await synchronizer.initialize();

            // Assert: Hidden files not tracked
            expect(synchronizer.getFileHash('visible.ts')).toBeDefined();
            expect(synchronizer.getFileHash('.hidden')).toBeUndefined();
            expect(synchronizer.getFileHash(path.join('.git', 'config'))).toBeUndefined();
        });

        it('should not detect changes to ignored files', async () => {
            // Arrange: Initialize with ignore patterns
            await fs.writeFile(path.join(testDir, 'tracked.ts'), 'tracked');
            await fs.writeFile(path.join(testDir, 'ignored.tmp'), 'ignored');

            synchronizer = new FileSynchronizer(testDir, ['*.tmp']);
            await synchronizer.initialize();
            await synchronizer.checkForChanges(); // Baseline

            // Act: Modify both tracked and ignored files
            await fs.writeFile(path.join(testDir, 'tracked.ts'), 'tracked modified');
            await fs.writeFile(path.join(testDir, 'ignored.tmp'), 'ignored modified');

            const changes = await synchronizer.checkForChanges();

            // Assert: Only tracked file detected
            expect(changes.modified).toEqual(['tracked.ts']);
        });
    });

    describe('Snapshot Persistence', () => {
        it('should persist and recover state across instances', async () => {
            // Arrange: Create files and initialize
            await fs.writeFile(path.join(testDir, 'file1.ts'), 'content 1');
            await fs.writeFile(path.join(testDir, 'file2.ts'), 'content 2');

            const sync1 = new FileSynchronizer(testDir);
            await sync1.initialize();
            const hash1 = sync1.getFileHash('file1.ts');

            // Act: Create new instance (should load from snapshot)
            const sync2 = new FileSynchronizer(testDir);
            await sync2.initialize();
            const hash2 = sync2.getFileHash('file1.ts');

            // Assert: Same hash recovered
            expect(hash2).toBe(hash1);
            expect(hash2).toBeDefined();
        });

        it('should detect changes across instance restarts', async () => {
            // Arrange: Initialize and create baseline
            await fs.writeFile(path.join(testDir, 'file.ts'), 'original');

            const sync1 = new FileSynchronizer(testDir);
            await sync1.initialize();
            await sync1.checkForChanges();

            // Act: Modify file and check with new instance
            await fs.writeFile(path.join(testDir, 'file.ts'), 'modified');

            const sync2 = new FileSynchronizer(testDir);
            await sync2.initialize();
            const changes = await sync2.checkForChanges();

            // Assert: Change detected
            expect(changes.modified).toEqual(['file.ts']);
        });

        it('should handle snapshot deletion', async () => {
            // Arrange: Create snapshot
            await fs.writeFile(path.join(testDir, 'file.ts'), 'content');
            const sync1 = new FileSynchronizer(testDir);
            await sync1.initialize();

            // Act: Delete snapshot and create new instance
            await FileSynchronizer.deleteSnapshot(testDir);

            const sync2 = new FileSynchronizer(testDir);
            await sync2.initialize();

            // Assert: New snapshot created, file still tracked
            expect(sync2.getFileHash('file.ts')).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent directory', async () => {
            // Arrange
            const nonExistentDir = path.join(testDir, 'does-not-exist');
            synchronizer = new FileSynchronizer(nonExistentDir);

            // Act & Assert: Should throw or create empty snapshot
            try {
                await synchronizer.initialize();
                // If it doesn't throw, check that it created an empty snapshot
                const changes = await synchronizer.checkForChanges();
                expect(changes.added).toEqual([]);
                expect(changes.removed).toEqual([]);
                expect(changes.modified).toEqual([]);
            } catch (error) {
                // Expected behavior: throw error for non-existent directory
                expect(error).toBeDefined();
            }
        });

        it('should handle permission errors gracefully', async () => {
            // Note: This test may be skipped on systems where permission manipulation is not supported
            if (process.platform === 'win32') {
                // Skip on Windows as permission handling is different
                return;
            }

            // Arrange: Create file and make it unreadable
            const restrictedFile = path.join(testDir, 'restricted.ts');
            await fs.writeFile(restrictedFile, 'content');
            await fs.chmod(restrictedFile, 0o000); // No permissions

            synchronizer = new FileSynchronizer(testDir);

            try {
                // Act: Should handle gracefully without throwing
                await synchronizer.initialize();

                // File should not be tracked due to permission error
                expect(synchronizer.getFileHash('restricted.ts')).toBeUndefined();
            } finally {
                // Cleanup: Restore permissions for cleanup
                await fs.chmod(restrictedFile, 0o644);
            }
        });
    });

    describe('Performance', () => {
        it('should handle large number of files efficiently', async () => {
            // Arrange: Create many files
            const fileCount = 100;
            for (let i = 0; i < fileCount; i++) {
                await fs.writeFile(path.join(testDir, `file${i}.ts`), `const x${i} = ${i};`);
            }

            synchronizer = new FileSynchronizer(testDir);

            // Act
            const startTime = Date.now();
            await synchronizer.initialize();
            const initDuration = Date.now() - startTime;

            // Assert: Should complete in reasonable time (< 5 seconds for 100 files)
            expect(initDuration).toBeLessThan(5000);

            // Verify all files tracked
            for (let i = 0; i < fileCount; i++) {
                expect(synchronizer.getFileHash(`file${i}.ts`)).toBeDefined();
            }
        });

        it('should detect changes efficiently with many files', async () => {
            // Arrange: Create baseline with many files
            for (let i = 0; i < 50; i++) {
                await fs.writeFile(path.join(testDir, `file${i}.ts`), `const x = ${i};`);
            }

            synchronizer = new FileSynchronizer(testDir);
            await synchronizer.initialize();
            await synchronizer.checkForChanges();

            // Act: Modify a few files
            await fs.writeFile(path.join(testDir, 'file10.ts'), 'modified');
            await fs.writeFile(path.join(testDir, 'file20.ts'), 'modified');
            await fs.writeFile(path.join(testDir, 'new.ts'), 'new file');

            const startTime = Date.now();
            const changes = await synchronizer.checkForChanges();
            const checkDuration = Date.now() - startTime;

            // Assert: Should complete quickly (< 2 seconds)
            expect(checkDuration).toBeLessThan(2000);
            expect(changes.modified).toHaveLength(2);
            expect(changes.added).toHaveLength(1);
        });
    });
});
