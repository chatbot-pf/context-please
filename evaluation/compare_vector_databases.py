#!/usr/bin/env python3
"""
Compare Milvus and Qdrant vector database performance.
This script analyzes retrieval results from both databases and generates comparison charts.
"""

import json
import os
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd
from typing import Dict, List, Tuple
from pathlib import Path


def normalize_file_path(file_path: str) -> str:
    """Normalize file paths."""
    if file_path.startswith("/"):
        file_path = file_path[1:]
    return file_path


def calculate_metrics(hits: List[str], oracles: List[str]) -> Dict[str, float]:
    """Calculate precision, recall, and F1-score."""
    if not hits and not oracles:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    # Normalize file paths
    hits_set = set(normalize_file_path(f) for f in hits)
    oracles_set = set(normalize_file_path(f) for f in oracles)

    # Calculate intersection
    intersection = hits_set.intersection(oracles_set)

    # Calculate metrics
    precision = len(intersection) / len(hits_set) if hits_set else 0.0
    recall = len(intersection) / len(oracles_set) if oracles_set else 0.0
    f1 = (
        2 * (precision * recall) / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "num_hits": len(hits_set),
        "num_oracles": len(oracles_set),
        "num_correct": len(intersection),
    }


def load_database_results(result_dirs: List[str], db_name: str) -> Dict:
    """Load and aggregate results from a vector database."""

    all_f1_scores = []
    all_precision = []
    all_recall = []
    all_token_usage = []
    all_tool_calls = []
    successful_instances = set()

    print(f"\nLoading {db_name} results from {len(result_dirs)} run(s)...")

    for run_idx, run_dir in enumerate(result_dirs):
        print(f"  Processing run {run_idx + 1}: {run_dir}")

        if not os.path.exists(run_dir):
            print(f"    Warning: Directory {run_dir} does not exist")
            continue

        run_success_count = 0

        for item in os.listdir(run_dir):
            instance_dir = os.path.join(run_dir, item)
            result_file = os.path.join(instance_dir, "result.json")

            if os.path.isdir(instance_dir) and os.path.exists(result_file):
                try:
                    with open(result_file, "r") as f:
                        data = json.load(f)

                    # Calculate metrics
                    hits = data.get("hits", [])
                    oracles = data.get("oracles", [])
                    metrics = calculate_metrics(hits, oracles)

                    # Extract usage metrics
                    tokens = data.get("token_usage", {}).get("total_tokens", 0)
                    tools = data.get("tool_stats", {}).get("total_tool_calls", 0)

                    # Store data
                    all_f1_scores.append(metrics["f1"])
                    all_precision.append(metrics["precision"])
                    all_recall.append(metrics["recall"])
                    all_token_usage.append(tokens)
                    all_tool_calls.append(tools)

                    successful_instances.add(item)
                    run_success_count += 1

                except Exception as e:
                    print(f"    Error processing {result_file}: {e}")

        print(f"    Successfully processed {run_success_count} instances")

    print(f"  Total unique instances: {len(successful_instances)}")
    print(f"  Total samples: {len(all_f1_scores)}")

    return {
        "f1_scores": all_f1_scores,
        "precision": all_precision,
        "recall": all_recall,
        "token_usage": all_token_usage,
        "tool_calls": all_tool_calls,
        "num_instances": len(successful_instances),
        "num_samples": len(all_f1_scores),
    }


def print_statistics(db_name: str, results: Dict):
    """Print statistical summary for a database."""
    print(f"\n{'=' * 60}")
    print(f"{db_name} Statistics")
    print(f"{'=' * 60}")
    print(f"Instances: {results['num_instances']}")
    print(f"Total samples: {results['num_samples']}")
    print(f"\nRetrieval Quality:")
    print(f"  Average F1-Score:  {np.mean(results['f1_scores']):.3f} ± {np.std(results['f1_scores']):.3f}")
    print(f"  Average Precision: {np.mean(results['precision']):.3f} ± {np.std(results['precision']):.3f}")
    print(f"  Average Recall:    {np.mean(results['recall']):.3f} ± {np.std(results['recall']):.3f}")
    print(f"\nResource Usage:")
    print(f"  Average Tokens:     {np.mean(results['token_usage']):.0f} ± {np.std(results['token_usage']):.0f}")
    print(f"  Average Tool Calls: {np.mean(results['tool_calls']):.1f} ± {np.std(results['tool_calls']):.1f}")


