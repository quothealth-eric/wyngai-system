"""
Pydantic schemas for DOC and CHUNK models.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
import hashlib

from pydantic import BaseModel, Field, field_validator, model_validator


class DocType(str, Enum):
    """Document type enumeration."""
    LAW = "law"
    REGULATION = "reg"
    PAYER_POLICY = "payer_policy"
    MANUAL = "manual"
    COURT_OPINION = "court_opinion"
    APPEAL_DECISION = "appeal_decision"
    DATASET_RECORD = "dataset_record"


class Jurisdiction(str, Enum):
    """Jurisdiction enumeration."""
    FEDERAL = "federal"
    STATE = "state"
    PAYER = "payer"
    MEDICARE = "medicare"


class DOC(BaseModel):
    """
    Source-level document schema.

    Represents a complete document or policy from an authoritative source.
    """
    doc_id: UUID = Field(default_factory=uuid4)
    source_id: str = Field(..., description="Stable hash of URL/path")
    category: str = Field(..., description="Source category from registry")
    title: str = Field(..., description="Document title")
    doc_type: DocType = Field(..., description="Type of document")
    jurisdiction: Jurisdiction = Field(..., description="Governing jurisdiction")
    citation: Optional[str] = Field(None, description="Legal citation (e.g., 45 CFR 147.136)")
    effective_date: Optional[datetime] = Field(None, description="When document takes effect")
    published_date: Optional[datetime] = Field(None, description="When document was published")
    revised_date: Optional[datetime] = Field(None, description="When document was last revised")
    version: str = Field(..., description="Document version identifier")
    url: str = Field(..., description="Source URL")
    license: str = Field(..., description="License information")
    text: str = Field(..., description="Full document text")
    checksum_sha256: str = Field(..., description="SHA256 hash of content")
    retrieval_priority: float = Field(default=0.5, ge=0.0, le=1.0, description="Priority for retrieval (0-1)")
    tags: List[str] = Field(default_factory=list, description="Document tags")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode='before')
    def generate_fields(cls, data):
        """Generate source_id and checksum if not provided."""
        if isinstance(data, dict):
            # Generate source_id from URL if not provided
            if 'source_id' not in data or data['source_id'] is None:
                if 'url' in data:
                    data['source_id'] = hashlib.sha256(data['url'].encode()).hexdigest()[:16]

            # Generate checksum from text if not provided
            if 'checksum_sha256' not in data or data['checksum_sha256'] is None:
                if 'text' in data:
                    data['checksum_sha256'] = hashlib.sha256(data['text'].encode()).hexdigest()

        return data


class CHUNK(BaseModel):
    """
    Retrieval unit schema (800-2,000 tokens).

    Represents a searchable chunk of text from a document.
    """
    chunk_id: UUID = Field(default_factory=uuid4)
    doc_id: UUID = Field(..., description="Parent document ID")
    ordinal: int = Field(..., description="Chunk order within document")
    char_start: int = Field(..., description="Character start position in document")
    char_end: int = Field(..., description="Character end position in document")
    text: str = Field(..., description="Chunk text content")
    token_count: int = Field(..., description="Estimated token count")
    embeddings: Optional[List[float]] = Field(None, description="Vector embeddings")
    headings: List[str] = Field(default_factory=list, description="Section headings")
    section_path: List[str] = Field(default_factory=list, description="Hierarchical section path")
    citations: List[str] = Field(default_factory=list, description="Referenced citations/URIs")
    authority_rank: float = Field(default=0.5, ge=0.0, le=1.0, description="Authority ranking for precedence")
    topics: List[str] = Field(default_factory=list, description="Extracted topics")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode='before')
    def estimate_token_count(cls, data):
        """Estimate token count from text if not provided."""
        if isinstance(data, dict):
            if 'token_count' not in data or data['token_count'] is None:
                if 'text' in data:
                    # Rough estimation: 4 chars per token
                    data['token_count'] = len(data['text']) // 4
        return data


class SourceRegistry(BaseModel):
    """Registry entry for data sources."""
    category: str = Field(alias="Category")
    source: str = Field(alias="Source")
    dataset_scope: str = Field(alias="DatasetScope")
    format: str = Field(alias="Format")
    how_to_download: str = Field(alias="HowToDownload")
    url: str = Field(alias="URL")
    automation_notes: str = Field(alias="AutomationNotes")
    license_notes: str = Field(alias="LicenseNotes")

    model_config = {'populate_by_name': True}


class AuthorityRanking(BaseModel):
    """Authority ranking configuration for precedence."""
    federal_statute: float = 1.0
    federal_regulation: float = 0.95
    cms_manual: float = 0.90
    cms_coverage: float = 0.90
    state_regulation: float = 0.87  # State DOI regulations (85-90%)
    state_statute: float = 0.85
    payer_policy: float = 0.78  # Insurance carrier policies (75-80%)
    court_decision_erisa: float = 0.75
    appeal_precedent: float = 0.72  # Historical appeal decisions (70-75%)
    iro_decision: float = 0.70  # Independent Review Organization decisions
    state_court_decision: float = 0.68
    administrative_ruling: float = 0.65
    secondary_source: float = 0.40
    industry_guidance: float = 0.30
    blog: float = 0.10