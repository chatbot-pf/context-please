#!/bin/bash
# Script to run evaluation with Qdrant vector database

set -e  # Exit on error

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Qdrant Evaluation Runner${NC}"
echo -e "${BLUE}============================================${NC}"

# Check required environment variables
# Note: LLM API key depends on the model type being used
# Common ones: OPENAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY
if [ -z "$OPENAI_API_KEY" ] && [ -z "$GOOGLE_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}Warning: No LLM API key detected${NC}"
    echo "Please set one of: OPENAI_API_KEY, GOOGLE_API_KEY, or ANTHROPIC_API_KEY"
    echo "Example: export GOOGLE_API_KEY=your_api_key"
fi

if [ -z "$QDRANT_URL" ]; then
    echo -e "${YELLOW}Warning: QDRANT_URL is not set${NC}"
    echo -e "${YELLOW}Using default: http://localhost:6333${NC}"
    export QDRANT_URL="http://localhost:6333"
fi

if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${YELLOW}Warning: GITHUB_TOKEN is not set${NC}"
    echo -e "${YELLOW}Repository cloning may be rate-limited${NC}"
fi

# Configuration
export VECTOR_DB_TYPE="qdrant"
RETRIEVAL_TYPES="${RETRIEVAL_TYPES:-cc,grep}"
OUTPUT_DIR="${OUTPUT_DIR:-retrieval_results_qdrant}"
MAX_INSTANCES="${MAX_INSTANCES:-5}"

echo -e "\n${GREEN}Configuration:${NC}"
echo "  Vector DB Type: ${VECTOR_DB_TYPE}"
echo "  Qdrant URL: ${QDRANT_URL}"
echo "  Retrieval Types: ${RETRIEVAL_TYPES}"
echo "  Output Directory: ${OUTPUT_DIR}"
echo "  Max Instances: ${MAX_INSTANCES}"
echo "  OpenAI API Key: ${OPENAI_API_KEY:0:10}..."
if [ -n "$QDRANT_API_KEY" ]; then
    echo "  Qdrant API Key: [SET]"
fi
if [ -n "$GITHUB_TOKEN" ]; then
    echo "  GitHub Token: [SET]"
fi

echo -e "\n${BLUE}Step 1: Checking Python environment...${NC}"
if ! command -v python &> /dev/null; then
    echo -e "${RED}Error: python not found${NC}"
    exit 1
fi
python --version

echo -e "\n${BLUE}Step 2: Generating dataset (if needed)...${NC}"
if [ ! -f "swe_verified_15min1h_2files_instances.json" ]; then
    echo "Dataset not found, generating..."
    python generate_subset_json.py
else
    echo "Dataset already exists, skipping generation"
fi

echo -e "\n${BLUE}Step 3: Running evaluation with Qdrant...${NC}"
python run_evaluation.py \
    --retrieval_types ${RETRIEVAL_TYPES} \
    --output_dir ${OUTPUT_DIR} \
    --max_instances ${MAX_INSTANCES}

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Evaluation completed!${NC}"
echo -e "${GREEN}  Results saved to: ${OUTPUT_DIR}${NC}"
echo -e "${GREEN}============================================${NC}"

echo -e "\n${BLUE}Next steps:${NC}"
echo "1. To analyze MCP efficiency (grep vs Context Please):"
echo "   python analyze_and_plot_mcp_efficiency.py"
echo ""
echo "2. To compare with Milvus, run:"
echo "   ./run_milvus_evaluation.sh"
echo "   ./run_comparison.sh"