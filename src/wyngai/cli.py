"""
CLI interface for WyngAI.
"""

from pathlib import Path
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table

from .registry import RegistryManager
from .utils.config import Config

app = typer.Typer(help="WyngAI - Healthcare billing and appeals LLM training infrastructure")
console = Console()


@app.command()
def version():
    """Show version information."""
    from . import __version__
    console.print(f"WyngAI version {__version__}")


registry_app = typer.Typer()
app.add_typer(registry_app, name="registry", help="Registry management commands")


@registry_app.command("write-excel")
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


@registry_app.command("list")
def list_sources():
    """List all sources in the registry."""
    manager = RegistryManager()

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


@registry_app.command("categories")
def list_categories():
    """List all source categories."""
    manager = RegistryManager()
    categories = manager.get_categories()

    console.print("📁 Source Categories:")
    for i, category in enumerate(sorted(categories), 1):
        console.print(f"{i}. {category}")


fetch_app = typer.Typer()
app.add_typer(fetch_app, name="fetch", help="Data fetching commands")


@fetch_app.command("ecfr")
def fetch_ecfr(
    sections: Optional[str] = typer.Option(None, help="Comma-separated list of sections to fetch"),
    output_dir: Path = typer.Option(Path("warehouse/bronze/ecfr"), help="Output directory")
):
    """Fetch eCFR sections."""
    console.print("🔄 Fetching eCFR sections...")
    # TODO: Implement eCFR fetcher
    console.print("⚠️  eCFR fetcher not yet implemented")


@fetch_app.command("fedreg")
def fetch_federal_register(
    query: str = typer.Option("No Surprises Act", help="Search query"),
    output_dir: Path = typer.Option(Path("warehouse/bronze/fedreg"), help="Output directory")
):
    """Fetch Federal Register documents."""
    console.print(f"🔄 Fetching Federal Register documents for: {query}")
    # TODO: Implement Federal Register fetcher
    console.print("⚠️  Federal Register fetcher not yet implemented")


@fetch_app.command("mcd")
def fetch_mcd(
    output_dir: Path = typer.Option(Path("warehouse/bronze/mcd"), help="Output directory")
):
    """Fetch CMS Medicare Coverage Database."""
    console.print("🔄 Fetching MCD datasets...")
    # TODO: Implement MCD fetcher
    console.print("⚠️  MCD fetcher not yet implemented")


@app.group()
def parse():
    """Data parsing commands."""
    pass


@parse.command("ecfr")
def parse_ecfr(
    input_dir: Path = typer.Option(Path("warehouse/bronze/ecfr"), help="Input directory"),
    output_dir: Path = typer.Option(Path("warehouse/silver/ecfr"), help="Output directory")
):
    """Parse eCFR data to normalized DOC format."""
    console.print("🔄 Parsing eCFR data...")
    # TODO: Implement eCFR parser
    console.print("⚠️  eCFR parser not yet implemented")


@app.group()
def normalize():
    """Data normalization commands."""
    pass


@normalize.command("all")
def normalize_all():
    """Normalize all parsed data to standard schema."""
    console.print("🔄 Normalizing all datasets...")
    # TODO: Implement normalization
    console.print("⚠️  Normalization not yet implemented")


@app.group()
def chunk():
    """Data chunking commands."""
    pass


@chunk.command("all")
def chunk_all():
    """Chunk all normalized documents."""
    console.print("🔄 Chunking all documents...")
    # TODO: Implement chunking
    console.print("⚠️  Chunking not yet implemented")


@app.group()
def index():
    """Index management commands."""
    pass


@index.command("build")
def build_index():
    """Build hybrid search index."""
    console.print("🔄 Building search index...")
    # TODO: Implement indexing
    console.print("⚠️  Index building not yet implemented")


@app.group()
def serve():
    """Service commands."""
    pass


@serve.command("rag")
def serve_rag(
    host: str = typer.Option("0.0.0.0", help="Host address"),
    port: int = typer.Option(8000, help="Port number"),
    reload: bool = typer.Option(False, help="Enable auto-reload")
):
    """Start RAG service."""
    console.print(f"🚀 Starting RAG service on {host}:{port}")
    # TODO: Implement RAG service startup
    console.print("⚠️  RAG service not yet implemented")


@app.group()
def eval():
    """Evaluation commands."""
    pass


@eval.command("run")
def run_evaluation():
    """Run evaluation on RAG system."""
    console.print("🔄 Running evaluation...")
    # TODO: Implement evaluation
    console.print("⚠️  Evaluation not yet implemented")


if __name__ == "__main__":
    app()