import type { SparseVector, SparseVectorConfig } from './types'

/**
 * Abstract interface for sparse vector generation
 *
 * Sparse vectors are used for:
 * - BM25 keyword-based search
 * - Hybrid search (combining dense + sparse)
 * - Text-based retrieval with term importance
 *
 * Implementations should:
 * 1. Learn vocabulary from a corpus
 * 2. Generate sparse vectors with indices (vocabulary positions) and values (scores)
 * 3. Support both single document and batch processing
 */
export interface SparseVectorGenerator {
  /**
   * Learn vocabulary and statistics from a corpus of documents
   * This should be called during indexing to build IDF statistics
   *
   * @param documents - Array of document texts to learn from
   */
  learn: (documents: string[]) => void

  /**
   * Generate sparse vector for a single text
   *
   * @param text - Input text to vectorize
   * @param config - Optional configuration for vector generation
   * @returns Sparse vector with indices and values
   */
  generate: (text: string, config?: SparseVectorConfig) => SparseVector

  /**
   * Generate sparse vectors for multiple texts (batch operation)
   *
   * @param texts - Array of input texts to vectorize
   * @param config - Optional configuration for vector generation
   * @returns Array of sparse vectors
   */
  generateBatch: (texts: string[], config?: SparseVectorConfig) => SparseVector[]

  /**
   * Get the vocabulary size (number of unique terms)
   * Useful for debugging and understanding the sparse vector space
   */
  getVocabularySize: () => number

  /**
   * Get average document length from the learned corpus
   * Used for BM25 length normalization
   */
  getAverageDocumentLength: () => number

  /**
   * Check if the generator has been trained (learned from corpus)
   */
  isTrained: () => boolean
}
