"""Test CLI functionality."""

import pytest
from typer.testing import CliRunner
from pathlib import Path
import tempfile
import os

from src.wyngai.cli_simple import app


class TestCLI:
    """Test CLI commands."""

    def setup_method(self):
        """Set up test environment."""
        self.runner = CliRunner()

    def test_version_command(self):
        """Test version command."""
        result = self.runner.invoke(app, ["version"])
        assert result.exit_code == 0
        assert "WyngAI version" in result.stdout

    def test_help_command(self):
        """Test help command."""
        result = self.runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "Healthcare billing and appeals LLM training infrastructure" in result.stdout

    def test_demo_command(self):
        """Test demo command."""
        result = self.runner.invoke(app, ["demo"])
        assert result.exit_code == 0
        assert "WyngAI Demo" in result.stdout
        assert "Registry:" in result.stdout
        assert "Next steps:" in result.stdout

    def test_list_categories_command(self):
        """Test list-categories command."""
        result = self.runner.invoke(app, ["list-categories"])
        assert result.exit_code == 0
        assert "Source Categories:" in result.stdout
        assert "Federal Regulations" in result.stdout

    def test_list_sources_command(self):
        """Test list-sources command."""
        result = self.runner.invoke(app, ["list-sources"])
        assert result.exit_code == 0
        assert "Source Registry" in result.stdout

    def test_write_excel_command(self):
        """Test write-excel command."""
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "test_registry.xlsx"

            result = self.runner.invoke(app, ["write-excel", str(output_path)])
            assert result.exit_code == 0
            assert "Registry exported" in result.stdout
            assert output_path.exists()

            # Also check CSV was created
            csv_path = output_path.with_suffix('.csv')
            assert csv_path.exists()

    def test_write_excel_default_path(self):
        """Test write-excel with default path."""
        # Change to temp directory to avoid polluting project
        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                result = self.runner.invoke(app, ["write-excel"])
                assert result.exit_code == 0
                assert "Registry exported" in result.stdout

                # Check files were created in default location
                default_path = Path("data/registry/wyng_llm_training_sources.xlsx")
                assert default_path.exists()
            finally:
                os.chdir(original_cwd)

    def test_fetch_ecfr_help(self):
        """Test fetch-ecfr help."""
        result = self.runner.invoke(app, ["fetch-ecfr", "--help"])
        assert result.exit_code == 0
        assert "Fetch eCFR sections" in result.stdout
        assert "output-dir" in result.stdout
        assert "sections" in result.stdout

    def test_fetch_fedreg_help(self):
        """Test fetch-fedreg help."""
        result = self.runner.invoke(app, ["fetch-fedreg", "--help"])
        assert result.exit_code == 0
        assert "Fetch Federal Register documents" in result.stdout
        assert "since-days" in result.stdout
        assert "fetch-content" in result.stdout

    def test_fetch_all_help(self):
        """Test fetch-all help."""
        result = self.runner.invoke(app, ["fetch-all", "--help"])
        assert result.exit_code == 0
        assert "Fetch data from all primary sources" in result.stdout

    # Integration tests would go here but require network access
    # These are commented out to avoid external dependencies in tests
    #
    # def test_fetch_ecfr_integration(self):
    #     """Test eCFR fetching (requires network)."""
    #     with tempfile.TemporaryDirectory() as temp_dir:
    #         result = self.runner.invoke(app, [
    #             "fetch-ecfr",
    #             "--output-dir", temp_dir,
    #             "--sections", "title-45/part-147/section-147.136"
    #         ])
    #         # Would check result and files created