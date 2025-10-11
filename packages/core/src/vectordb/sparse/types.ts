/**
 * Sparse vector representation
 * Used for BM25 and other sparse encoding methods
 */
export interface SparseVector {
    /**
     * Indices of non-zero elements
     * Each index maps to a position in the vocabulary
     */
    indices: number[];

    /**
     * Values corresponding to the indices
     * Typically BM25 scores or TF-IDF weights
     */
    values: number[];
}

/**
 * Configuration for sparse vector generation
 */
export interface SparseVectorConfig {
    /**
     * Minimum score threshold for including a term
     * Terms with scores below this will be filtered out
     * @default 0
     */
    minScore?: number;

    /**
     * Maximum number of terms to include in sparse vector
     * @default undefined (no limit)
     */
    maxTerms?: number;

    /**
     * Whether to normalize vector values
     * @default false
     */
    normalize?: boolean;
}
