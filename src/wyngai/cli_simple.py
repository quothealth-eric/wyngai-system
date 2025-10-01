"""
Simplified CLI interface for WyngAI.
"""

from pathlib import Path
from typing import Optional
from datetime import date, timedelta
import typer
from rich.console import Console

from .registry import RegistryManager
from .fetch.ecfr import eCFRFetcher
from .fetch.federal_register import FederalRegisterFetcher

app = typer.Typer(help="WyngAI - Healthcare billing and appeals LLM training infrastructure")
console = Console()


@app.command()
def version():
    """Show version information."""
    from . import __version__
    console.print(f"WyngAI version {__version__}")


@app.command("write-excel")
def write_excel(
    output_path: Optional[Path] = typer.Argument(None, help="Output path for Excel file"),
):
    """Write source registry to Excel file."""
    if output_path is None:
        output_path = Path("data/registry/wyng_llm_training_sources.xlsx")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    manager = RegistryManager()
    manager.write_excel(output_path)

    # Also write CSV
    csv_path = output_path.with_suffix('.csv')
    manager.write_csv(csv_path)

    console.print(f"✅ Registry exported to {output_path} and {csv_path}")


@app.command("list-sources")
def list_sources():
    """List all sources in the registry."""
    manager = RegistryManager()

    from rich.table import Table
    table = Table(title="WyngAI Source Registry")
    table.add_column("Category", style="cyan")
    table.add_column("Source", style="green")
    table.add_column("Format", style="yellow")
    table.add_column("License", style="red")

    for source in manager.sources:
        table.add_row(
            source.category,
            source.source,
            source.format,
            source.license_notes
        )

    console.print(table)


@app.command("list-categories")
def list_categories():
    """List all source categories."""
    manager = RegistryManager()
    categories = manager.get_categories()

    console.print("📁 Source Categories:")
    for i, category in enumerate(sorted(categories), 1):
        console.print(f"{i}. {category}")


@app.command("fetch-ecfr")
def fetch_ecfr(
    output_dir: Path = typer.Option(
        Path("warehouse/bronze/ecfr"),
        help="Output directory for fetched data"
    ),
    sections: Optional[str] = typer.Option(
        None,
        help="Comma-separated list of specific sections to fetch"
    )
):
    """Fetch eCFR sections."""
    console.print("🔄 Fetching eCFR sections...")

    fetcher = eCFRFetcher()

    if sections:
        # Fetch specific sections
        section_list = [s.strip() for s in sections.split(',')]
        saved_paths = []

        for section in section_list:
            console.print(f"Fetching section: {section}")
            section_data = fetcher.fetch_section(section)
            if section_data:
                saved_path = fetcher.save_section(section_data, output_dir)
                saved_paths.append(saved_path)
    else:
        # Fetch key healthcare sections
        saved_paths = fetcher.fetch_key_sections(output_dir)

    console.print(f"✅ Fetched {len(saved_paths)} sections to {output_dir}")


@app.command("fetch-fedreg")
def fetch_federal_register(
    output_dir: Path = typer.Option(
        Path("warehouse/bronze/fedreg"),
        help="Output directory for fetched data"
    ),
    since_days: int = typer.Option(
        365,
        help="Fetch documents from this many days ago"
    ),
    fetch_content: bool = typer.Option(
        False,
        help="Fetch full HTML content (slower)"
    )
):
    """Fetch Federal Register documents."""
    console.print("🔄 Fetching Federal Register documents...")

    since_date = date.today() - timedelta(days=since_days)
    console.print(f"Fetching documents since: {since_date}")

    fetcher = FederalRegisterFetcher()
    saved_paths = fetcher.fetch_healthcare_documents(
        output_dir=output_dir,
        since_date=since_date,
        fetch_content=fetch_content
    )

    console.print(f"✅ Fetched {len(saved_paths)} documents to {output_dir}")


@app.command("fetch-all")
def fetch_all():
    """Fetch data from all primary sources."""
    console.print("🔄 Fetching all primary healthcare data sources...")

    # Fetch eCFR
    console.print("\n📋 Fetching eCFR sections...")
    ecfr_fetcher = eCFRFetcher()
    ecfr_paths = ecfr_fetcher.fetch_key_sections(Path("warehouse/bronze/ecfr"))

    # Fetch Federal Register
    console.print("\n📰 Fetching Federal Register documents...")
    since_date = date.today() - timedelta(days=180)  # Last 6 months
    fedreg_fetcher = FederalRegisterFetcher()
    fedreg_paths = fedreg_fetcher.fetch_healthcare_documents(
        output_dir=Path("warehouse/bronze/fedreg"),
        since_date=since_date,
        fetch_content=False  # Skip content for bulk fetch
    )

    total_files = len(ecfr_paths) + len(fedreg_paths)
    console.print(f"\n✅ Completed! Fetched {total_files} total files:")
    console.print(f"  - eCFR sections: {len(ecfr_paths)}")
    console.print(f"  - Federal Register documents: {len(fedreg_paths)}")


