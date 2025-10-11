import { SparseVectorGenerator } from './sparse-vector-generator';
import { SparseVector, SparseVectorConfig } from './types';

/**
 * Configuration for BM25 algorithm
 */
export interface BM25Config {
    /**
     * Term frequency saturation parameter
     * Controls how quickly term frequency impact saturates
     * @default 1.2
     */
    k1?: number;

    /**
     * Length normalization parameter
     * 0 = no normalization, 1 = full normalization
     * @default 0.75
     */
    b?: number;

    /**
     * Minimum term length to include
     * @default 2
     */
    minTermLength?: number;

    /**
     * Stop words to exclude
     * @default []
     */
    stopWords?: Set<string>;
}

/**
 * Simple BM25 implementation for sparse vector generation
 *
 * BM25 (Best Matching 25) is a probabilistic ranking function
 * used for information retrieval and text search.
 *
 * Formula:
 * score(D,Q) = Σ IDF(qi) × (f(qi,D) × (k1 + 1)) / (f(qi,D) + k1 × (1 - b + b × |D| / avgdl))
 *
 * Where:
 * - D = document
 * - Q = query
 * - qi = query term i
 * - f(qi,D) = term frequency in document
 * - |D| = document length
 * - avgdl = average document length
 * - IDF(qi) = inverse document frequency
 */
export class SimpleBM25 implements SparseVectorGenerator {
    private k1: number;
    private b: number;
    private minTermLength: number;
    private stopWords: Set<string>;

    // Learned from corpus
    private vocabulary: Map<string, number> = new Map();
    private idf: Map<string, number> = new Map();
    private avgDocLength: number = 0;
    private trained: boolean = false;

    constructor(config: BM25Config = {}) {
        this.k1 = config.k1 ?? 1.2;
        this.b = config.b ?? 0.75;
        this.minTermLength = config.minTermLength ?? 2;
        this.stopWords = config.stopWords ?? new Set();
    }

    /**
     * Tokenize text into terms
     * Simple but effective tokenization:
     * 1. Lowercase
     * 2. Remove special characters
     * 3. Split on whitespace
     * 4. Filter by length and stop words
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(term =>
                term.length >= this.minTermLength &&
                !this.stopWords.has(term)
            );
    }

    /**
     * Calculate term frequency for a document
     */
    private calculateTermFrequency(tokens: string[]): Map<string, number> {
        const termFreq = new Map<string, number>();
        tokens.forEach(token => {
            termFreq.set(token, (termFreq.get(token) || 0) + 1);
        });
        return termFreq;
    }

    /**
     * Learn vocabulary and IDF from corpus
     */
    learn(documents: string[]): void {
        if (documents.length === 0) {
            throw new Error('Cannot learn from empty corpus');
        }

        // Reset state
        this.vocabulary.clear();
        this.idf.clear();

        // Tokenize all documents
        const tokenizedDocs = documents.map(doc => this.tokenize(doc));

        // Calculate average document length
        const totalLength = tokenizedDocs.reduce((sum, tokens) => sum + tokens.length, 0);
        this.avgDocLength = totalLength / tokenizedDocs.length;

        // Calculate document frequency for each term
        const docFreq = new Map<string, number>();
        tokenizedDocs.forEach(tokens => {
            const uniqueTerms = new Set(tokens);
            uniqueTerms.forEach(term => {
                docFreq.set(term, (docFreq.get(term) || 0) + 1);
            });
        });

        // Build vocabulary and calculate IDF
        // IDF formula: log((N - df + 0.5) / (df + 0.5))
        const numDocs = documents.length;
        let vocabIndex = 0;

        docFreq.forEach((df, term) => {
            // Add to vocabulary
            this.vocabulary.set(term, vocabIndex++);

            // Calculate IDF
            const idf = Math.log((numDocs - df + 0.5) / (df + 0.5));
            this.idf.set(term, idf);
        });

        this.trained = true;

        console.log(`[SimpleBM25] Learned from ${numDocs} documents`);
        console.log(`[SimpleBM25] Vocabulary size: ${this.vocabulary.size}`);
        console.log(`[SimpleBM25] Average document length: ${this.avgDocLength.toFixed(2)}`);
    }

    /**
     * Generate sparse vector for a single text
     */
    generate(text: string, config?: SparseVectorConfig): SparseVector {
        if (!this.trained) {
            throw new Error('BM25 generator must be trained before generating vectors. Call learn() first.');
        }

        const tokens = this.tokenize(text);
        const termFreq = this.calculateTermFrequency(tokens);
        const docLength = tokens.length;

        const indices: number[] = [];
        const values: number[] = [];

        // Calculate BM25 score for each term
        termFreq.forEach((tf, term) => {
            const vocabIndex = this.vocabulary.get(term);
            const idfScore = this.idf.get(term);

            // Skip terms not in vocabulary (unknown terms)
            if (vocabIndex === undefined || idfScore === undefined) {
                return;
            }

            // BM25 formula
            const normalizedTF =
                (tf * (this.k1 + 1)) /
                (tf + this.k1 * (1 - this.b + (this.b * docLength) / this.avgDocLength));

            const score = idfScore * normalizedTF;

            // Apply minimum score threshold if configured
            if (config?.minScore !== undefined && score < config.minScore) {
                return;
            }

            indices.push(vocabIndex);
            values.push(score);
        });

        // Sort by score descending and apply maxTerms limit
        if (config?.maxTerms !== undefined && indices.length > config.maxTerms) {
            const combined = indices.map((idx, i) => ({ idx, val: values[i] }));
            combined.sort((a, b) => b.val - a.val);
            combined.splice(config.maxTerms);

            indices.length = 0;
            values.length = 0;
            combined.forEach(({ idx, val }) => {
                indices.push(idx);
                values.push(val);
            });
        }

        // Normalize if requested
        if (config?.normalize && values.length > 0) {
            const norm = Math.sqrt(values.reduce((sum, val) => sum + val * val, 0));
            for (let i = 0; i < values.length; i++) {
                values[i] /= norm;
            }
        }

        return { indices, values };
    }

    /**
     * Generate sparse vectors for multiple texts (batch operation)
     */
    generateBatch(texts: string[], config?: SparseVectorConfig): SparseVector[] {
        return texts.map(text => this.generate(text, config));
    }

    /**
     * Get vocabulary size
     */
    getVocabularySize(): number {
        return this.vocabulary.size;
    }

    /**
     * Get average document length
     */
    getAverageDocumentLength(): number {
        return this.avgDocLength;
    }

    /**
     * Check if trained
     */
    isTrained(): boolean {
        return this.trained;
    }

    /**
     * Get the vocabulary (for debugging/inspection)
     */
    getVocabulary(): Map<string, number> {
        return new Map(this.vocabulary);
    }

    /**
     * Get IDF scores (for debugging/inspection)
     */
    getIDFScores(): Map<string, number> {
        return new Map(this.idf);
    }
}
