import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { TestContextBuilder } from '../doubles/test-context-builder';
import { FakeVectorDatabase } from '../doubles/fake-vector-database';
import { FakeEmbedding } from '../doubles/fake-embedding';
import { Context } from '../../src/context';

describe('Search Workflow Integration', () => {
    let context: Context;
    let fakeDb: FakeVectorDatabase;
    let fakeEmbedding: FakeEmbedding;
    let fixturesPath: string;

    beforeEach(async () => {
        // Create test doubles
        fakeDb = new FakeVectorDatabase({ address: 'test' });
        fakeEmbedding = new FakeEmbedding(128);

        // Create context with test doubles
        context = new TestContextBuilder()
            .withEmbedding(fakeEmbedding)
            .withVectorDatabase(fakeDb)
            .build();

        // Path to test fixtures
        fixturesPath = path.join(__dirname, '../fixtures/sample-codebase');

        // Index the codebase for search tests
        await context.indexCodebase(fixturesPath);
    });

    afterEach(() => {
        // Clean up test doubles
        fakeDb.reset();
        fakeEmbedding.reset();
    });

    describe('Basic Search', () => {
        it('should return search results for indexed codebase', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'user service',
                5
            );

            // Assert
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });

        it('should return results with correct structure', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'authentication',
                5
            );

            // Assert
            expect(results.length).toBeGreaterThan(0);

            const firstResult = results[0];
            expect(firstResult).toHaveProperty('content');
            expect(firstResult).toHaveProperty('relativePath');
            expect(firstResult).toHaveProperty('startLine');
            expect(firstResult).toHaveProperty('endLine');
            expect(firstResult).toHaveProperty('language');
            expect(firstResult).toHaveProperty('score');

            // Verify types
            expect(typeof firstResult.content).toBe('string');
            expect(typeof firstResult.relativePath).toBe('string');
            expect(typeof firstResult.startLine).toBe('number');
            expect(typeof firstResult.endLine).toBe('number');
            expect(typeof firstResult.language).toBe('string');
            expect(typeof firstResult.score).toBe('number');
        });

        it('should return results sorted by relevance score (descending)', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'function',
                10
            );

            // Assert
            expect(results.length).toBeGreaterThan(1);

            // Verify scores are in descending order
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });

        it('should respect the topK limit parameter', async () => {
            // Act
            const resultsLimit3 = await context.semanticSearch(
                fixturesPath,
                'function',
                3
            );

            const resultsLimit10 = await context.semanticSearch(
                fixturesPath,
                'function',
                10
            );

            // Assert
            expect(resultsLimit3.length).toBeLessThanOrEqual(3);
            expect(resultsLimit10.length).toBeLessThanOrEqual(10);
        });

        it('should handle searches with no results gracefully', async () => {
            // Act: Search for something very unlikely to match
            const results = await context.semanticSearch(
                fixturesPath,
                'xyzabc123nonexistentterm999',
                5,
                0.9 // High threshold
            );

            // Assert: Should return empty array, not throw
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('Search Quality', () => {
        it('should find relevant TypeScript code when searching for "user service"', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'user service',
                5
            );

            // Assert
            expect(results.length).toBeGreaterThan(0);

            // At least one result should be from user-service.ts
            const hasUserServiceResult = results.some(r =>
                r.relativePath.includes('user-service.ts')
            );
            expect(hasUserServiceResult).toBe(true);
        });

        it('should find relevant Python code when searching for "authentication"', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'authentication password hash',
                5
            );

            // Assert
            expect(results.length).toBeGreaterThan(0);

            // At least one result should be from auth.py
            const hasAuthResult = results.some(r =>
                r.relativePath.includes('auth.py')
            );
            expect(hasAuthResult).toBe(true);
        });
    });

    describe('Search with Threshold', () => {
        it('should filter results by similarity threshold', async () => {
            // Act
            const resultsLowThreshold = await context.semanticSearch(
                fixturesPath,
                'function',
                10,
                0.1 // Low threshold
            );

            const resultsHighThreshold = await context.semanticSearch(
                fixturesPath,
                'function',
                10,
                0.8 // High threshold
            );

            // Assert
            expect(resultsHighThreshold.length).toBeLessThanOrEqual(resultsLowThreshold.length);

            // Verify all results meet the threshold
            for (const result of resultsHighThreshold) {
                expect(result.score).toBeGreaterThanOrEqual(0.8);
            }
        });

        it('should return empty results when threshold is too high', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'some query',
                10,
                0.99 // Very high threshold
            );

            // Assert: Likely no results match such a high threshold
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should throw error when searching non-indexed codebase', async () => {
            // Arrange
            const nonIndexedPath = '/path/to/non/indexed/codebase';

            // Act & Assert
            await expect(
                context.semanticSearch(nonIndexedPath, 'query', 5)
            ).rejects.toThrow();
        });

        it('should handle empty query string', async () => {
            // Act & Assert
            const results = await context.semanticSearch(
                fixturesPath,
                '',
                5
            );

            // Should not throw, but may return empty or all results
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle embedding provider failure during search', async () => {
            // Arrange: Inject failure into embedding provider
            fakeEmbedding.injectFailure();

            // Act & Assert
            await expect(
                context.semanticSearch(fixturesPath, 'query', 5)
            ).rejects.toThrow();
        });

        it('should handle vector database failure during search', async () => {
            // Arrange: Inject failure into vector database
            fakeDb.injectFailure();

            // Act & Assert
            await expect(
                context.semanticSearch(fixturesPath, 'query', 5)
            ).rejects.toThrow();
        });
    });

    describe('Multiple Searches', () => {
        it('should handle multiple consecutive searches', async () => {
            // Act
            const results1 = await context.semanticSearch(fixturesPath, 'user', 5);
            const results2 = await context.semanticSearch(fixturesPath, 'authentication', 5);
            const results3 = await context.semanticSearch(fixturesPath, 'utility', 5);

            // Assert
            expect(results1.length).toBeGreaterThan(0);
            expect(results2.length).toBeGreaterThan(0);
            expect(results3.length).toBeGreaterThan(0);

            // Verify results are different
            expect(results1[0].content).not.toBe(results2[0].content);
        });

        it('should return consistent results for same query', async () => {
            // Act
            const results1 = await context.semanticSearch(fixturesPath, 'user service', 5);
            const results2 = await context.semanticSearch(fixturesPath, 'user service', 5);

            // Assert: Results should be identical
            expect(results1.length).toBe(results2.length);

            for (let i = 0; i < results1.length; i++) {
                expect(results1[i].relativePath).toBe(results2[i].relativePath);
                expect(results1[i].startLine).toBe(results2[i].startLine);
                expect(results1[i].score).toBe(results2[i].score);
            }
        });
    });

    describe('Result Content', () => {
        it('should include actual code content in results', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'create user',
                5
            );

            // Assert
            expect(results.length).toBeGreaterThan(0);

            const firstResult = results[0];
            expect(firstResult.content.length).toBeGreaterThan(0);

            // Content should contain actual code (not just metadata)
            expect(firstResult.content.trim()).not.toBe('');
        });

        it('should set correct language based on file extension', async () => {
            // Act
            const results = await context.semanticSearch(
                fixturesPath,
                'function',
                10
            );

            // Assert
            expect(results.length).toBeGreaterThan(0);

            // Find results from different languages
            const tsResult = results.find(r => r.relativePath.endsWith('.ts'));
            const pyResult = results.find(r => r.relativePath.endsWith('.py'));

            if (tsResult) {
                expect(tsResult.language.toLowerCase()).toBe('typescript');
            }

            if (pyResult) {
                expect(pyResult.language.toLowerCase()).toBe('python');
            }
        });
    });

    describe('Search Performance', () => {
        it('should complete search in reasonable time', async () => {
            // Act
            const startTime = Date.now();
            await context.semanticSearch(fixturesPath, 'test query', 5);
            const duration = Date.now() - startTime;

            // Assert: Should complete quickly with fake implementations
            expect(duration).toBeLessThan(1000); // Less than 1 second
        });
    });
});
