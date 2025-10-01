#!/usr/bin/env python3
"""
WyngAI CLI - Healthcare Billing/Appeals LLM Training Data Pipeline
Senior ML/Infra tool for building comprehensive, legally sound corpus.
"""

import click
import json
import pandas as pd
import asyncio
from pathlib import Path
from typing import Dict, List, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@click.group()
@click.version_option(version="1.0.0")
def cli():
    """WyngAI CLI - Healthcare Billing/Appeals LLM Training Pipeline"""
    pass

@cli.group()
def registry():
    """Source registry management commands"""
    pass

@registry.command("write-excel")
@click.option("--output", "-o", default="data/registry/wyng_llm_training_sources_expanded.xlsx",
              help="Output Excel file path")
def write_excel_registry(output: str):
    """Generate Excel registry from JSON source definitions"""
    logger.info("🏗️ Building comprehensive source registry...")

    # Import registry builder
    from pipelines.registry_builder import RegistryBuilder

    builder = RegistryBuilder()
    builder.build_registry(output_path=output)

    logger.info(f"✅ Registry written to {output}")

@cli.group()
def discover():
    """Resource discovery commands"""
    pass

@discover.command("states")
@click.option("--update-registry", is_flag=True, help="Update registry with discovered resources")
def discover_states(update_registry: bool):
    """Discover state DOI resources using NAIC/USA.gov"""
    logger.info("🔍 Discovering state DOI resources...")

    from pipelines.state_discovery import StateResourceDiscovery

    discoverer = StateResourceDiscovery()
    asyncio.run(discoverer.discover_all_states(update_registry=update_registry))

    logger.info("✅ State resource discovery completed")

@cli.group()
def fetch():
    """Data fetching commands"""
    pass

@fetch.command("federal")
@click.option("--source", "-s", help="Specific federal source to fetch")
@click.option("--dry-run", is_flag=True, help="Show what would be fetched")
def fetch_federal(source: Optional[str], dry_run: bool):
    """Fetch federal regulatory data (eCFR, Federal Register, etc.)"""
    logger.info("📥 Fetching federal regulatory data...")

    from pipelines.fetch.federal_fetcher import FederalDataFetcher

    fetcher = FederalDataFetcher()
    asyncio.run(fetcher.fetch_all(source_filter=source, dry_run=dry_run))

@fetch.command("states")
@click.option("--state", "-s", help="Specific state to fetch")
@click.option("--dry-run", is_flag=True, help="Show what would be fetched")
def fetch_states(state: Optional[str], dry_run: bool):
    """Fetch state DOI data"""
    logger.info("📥 Fetching state DOI data...")

    from pipelines.fetch.state_fetcher import StateDataFetcher

    fetcher = StateDataFetcher()
    asyncio.run(fetcher.fetch_all(state_filter=state, dry_run=dry_run))

@fetch.command("payers")
@click.option("--payer", "-p", help="Specific payer to fetch")
@click.option("--dry-run", is_flag=True, help="Show what would be fetched")
def fetch_payers(payer: Optional[str], dry_run: bool):
    """Fetch payer medical policy libraries"""
    logger.info("📥 Fetching payer medical policies...")

    from pipelines.fetch.payer_fetcher import PayerDataFetcher

    fetcher = PayerDataFetcher()
    asyncio.run(fetcher.fetch_all(payer_filter=payer, dry_run=dry_run))

@cli.group()
def normalize():
    """Data normalization commands"""
    pass

@normalize.command("all")
@click.option("--source", "-s", help="Specific source to normalize")
def normalize_all(source: Optional[str]):
    """Normalize all fetched data to DOC schema"""
    logger.info("🔄 Normalizing data to DOC schema...")

    from pipelines.normalize.normalizer import DataNormalizer

    normalizer = DataNormalizer()
    asyncio.run(normalizer.normalize_all(source_filter=source))

@cli.group()
def chunk():
    """Data chunking commands"""
    pass

@chunk.command("all")
@click.option("--source", "-s", help="Specific source to chunk")
def chunk_all(source: Optional[str]):
    """Chunk normalized documents for retrieval"""
    logger.info("✂️ Chunking documents for retrieval...")

    from pipelines.chunk.chunker import DocumentChunker

    chunker = DocumentChunker()
    asyncio.run(chunker.chunk_all(source_filter=source))

@cli.group()
def index():
    """RAG index management commands"""
    pass

@index.command("build")
@click.option("--rebuild", is_flag=True, help="Rebuild index from scratch")
def build_index(rebuild: bool):
    """Build hybrid RAG index (BM25 + vector)"""
    logger.info("🔍 Building hybrid RAG index...")

    from rag.index_builder import IndexBuilder

    builder = IndexBuilder()
    asyncio.run(builder.build_index(rebuild=rebuild))

@index.command("serve")
@click.option("--host", default="127.0.0.1", help="Host to bind")
@click.option("--port", default=8000, help="Port to bind")
def serve_rag(host: str, port: int):
    """Serve RAG API with /ask endpoint"""
    logger.info(f"🚀 Starting RAG service on {host}:{port}")

    import uvicorn
    uvicorn.run("rag.service:app", host=host, port=port, reload=True)

@cli.group()
def train():
    """Training data generation commands"""
    pass

@train.command("export")
@click.option("--format", "-f", type=click.Choice(["jsonl", "parquet"]), default="jsonl")
@click.option("--output-dir", "-o", default="train/")
def export_training_data(format: str, output_dir: str):
    """Export training data (SFT pairs, classification)"""
    logger.info("📚 Exporting training data...")

    from train.exporter import TrainingDataExporter

    exporter = TrainingDataExporter()
    asyncio.run(exporter.export_all(format=format, output_dir=output_dir))

@cli.group()
def reddit():
    """Reddit discovery commands"""
    pass

@reddit.command("discover")
@click.option("--oauth-token", envvar="REDDIT_OAUTH", required=True, help="Reddit OAuth token")
@click.option("--terms-ok", envvar="TERMS_OK", is_flag=True, required=True, help="Confirm Reddit ToS compliance")
def discover_reddit(oauth_token: str, terms_ok: bool):
    """Discover consumer question patterns from Reddit (compliant)"""
    if not terms_ok:
        click.echo("❌ Must confirm Reddit ToS compliance with --terms-ok flag")
        return

    logger.info("🔍 Discovering Reddit consumer question patterns...")

    from analytics.reddit_discovery import RedditDiscovery

    discoverer = RedditDiscovery(oauth_token=oauth_token)
    asyncio.run(discoverer.discover_patterns())

@cli.group()
def eval():
    """Evaluation commands"""
    pass

@eval.command("run")
@click.option("--test-set", "-t", help="Test set to evaluate against")
def run_evaluation(test_set: Optional[str]):
    """Run RAG evaluation suite"""
    logger.info("📊 Running RAG evaluation...")

    from tests.evaluator import RAGEvaluator

    evaluator = RAGEvaluator()
    asyncio.run(evaluator.run_evaluation(test_set=test_set))

@cli.command("status")
def status():
    """Show pipeline status and data inventory"""
    logger.info("📊 WyngAI Pipeline Status")

    from pipelines.status import PipelineStatus

    status_checker = PipelineStatus()
    status_checker.show_status()

if __name__ == "__main__":
    cli()