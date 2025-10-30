#!/bin/bash
# Script to compare Milvus and Qdrant evaluation results

set -e  # Exit on error

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Vector Database Comparison${NC}"
echo -e "${BLUE}============================================${NC}"

# Default directories
MILVUS_DIRS="${MILVUS_DIRS:-retrieval_results_milvus}"
QDRANT_DIRS="${QDRANT_DIRS:-retrieval_results_qdrant}"
OUTPUT_FILE="${OUTPUT_FILE:-vector_database_comparison.png}"

echo -e "\n${GREEN}Configuration:${NC}"
echo "  Milvus Results: ${MILVUS_DIRS}"
echo "  Qdrant Results: ${QDRANT_DIRS}"
echo "  Output File: ${OUTPUT_FILE}"

# Check if result directories exist
if [ ! -d "$MILVUS_DIRS" ]; then
    echo -e "\n${RED}Error: Milvus results directory not found: ${MILVUS_DIRS}${NC}"
    echo "Please run Milvus evaluation first:"
    echo "  ./run_milvus_evaluation.sh"
    exit 1
fi

if [ ! -d "$QDRANT_DIRS" ]; then
    echo -e "\n${RED}Error: Qdrant results directory not found: ${QDRANT_DIRS}${NC}"
    echo "Please run Qdrant evaluation first:"
    echo "  ./run_qdrant_evaluation.sh"
    exit 1
fi

# Check for result.json files
MILVUS_COUNT=$(find "$MILVUS_DIRS" -name "result.json" | wc -l)
QDRANT_COUNT=$(find "$QDRANT_DIRS" -name "result.json" | wc -l)

echo -e "\n${BLUE}Found results:${NC}"
echo "  Milvus instances: ${MILVUS_COUNT}"
echo "  Qdrant instances: ${QDRANT_COUNT}"

if [ "$MILVUS_COUNT" -eq 0 ]; then
    echo -e "${RED}Error: No Milvus results found${NC}"
    exit 1
fi

if [ "$QDRANT_COUNT" -eq 0 ]; then
    echo -e "${RED}Error: No Qdrant results found${NC}"
    exit 1
fi

echo -e "\n${BLUE}Running comparison analysis...${NC}"
python compare_vector_databases.py \
    --milvus_dirs ${MILVUS_DIRS} \
    --qdrant_dirs ${QDRANT_DIRS} \
    --output ${OUTPUT_FILE}

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Comparison completed!${NC}"
echo -e "${GREEN}  Chart saved to: ${OUTPUT_FILE}${NC}"
echo -e "${GREEN}============================================${NC}"

# Show next steps
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. View the comparison chart:"
echo "   open ${OUTPUT_FILE}"
echo ""
echo "2. To run MCP efficiency analysis (grep vs Context Please):"
echo "   python analyze_and_plot_mcp_efficiency.py"