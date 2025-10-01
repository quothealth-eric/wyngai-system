"""Test Pydantic schemas."""

import pytest
from datetime import datetime
from uuid import UUID

from src.wyngai.schemas import DOC, CHUNK, DocType, Jurisdiction, AuthorityRanking


class TestDOCSchema:
    """Test DOC schema."""

    def test_doc_creation(self):
        """Test DOC creation with required fields."""
        doc = DOC(
            source_id="test_source_123",
            category="Test Category",
            title="Test Document",
            doc_type=DocType.REGULATION,
            jurisdiction=Jurisdiction.FEDERAL,
            version="1.0",
            url="https://example.com",
            license="Public Domain",
            text="This is test content for the document."
        )

        assert isinstance(doc.doc_id, UUID)
        assert doc.source_id == "test_source_123"
        assert doc.category == "Test Category"
        assert doc.doc_type == DocType.REGULATION
        assert doc.jurisdiction == Jurisdiction.FEDERAL
        assert isinstance(doc.created_at, datetime)

    def test_doc_source_id_generation(self):
        """Test automatic source_id generation from URL."""
        doc = DOC(
            category="Test Category",
            title="Test Document",
            doc_type=DocType.REGULATION,
            jurisdiction=Jurisdiction.FEDERAL,
            version="1.0",
            url="https://example.com/test",
            license="Public Domain",
            text="Test content"
        )

        assert doc.source_id is not None
        assert len(doc.source_id) == 16  # SHA256 hash truncated

    def test_doc_checksum_generation(self):
        """Test automatic checksum generation."""
        text_content = "This is test content for checksum generation."

        doc = DOC(
            source_id="test",
            category="Test Category",
            title="Test Document",
            doc_type=DocType.REGULATION,
            jurisdiction=Jurisdiction.FEDERAL,
            version="1.0",
            url="https://example.com",
            license="Public Domain",
            text=text_content
        )

        assert doc.checksum_sha256 is not None
        assert len(doc.checksum_sha256) == 64  # SHA256 hex string

    def test_doc_retrieval_priority_bounds(self):
        """Test retrieval priority validation."""
        # Valid priority
        doc = DOC(
            source_id="test",
            category="Test Category",
            title="Test Document",
            doc_type=DocType.REGULATION,
            jurisdiction=Jurisdiction.FEDERAL,
            version="1.0",
            url="https://example.com",
            license="Public Domain",
            text="Test content",
            retrieval_priority=0.8
        )
        assert doc.retrieval_priority == 0.8

        # Invalid priority (too high)
        with pytest.raises(ValueError):
            DOC(
                source_id="test",
                category="Test Category",
                title="Test Document",
                doc_type=DocType.REGULATION,
                jurisdiction=Jurisdiction.FEDERAL,
                version="1.0",
                url="https://example.com",
                license="Public Domain",
                text="Test content",
                retrieval_priority=1.5
            )


class TestCHUNKSchema:
    """Test CHUNK schema."""

    def test_chunk_creation(self):
        """Test CHUNK creation."""
        doc_id = UUID('12345678-1234-5678-1234-567812345678')

        chunk = CHUNK(
            doc_id=doc_id,
            ordinal=1,
            char_start=0,
            char_end=100,
            text="This is a test chunk of text content.",
            headings=["Section 1", "Subsection A"],
            section_path=["Title", "Part", "Section"],
            citations=["45 CFR 147.136"]
        )

        assert chunk.doc_id == doc_id
        assert chunk.ordinal == 1
        assert isinstance(chunk.chunk_id, UUID)
        assert isinstance(chunk.created_at, datetime)

    def test_chunk_token_count_estimation(self):
        """Test automatic token count estimation."""
        text_content = "This is a test chunk with multiple words for token estimation."

        chunk = CHUNK(
            doc_id=UUID('12345678-1234-5678-1234-567812345678'),
            ordinal=1,
            char_start=0,
            char_end=len(text_content),
            text=text_content
        )

        # Should estimate roughly len(text) / 4
        expected_tokens = len(text_content) // 4
        assert chunk.token_count == expected_tokens

    def test_chunk_authority_rank_bounds(self):
        """Test authority rank validation."""
        doc_id = UUID('12345678-1234-5678-1234-567812345678')

        # Valid authority rank
        chunk = CHUNK(
            doc_id=doc_id,
            ordinal=1,
            char_start=0,
            char_end=50,
            text="Test content",
            authority_rank=0.9
        )
        assert chunk.authority_rank == 0.9

        # Invalid authority rank (too low)
        with pytest.raises(ValueError):
            CHUNK(
                doc_id=doc_id,
                ordinal=1,
                char_start=0,
                char_end=50,
                text="Test content",
                authority_rank=-0.1
            )


class TestEnums:
    """Test enum values."""

    def test_doc_type_enum(self):
        """Test DocType enum values."""
        assert DocType.LAW == "law"
        assert DocType.REGULATION == "reg"
        assert DocType.PAYER_POLICY == "payer_policy"
        assert DocType.MANUAL == "manual"
        assert DocType.COURT_OPINION == "court_opinion"
        assert DocType.APPEAL_DECISION == "appeal_decision"
        assert DocType.DATASET_RECORD == "dataset_record"

    def test_jurisdiction_enum(self):
        """Test Jurisdiction enum values."""
        assert Jurisdiction.FEDERAL == "federal"
        assert Jurisdiction.STATE == "state"
        assert Jurisdiction.PAYER == "payer"
        assert Jurisdiction.MEDICARE == "medicare"


class TestAuthorityRanking:
    """Test AuthorityRanking schema."""

    def test_authority_ranking_defaults(self):
        """Test AuthorityRanking default values."""
        ranking = AuthorityRanking()

        assert ranking.federal_statute == 1.0
        assert ranking.federal_regulation == 0.9
        assert ranking.cms_manual == 0.8
        assert ranking.payer_policy == 0.4
        assert ranking.blog == 0.1

    def test_authority_ranking_custom(self):
        """Test AuthorityRanking with custom values."""
        ranking = AuthorityRanking(
            federal_statute=0.95,
            payer_policy=0.3
        )

        assert ranking.federal_statute == 0.95
        assert ranking.payer_policy == 0.3
        assert ranking.federal_regulation == 0.9  # Default value preserved