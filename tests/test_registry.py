"""Test registry functionality."""

import pytest
from pathlib import Path
import tempfile
import pandas as pd

from src.wyngai.registry import RegistryManager
from src.wyngai.schemas import SourceRegistry


class TestRegistryManager:
    """Test RegistryManager functionality."""

    def test_initialization(self):
        """Test RegistryManager initialization."""
        manager = RegistryManager()
        assert len(manager.sources) > 0
        assert all(isinstance(source, SourceRegistry) for source in manager.sources)

    def test_get_categories(self):
        """Test category extraction."""
        manager = RegistryManager()
        categories = manager.get_categories()

        assert len(categories) > 0
        assert isinstance(categories, list)
        assert "Federal Regulations & Rulemaking" in categories
        assert "Medicare Coverage & Policy" in categories

    def test_to_dataframe(self):
        """Test DataFrame conversion."""
        manager = RegistryManager()
        df = manager.to_dataframe()

        assert isinstance(df, pd.DataFrame)
        assert len(df) > 0
        assert 'category' in df.columns
        assert 'source' in df.columns
        assert 'url' in df.columns

    def test_filter_by_category(self):
        """Test category filtering."""
        manager = RegistryManager()
        federal_sources = manager.filter_by_category("Federal Regulations & Rulemaking")

        assert len(federal_sources) > 0
        assert all(source.category == "Federal Regulations & Rulemaking" for source in federal_sources)

    def test_get_source_by_name(self):
        """Test source retrieval by name."""
        manager = RegistryManager()

        # Test existing source
        source = manager.get_source_by_name("eCFR (Electronic Code of Federal Regulations)")
        assert source is not None
        assert source.category == "Federal Regulations & Rulemaking"

        # Test non-existent source
        with pytest.raises(ValueError):
            manager.get_source_by_name("Non-existent Source")

    def test_write_excel(self):
        """Test Excel file writing."""
        manager = RegistryManager()

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "test_registry.xlsx"
            manager.write_excel(output_path)

            # Verify file exists
            assert output_path.exists()
            assert output_path.stat().st_size > 0

            # Verify we can read it back
            df = pd.read_excel(output_path, sheet_name="All Sources")
            assert len(df) == len(manager.sources)

    def test_write_csv(self):
        """Test CSV file writing."""
        manager = RegistryManager()

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "test_registry.csv"
            manager.write_csv(output_path)

            # Verify file exists
            assert output_path.exists()
            assert output_path.stat().st_size > 0

            # Verify we can read it back
            df = pd.read_csv(output_path)
            assert len(df) == len(manager.sources)


class TestSourceRegistry:
    """Test SourceRegistry schema."""

    def test_source_registry_creation(self):
        """Test SourceRegistry creation with aliases."""
        data = {
            "Category": "Test Category",
            "Source": "Test Source",
            "DatasetScope": "Test Scope",
            "Format": "JSON",
            "HowToDownload": "API",
            "URL": "https://example.com",
            "AutomationNotes": "Test notes",
            "LicenseNotes": "Public domain"
        }

        source = SourceRegistry(**data)
        assert source.category == "Test Category"
        assert source.source == "Test Source"
        assert source.url == "https://example.com"

    def test_source_registry_validation(self):
        """Test SourceRegistry validation."""
        # Missing required field
        with pytest.raises(ValueError):
            SourceRegistry(Category="Test")

    def test_source_registry_dict_conversion(self):
        """Test SourceRegistry to dict conversion."""
        data = {
            "Category": "Test Category",
            "Source": "Test Source",
            "DatasetScope": "Test Scope",
            "Format": "JSON",
            "HowToDownload": "API",
            "URL": "https://example.com",
            "AutomationNotes": "Test notes",
            "LicenseNotes": "Public domain"
        }

        source = SourceRegistry(**data)
        source_dict = source.model_dump()

        assert isinstance(source_dict, dict)
        assert source_dict['category'] == "Test Category"
        assert source_dict['source'] == "Test Source"