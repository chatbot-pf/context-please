# Context Please MCP Evaluation

This directory contains the evaluation framework and experimental results for comparing the efficiency of code retrieval using Context Please MCP versus traditional grep-only approaches.

## Overview

We conducted a controlled experiment to measure the impact of adding Context Please MCP tool to a baseline coding agent. The evaluation demonstrates significant improvements in token efficiency while maintaining comparable retrieval quality.

## Experimental Design

We designed a controlled experiment comparing two coding agents performing identical retrieval tasks. The baseline agent uses simple tools including read, grep, and edit functions. The enhanced agent adds Context Please MCP tool to this same foundation. Both agents work on the same dataset using the same model to ensure fair comparison. We use [LangGraph MCP and ReAct framework](https://langchain-ai.github.io/langgraph/agents/mcp/#use-mcp-tools) to implement it.

We selected 30 instances from Princeton NLP's [SWE-bench_Verified](https://openai.com/index/introducing-swe-bench-verified/) dataset, filtering for 15-60 minute difficulty problems with exactly 2 file modifications. This subset represents typical coding tasks and enables quick validation. The dataset generation is implemented in [`generate_subset_json.py`](./generate_subset_json.py).

We chose [GPT-5-nano](https://platform.openai.com/docs/models/gpt-5-nano) as the default model for cost-effective considerations.

We ran each method 3 times independently, giving us 6 total runs for statistical reliability. We measured token usage, tool calls, retrieval precision, recall, and F1-score across all runs. The main entry point for running evaluations is [`run_evaluation.py`](./run_evaluation.py).

## Key Results

### Performance Summary

| Metric | Baseline (Grep Only) | With Context Please MCP | Improvement |
|--------|---------------------|--------------------------|-------------|
| **Average F1-Score** | 0.40 | 0.40 | Comparable |
| **Average Token Usage** | 73,373 | 44,449 | **-39.4%** |
| **Average Tool Calls** | 8.3 | 5.3 | **-36.3%** |

### Key Findings

**Dramatic Efficiency Gains**:

With Context Please MCP, we achieved:
- **39.4% reduction** in token consumption (28,924 tokens saved per instance)
- **36.3% reduction** in tool calls (3.0 fewer calls per instance)


## Conclusion

The results demonstrate that Context Please MCP provides:

### Immediate Benefits
- **Cost Efficiency**: ~40% reduction in token usage directly reduces operational costs
- **Speed Improvement**: Fewer tool calls and tokens mean faster code localization and task completion
- **Better Quality**: This also means that, under the constraint of limited token context length, using Context Please yields better retrieval and answer results.

### Strategic Advantages
- **Better Resource Utilization**: Under fixed token budgets, Context Please MCP enables handling more tasks
- **Wider Usage Scenarios**: Lower per-task costs enable broader usage scenarios
- **Improved User Experience**: Faster responses with maintained accuracy


## Running the Evaluation

### Prerequisites: Local Vector Database Setup

**Option A: Using Docker Compose (Recommended for local testing)**

We provide Docker Compose configurations based on official installations:
- **Milvus**: Based on [official Milvus standalone setup](https://milvus.io/docs/install_standalone-docker-compose.md)
- **Qdrant**: Latest official Qdrant image

Start the vector databases:

```bash
cd evaluation

# Option 1: Run both Milvus and Qdrant together (recommended for comparison)
docker-compose up -d

# Option 2: Run only Milvus (official configuration)
docker-compose -f docker-compose.milvus.yml up -d

# Option 3: Run only Qdrant
docker-compose -f docker-compose.qdrant-only.yml up -d
```

**Connection details:**
- **Milvus**: `localhost:19530` (gRPC), Web UI: `http://localhost:9091`, MinIO Console: `http://localhost:9001`
- **Qdrant**: `http://localhost:6333` (REST), `localhost:6334` (gRPC)

**Managing Docker services:**
```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f milvus    # Milvus logs
docker-compose logs -f qdrant    # Qdrant logs
docker-compose logs -f etcd      # etcd logs (Milvus dependency)
docker-compose logs -f minio     # MinIO logs (Milvus storage)

# Stop services
docker-compose down

# Stop and remove all data (clean slate)
docker-compose down -v
```

**Health checks:**
```bash
# Check Milvus health
curl http://localhost:9091/healthz

# Check Qdrant health
curl http://localhost:6333/health
```

**Option B: Using Cloud Services**
- **Milvus**: Use [Zilliz Cloud](https://cloud.zilliz.com/) (free tier available)
- **Qdrant**: Use [Qdrant Cloud](https://cloud.qdrant.io/) (free tier available)

### Quick Start with Scripts

We provide convenient bash scripts for easy evaluation:

**Available Scripts:**
- `run_milvus_evaluation.sh` - Run evaluation with Milvus vector database
- `run_qdrant_evaluation.sh` - Run evaluation with Qdrant vector database
- `run_comparison.sh` - Compare Milvus and Qdrant results
- `compare_vector_databases.py` - Python script for detailed comparison analysis
- `analyze_and_plot_mcp_efficiency.py` - Analyze MCP efficiency (grep vs Context Please)

**1. Set environment variables:**
```bash
# Required for all evaluations
export GITHUB_TOKEN=your_github_token

# LLM API keys (set based on your chosen model)
export OPENAI_API_KEY=your_openai_api_key      # For OpenAI models
export GOOGLE_API_KEY=your_google_api_key      # For Google/Gemini models
export ANTHROPIC_API_KEY=your_anthropic_api_key # For Anthropic/Claude models
export MOONSHOT_API_KEY=your_moonshot_api_key  # For Moonshot models
```

**2. Run evaluation with Milvus:**
```bash
cd evaluation
# Optional: customize settings
export MILVUS_ADDRESS=localhost:19530  # default
export MAX_INSTANCES=5  # default
export OUTPUT_DIR=retrieval_results_milvus  # default

./run_milvus_evaluation.sh
```

**3. Run evaluation with Qdrant:**
```bash
# Optional: customize settings
export QDRANT_URL=http://localhost:6333  # default
export MAX_INSTANCES=5  # default
export OUTPUT_DIR=retrieval_results_qdrant  # default

./run_qdrant_evaluation.sh
```

**4. Compare results:**
```bash
./run_comparison.sh
```

### Manual Step-by-Step Instructions

To reproduce these results manually:

1. **Install Dependencies**:

   For python environment, you can use `uv` to install the lockfile dependencies.
   ```bash
   cd evaluation && uv sync
   source .venv/bin/activate
   ```
   For node environment, make sure your `node` version is `Node.js >= 20.0.0 and < 24.0.0`.

   Our evaluation results are tested on `@pleaseai/context-please-mcp@0.1.1`, you can change the Context Please MCP server setting in the `retrieval/custom.py` file to get the latest version or use a development version.
   
2. **Set Environment Variables**:

   **Common Configuration:**
   ```bash
   export OPENAI_API_KEY=your_openai_api_key
   export GITHUB_TOKEN=your_github_token
   ```

   **For Milvus (default):**
   ```bash
   export MILVUS_ADDRESS=your_milvus_address
   # Optional: export MILVUS_TOKEN=your_milvus_token
   ```

   **For Qdrant:**
   ```bash
   export VECTOR_DB_TYPE=qdrant
   export QDRANT_URL=http://localhost:6333  # Or your Qdrant Cloud URL
   # Optional for self-hosted, required for Qdrant Cloud:
   # export QDRANT_API_KEY=your_qdrant_api_key
   ```

   For more configuration details, refer to the Context Please MCP server settings in the `retrieval/custom.py` file.

   The `GITHUB_TOKEN` is required for automatically cloning the repositories, refer to [SWE-bench documentation](https://www.swebench.com/SWE-bench/guides/create_rag_datasets/#example-usage) for more details.

3. **Generate Dataset**:
   ```bash
   python generate_subset_json.py
   ```

4. **Run Baseline Evaluation** (grep only):
   ```bash
   python run_evaluation.py --retrieval_types grep --output_dir retrieval_results_grep
   ```

   **Understanding `--retrieval_types`**:
   - `grep`: Uses only grep-based text search (baseline)
   - `cc`: Uses only Context Please semantic search
   - `cc,grep`: Uses both Context Please AND grep together (enhanced - recommended)

5. **Run Enhanced Evaluation** (Context Please + grep):

   **With Milvus (default):**
   ```bash
   python run_evaluation.py --retrieval_types cc,grep --output_dir retrieval_results_both
   ```

   **With Qdrant:**
   ```bash
   # Make sure VECTOR_DB_TYPE=qdrant is set in your environment
   python run_evaluation.py --retrieval_types cc,grep --output_dir retrieval_results_qdrant
   ```

6. **Analyze Results**:

   **For MCP efficiency analysis (grep vs Context Please):**
   ```bash
   python analyze_and_plot_mcp_efficiency.py
   ```

   **For vector database comparison (Milvus vs Qdrant):**
   ```bash
   python compare_vector_databases.py \
     --milvus_dirs results_milvus \
     --qdrant_dirs results_qdrant \
     --output vector_database_comparison.png
   ```

The evaluation framework is designed to be reproducible and can be easily extended to test additional configurations or datasets. Due to the proprietary nature of LLMs, exact numerical results may vary between runs and cannot be guaranteed to be identical. However, the core conclusions drawn from the analysis remain consistent and robust across different runs.

## Results Visualization

![MCP Efficiency Analysis](../assets/mcp_efficiency_analysis_chart.png)

*The chart above shows the dramatic efficiency improvements achieved by Context Please MCP. The token usage and tool calls are significantly reduced.*

## Vector Database Support

The evaluation framework supports both **Milvus** and **Qdrant** as vector database backends:

### Milvus (Default)
- Battle-tested vector database with extensive production usage
- Supports hybrid search (BM25 + dense vectors)
- Cloud option available via Zilliz Cloud
- Configuration: Set `MILVUS_ADDRESS` and optionally `MILVUS_TOKEN`

### Qdrant
- Modern vector database with efficient performance
- Supports hybrid search with sparse and dense vectors
- Easy local setup via Docker
- Configuration: Set `VECTOR_DB_TYPE=qdrant`, `QDRANT_URL`, and optionally `QDRANT_API_KEY`

### Running Comparisons

You can directly compare performance between Milvus and Qdrant vector databases.

**Important**: Both databases use the same retrieval configuration (`cc,grep`), but with different vector database backends.

**Step 1: Run evaluations with both databases**
```bash
# Test with Milvus backend
export VECTOR_DB_TYPE=milvus
export MILVUS_ADDRESS=localhost:19530
export OPENAI_API_KEY=your_key
export GITHUB_TOKEN=your_token
python run_evaluation.py --retrieval_types cc,grep --output_dir results_milvus

# Test with Qdrant backend (same retrieval types, different database)
export VECTOR_DB_TYPE=qdrant
export QDRANT_URL=http://localhost:6333
export OPENAI_API_KEY=your_key
export GITHUB_TOKEN=your_token
python run_evaluation.py --retrieval_types cc,grep --output_dir results_qdrant
```

**Step 2: Generate comparison analysis**
```bash
python compare_vector_databases.py \
  --milvus_dirs results_milvus \
  --qdrant_dirs results_qdrant \
  --output vector_database_comparison.png
```

The comparison script will:
- Calculate and compare F1-scores, precision, and recall for both databases
- Compare token usage and tool call efficiency
- Generate statistical summaries with mean and standard deviation
- Create visualization charts showing the performance differences

**Note**: This comparison evaluates the vector database backends (Milvus vs Qdrant), not the retrieval methods. Both runs use Context Please MCP with the same configuration.

## Case Study

For detailed analysis of why grep-only approaches have limitations and how semantic search addresses these challenges, please refer to our **[Case Study](./case_study/)** which provides in-depth comparisons and analysis on the this experiment results.