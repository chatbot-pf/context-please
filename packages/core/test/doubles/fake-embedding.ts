import * as crypto from 'crypto';
import { Embedding, EmbeddingVector } from '../../src/embedding/base-embedding';

/**
 * Fake embedding provider for integration testing.
 *
 * Features:
 * - Deterministic embeddings based on text hash
 * - No external API calls (fast, cost-free)
 * - Configurable dimension
 * - Call tracking for behavior verification
 * - Consistent vectors for same input text
 */
export class FakeEmbedding extends Embedding {
    protected maxTokens = 8192; // Match OpenAI default
    private dimension: number;
    private embeddingCache = new Map<string, number[]>();
    private callCount = 0;
    private embeddedTexts: string[] = [];
    private shouldFail = false;

    constructor(dimension = 128) {
        super();
        this.dimension = dimension;
    }

    async detectDimension(testText?: string): Promise<number> {
        return this.dimension;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        this.throwIfFailureInjected();
        this.callCount++;

        const processedText = this.preprocessText(text);
        this.embeddedTexts.push(processedText);

        // Check cache first
        if (this.embeddingCache.has(processedText)) {
            return {
                vector: this.embeddingCache.get(processedText)!,
                dimension: this.dimension,
            };
        }

        // Generate deterministic vector from text hash
        const vector = this.generateDeterministicVector(processedText);
        this.embeddingCache.set(processedText, vector);

        return {
            vector,
            dimension: this.dimension,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        this.throwIfFailureInjected();
        this.callCount++;

        const processedTexts = this.preprocessTexts(texts);
        this.embeddedTexts.push(...processedTexts);

        return Promise.all(
            processedTexts.map(async text => {
                // Check cache first
                if (this.embeddingCache.has(text)) {
                    return {
                        vector: this.embeddingCache.get(text)!,
                        dimension: this.dimension,
                    };
                }

                // Generate deterministic vector
                const vector = this.generateDeterministicVector(text);
                this.embeddingCache.set(text, vector);

                return {
                    vector,
                    dimension: this.dimension,
                };
            })
        );
    }

    getDimension(): number {
        return this.dimension;
    }

    getProvider(): string {
        return 'FakeEmbedding';
    }

    // ============================================
    // Test Helper Methods (not part of interface)
    // ============================================

    /**
     * Get the number of times embed/embedBatch was called
     */
    getCallCount(): number {
        return this.callCount;
    }

    /**
     * Get all texts that have been embedded (in order)
     */
    getEmbeddedTexts(): string[] {
        return [...this.embeddedTexts];
    }

    /**
     * Set a fixed embedding for a specific text (for controlled testing)
     */
    setFixedEmbedding(text: string, vector: number[]): void {
        if (vector.length !== this.dimension) {
            throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
        }
        this.embeddingCache.set(text, vector);
    }

    /**
     * Inject a failure for the next operation (for error testing)
     */
    injectFailure(): void {
        this.shouldFail = true;
    }

    /**
     * Reset all state (for test cleanup)
     */
    reset(): void {
        this.embeddingCache.clear();
        this.callCount = 0;
        this.embeddedTexts = [];
        this.shouldFail = false;
    }

    // ============================================
    // Private Helper Methods
    // ============================================

    /**
     * Generate a deterministic vector from text using SHA-256 hash
     */
    private generateDeterministicVector(text: string): number[] {
        // Create SHA-256 hash of text
        const hash = crypto.createHash('sha256').update(text).digest();

        // Generate vector values from hash bytes
        const vector: number[] = [];
        let hashIndex = 0;

        for (let i = 0; i < this.dimension; i++) {
            // Use 4 bytes for each float to get better distribution
            const byte1 = hash[hashIndex % hash.length];
            const byte2 = hash[(hashIndex + 1) % hash.length];
            const byte3 = hash[(hashIndex + 2) % hash.length];
            const byte4 = hash[(hashIndex + 3) % hash.length];

            // Combine bytes into a value between -1 and 1
            const intValue = (byte1 << 24) | (byte2 << 16) | (byte3 << 8) | byte4;
            const normalizedValue = (intValue / 0xffffffff) * 2 - 1;

            vector.push(normalizedValue);
            hashIndex += 4;
        }

        // Normalize to unit length (like real embeddings)
        return this.normalizeVector(vector);
    }

    /**
     * Normalize vector to unit length
     */
    private normalizeVector(vector: number[]): number[] {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

        if (norm === 0) {
            // Return zero vector if input is zero
            return new Array(this.dimension).fill(0);
        }

        return vector.map(val => val / norm);
    }

    private throwIfFailureInjected(): void {
        if (this.shouldFail) {
            this.shouldFail = false;
            throw new Error('Embedding generation failed (injected error for testing)');
        }
    }
}