def compare_databases(milvus_results: Dict, qdrant_results: Dict):
    """Compare two databases and print comparison."""
    print(f"\n{'=' * 60}")
    print("Database Comparison")
    print(f"{'=' * 60}")

    # F1 Score comparison
    milvus_f1 = np.mean(milvus_results['f1_scores'])
    qdrant_f1 = np.mean(qdrant_results['f1_scores'])
    f1_diff = ((qdrant_f1 - milvus_f1) / milvus_f1 * 100) if milvus_f1 > 0 else 0
    print(f"\nF1-Score:")
    print(f"  Milvus:  {milvus_f1:.3f}")
    print(f"  Qdrant:  {qdrant_f1:.3f}")
    print(f"  Difference: {f1_diff:+.1f}%")

    # Token usage comparison
    milvus_tokens = np.mean(milvus_results['token_usage'])
    qdrant_tokens = np.mean(qdrant_results['token_usage'])
    token_diff = ((qdrant_tokens - milvus_tokens) / milvus_tokens * 100) if milvus_tokens > 0 else 0
    print(f"\nToken Usage:")
    print(f"  Milvus:  {milvus_tokens:.0f}")
    print(f"  Qdrant:  {qdrant_tokens:.0f}")
    print(f"  Difference: {token_diff:+.1f}%")

    # Tool calls comparison
    milvus_tools = np.mean(milvus_results['tool_calls'])
    qdrant_tools = np.mean(qdrant_results['tool_calls'])
    tools_diff = ((qdrant_tools - milvus_tools) / milvus_tools * 100) if milvus_tools > 0 else 0
    print(f"\nTool Calls:")
    print(f"  Milvus:  {milvus_tools:.1f}")
    print(f"  Qdrant:  {qdrant_tools:.1f}")
    print(f"  Difference: {tools_diff:+.1f}%")