@app.command("parse-ecfr")
def parse_ecfr(
    input_dir: Path = typer.Option(
        Path("warehouse/bronze/ecfr"),
        help="Input directory with eCFR JSON files"
    ),
    output_dir: Path = typer.Option(
        Path("warehouse/silver/ecfr"),
        help="Output directory for parsed DOCs"
    )
):
    """Parse eCFR data to normalized DOC format."""
    console.print("🔄 Parsing eCFR data...")

    from .parse.ecfr_parser import eCFRParser
    import json

    parser = eCFRParser()
    docs = parser.parse_directory(input_dir)

    if docs:
        output_dir.mkdir(parents=True, exist_ok=True)

        # Save as JSONL
        output_file = output_dir / "ecfr_docs.jsonl"
        with open(output_file, 'w') as f:
            for doc in docs:
                f.write(json.dumps(doc.model_dump(), default=str) + '\n')

        console.print(f"✅ Parsed {len(docs)} documents to {output_file}")
    else:
        console.print("⚠️  No documents parsed")


@app.command("chunk-docs")
def chunk_documents(
    input_file: Path = typer.Option(
        Path("warehouse/silver/ecfr/ecfr_docs.jsonl"),
        help="Input JSONL file with DOCs"
    ),
    output_dir: Path = typer.Option(
        Path("warehouse/gold/chunks"),
        help="Output directory for chunks"
    )
):
    """Chunk documents into retrieval units."""
    console.print("🔄 Chunking documents...")

    from .chunk.hierarchical import HierarchicalChunker
    from .schemas import DOC
    import json

    if not input_file.exists():
        console.print(f"❌ Input file not found: {input_file}")
        return

    # Load documents
    docs = []
    with open(input_file, 'r') as f:
        for line in f:
            doc_data = json.loads(line)
            docs.append(DOC(**doc_data))

    # Chunk documents
    chunker = HierarchicalChunker()
    chunks = chunker.chunk_documents(docs)

    # Save chunks
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "chunks.jsonl"

    with open(output_file, 'w') as f:
        for chunk in chunks:
            f.write(json.dumps(chunk.model_dump(), default=str) + '\n')

    console.print(f"✅ Created {len(chunks)} chunks from {len(docs)} documents")
    console.print(f"📁 Saved to {output_file}")


@app.command("build-index")
def build_index(
    chunks_file: Path = typer.Option(
        Path("warehouse/gold/chunks/chunks.jsonl"),
        help="Input JSONL file with chunks"
    ),
    index_dir: Path = typer.Option(
        Path("rag/index"),
        help="Output directory for index"
    )
):
    """Build hybrid RAG index."""
    console.print("🔄 Building RAG index...")

    from .schemas import CHUNK
    from .rag.hybrid_index_lite import HybridIndexLite
    import json

    if not chunks_file.exists():
        console.print(f"❌ Chunks file not found: {chunks_file}")
        console.print("💡 Run 'wyngai chunk-docs' first")
        return

    # Load chunks
    chunks = []
    with open(chunks_file, 'r') as f:
        for line in f:
            chunk_data = json.loads(line)
            chunks.append(CHUNK(**chunk_data))

    console.print(f"📥 Loaded {len(chunks)} chunks")

    # Build index
    index = HybridIndexLite()
    index.build_index(chunks)

    # Save index
    index.save_index(index_dir)

    console.print(f"✅ Index built and saved to {index_dir}")


@app.command("serve-rag")
def serve_rag(
    host: str = typer.Option("0.0.0.0", help="Host address"),
    port: int = typer.Option(8000, help="Port number"),
    reload: bool = typer.Option(False, help="Enable auto-reload")
):
    """Start RAG service."""
    console.print(f"🚀 Starting RAG service on {host}:{port}")

    import uvicorn
    uvicorn.run(
        "rag.service:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )


@app.command("pipeline")
def run_pipeline():
    """Run complete processing pipeline."""
    console.print("🚀 Running complete WyngAI pipeline...")

    # Step 1: Parse eCFR data
    console.print("\n📋 Step 1: Parsing eCFR data...")
    parse_ecfr(
        input_dir=Path("warehouse/bronze/ecfr"),
        output_dir=Path("warehouse/silver/docs")
    )

    # Step 2: Chunk documents
    console.print("\n🔪 Step 2: Chunking documents...")
    chunk_documents(
        input_file=Path("warehouse/silver/docs/ecfr_docs.jsonl"),
        output_dir=Path("warehouse/gold/chunks")
    )

    # Step 3: Build index
    console.print("\n🔍 Step 3: Building RAG index...")
    build_index(
        chunks_file=Path("warehouse/gold/chunks/test_chunks.jsonl"),
        index_dir=Path("rag/index")
    )

    console.print("\n✅ Pipeline complete! RAG system ready.")
    console.print("\n🚀 Start RAG service with: wyngai serve-rag")


@app.command("demo")
def demo():
    """Run a quick demo of the system."""
    console.print("🚀 WyngAI Demo - Healthcare LLM Training Pipeline")
    console.print()

    # Show registry stats
    manager = RegistryManager()
    categories = manager.get_categories()
    console.print(f"📊 Registry: {len(manager.sources)} sources across {len(categories)} categories")

    # Show sample sources
    console.print("\n📋 Sample sources:")
    for i, source in enumerate(manager.sources[:3], 1):
        console.print(f"  {i}. {source.source} ({source.category})")

    console.print("\n💡 Next steps:")
    console.print("  1. Run 'wyngai write-excel' to export full source registry")
    console.print("  2. Run 'wyngai fetch-ecfr' to fetch key CFR sections")
    console.print("  3. Run 'wyngai parse-ecfr' to parse fetched data")
    console.print("  4. Run 'wyngai pipeline' to build complete RAG system")
    console.print("  5. Run 'wyngai serve-rag' to start API service")

    console.print("\n✨ Phase 2 complete: Full RAG system with hybrid search and FastAPI service!")


if __name__ == "__main__":
    app()