def create_comparison_chart(milvus_results: Dict, qdrant_results: Dict, output_path: str):
    """Create a comparison chart between Milvus and Qdrant."""

    # Prepare data for plotting
    data = []

    # Add Milvus data
    for i, (f1, tokens, tools) in enumerate(zip(
        milvus_results['f1_scores'],
        milvus_results['token_usage'],
        milvus_results['tool_calls']
    )):
        data.append({
            'Database': 'Milvus',
            'F1-Score': f1,
            'Token Usage': tokens,
            'Tool Calls': tools,
            'Sample': i
        })

    # Add Qdrant data
    for i, (f1, tokens, tools) in enumerate(zip(
        qdrant_results['f1_scores'],
        qdrant_results['token_usage'],
        qdrant_results['tool_calls']
    )):
        data.append({
            'Database': 'Qdrant',
            'F1-Score': f1,
            'Token Usage': tokens,
            'Tool Calls': tools,
            'Sample': i
        })

    df = pd.DataFrame(data)

    # Set style
    sns.set_style("whitegrid")
    sns.set_palette("husl")

    # Create figure with subplots
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    fig.suptitle('Milvus vs Qdrant Vector Database Comparison', fontsize=16, fontweight='bold')

    # Plot 1: F1-Score comparison
    sns.boxplot(data=df, x='Database', y='F1-Score', ax=axes[0])
    axes[0].set_title('Retrieval Quality (F1-Score)', fontsize=12, fontweight='bold')
    axes[0].set_ylabel('F1-Score', fontsize=11)
    axes[0].set_xlabel('')

    # Add mean values as text
    milvus_mean_f1 = df[df['Database'] == 'Milvus']['F1-Score'].mean()
    qdrant_mean_f1 = df[df['Database'] == 'Qdrant']['F1-Score'].mean()
    axes[0].text(0, milvus_mean_f1, f'{milvus_mean_f1:.3f}', ha='center', va='bottom', fontweight='bold')
    axes[0].text(1, qdrant_mean_f1, f'{qdrant_mean_f1:.3f}', ha='center', va='bottom', fontweight='bold')

    # Plot 2: Token Usage comparison
    sns.boxplot(data=df, x='Database', y='Token Usage', ax=axes[1])
    axes[1].set_title('Resource Efficiency (Token Usage)', fontsize=12, fontweight='bold')
    axes[1].set_ylabel('Total Tokens', fontsize=11)
    axes[1].set_xlabel('')

    # Add mean values as text
    milvus_mean_tokens = df[df['Database'] == 'Milvus']['Token Usage'].mean()
    qdrant_mean_tokens = df[df['Database'] == 'Qdrant']['Token Usage'].mean()
    axes[1].text(0, milvus_mean_tokens, f'{milvus_mean_tokens:.0f}', ha='center', va='bottom', fontweight='bold')
    axes[1].text(1, qdrant_mean_tokens, f'{qdrant_mean_tokens:.0f}', ha='center', va='bottom', fontweight='bold')

    # Plot 3: Tool Calls comparison
    sns.boxplot(data=df, x='Database', y='Tool Calls', ax=axes[2])
    axes[2].set_title('Efficiency (Tool Calls)', fontsize=12, fontweight='bold')
    axes[2].set_ylabel('Number of Tool Calls', fontsize=11)
    axes[2].set_xlabel('')

    # Add mean values as text
    milvus_mean_tools = df[df['Database'] == 'Milvus']['Tool Calls'].mean()
    qdrant_mean_tools = df[df['Database'] == 'Qdrant']['Tool Calls'].mean()
    axes[2].text(0, milvus_mean_tools, f'{milvus_mean_tools:.1f}', ha='center', va='bottom', fontweight='bold')
    axes[2].text(1, qdrant_mean_tools, f'{qdrant_mean_tools:.1f}', ha='center', va='bottom', fontweight='bold')

    plt.tight_layout()

    # Save figure
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"\n✅ Comparison chart saved to: {output_path}")

    # Also save as PDF
    pdf_path = output_path.replace('.png', '.pdf')
    plt.savefig(pdf_path, bbox_inches='tight')
    print(f"✅ PDF version saved to: {pdf_path}")

    plt.close()


def main():
    """Main function to run the comparison."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Compare Milvus and Qdrant vector database performance"
    )
    parser.add_argument(
        "--milvus_dirs",
        nargs="+",
        required=True,
        help="Directories containing Milvus results (can specify multiple runs)",
    )
    parser.add_argument(
        "--qdrant_dirs",
        nargs="+",
        required=True,
        help="Directories containing Qdrant results (can specify multiple runs)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="vector_database_comparison.png",
        help="Output file for comparison chart (default: vector_database_comparison.png)",
    )

    args = parser.parse_args()

    # Load results
    milvus_results = load_database_results(args.milvus_dirs, "Milvus")
    qdrant_results = load_database_results(args.qdrant_dirs, "Qdrant")

    # Check if we have data
    if milvus_results['num_samples'] == 0:
        print("❌ Error: No Milvus results found")
        return

    if qdrant_results['num_samples'] == 0:
        print("❌ Error: No Qdrant results found")
        return

    # Print statistics
    print_statistics("Milvus", milvus_results)
    print_statistics("Qdrant", qdrant_results)

    # Compare databases
    compare_databases(milvus_results, qdrant_results)

    # Create comparison chart
    create_comparison_chart(milvus_results, qdrant_results, args.output)

    print("\n✅ Database comparison completed successfully!")


if __name__ == "__main__":
    main()
