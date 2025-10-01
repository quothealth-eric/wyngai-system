"""
Data expansion pipeline for WyngAI healthcare regulation dataset.

Orchestrates the continuous fetching, parsing, and indexing of healthcare
regulations, payer policies, and appeal decisions from multiple sources.
"""

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib

from .state_doi_fetcher import StateDOIFetcher
from .payer_policy_fetcher import PayerPolicyFetcher
from .appeals_history_fetcher import AppealsHistoryFetcher
from ..schemas import DOC, DocType, Jurisdiction
from ..chunk.hierarchical import HierarchicalChunker
from rag.hybrid_index_lite import HybridIndexLite as HybridIndex
from ..utils.config import config

logger = logging.getLogger(__name__)


class DataExpansionPipeline:
    """
    Orchestrates the comprehensive data expansion for WyngAI.

    Manages fetching from multiple sources, parsing documents,
    chunking content, and updating the RAG index with proper
    authority ranking and provenance tracking.
    """

    def __init__(self, base_output_dir: Path, index_dir: Optional[Path] = None):
        self.base_output_dir = Path(base_output_dir)
        self.index_dir = index_dir or (self.base_output_dir / "hybrid_index")

        # Initialize fetchers
        self.state_doi_fetcher = StateDOIFetcher()
        self.payer_policy_fetcher = PayerPolicyFetcher()
        self.appeals_history_fetcher = AppealsHistoryFetcher()

        # Initialize chunker and index
        self.chunker = HierarchicalChunker()
        self.hybrid_index = None  # Will be initialized when needed

        # Pipeline configuration
        self.config = {
            "max_workers": 3,  # Conservative for web scraping
            "batch_size": 10,
            "rate_limit_delay": 2.0,
            "retry_attempts": 3,
            "authority_rankings": {
                "state_doi": {"min": 0.85, "max": 0.90},
                "payer_policy": {"min": 0.75, "max": 0.80},
                "appeal_precedent": {"min": 0.70, "max": 0.75},
                "federal_regulation": {"min": 0.90, "max": 0.95}
            }
        }

        # Provenance tracking
        self.provenance_db = {}
        self.fetch_history = {}

    def initialize_index(self):
        """Initialize the hybrid index if not already done."""
        if self.hybrid_index is None:
            self.hybrid_index = HybridIndex(
                index_dir=self.index_dir,
                embedding_model="sentence-transformers/all-MiniLM-L6-v2"
            )

    def run_full_expansion(self, expansion_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Run the complete data expansion pipeline.

        Args:
            expansion_config: Configuration for what to fetch

        Returns:
            Summary of expansion results
        """
        if expansion_config is None:
            expansion_config = self._get_default_expansion_config()

        logger.info("Starting comprehensive data expansion pipeline")
        start_time = datetime.now(timezone.utc)

        results = {
            "start_time": start_time.isoformat(),
            "expansion_config": expansion_config,
            "sources_processed": {},
            "documents_fetched": 0,
            "chunks_created": 0,
            "index_updated": False,
            "errors": [],
            "warnings": []
        }

        try:
            # Phase 1: Fetch State DOI Regulations
            if expansion_config.get("fetch_state_doi", True):
                logger.info("Phase 1: Fetching state DOI regulations")
                state_results = self._fetch_state_regulations(
                    expansion_config.get("state_codes"),
                    expansion_config.get("state_priority_topics")
                )
                results["sources_processed"]["state_doi"] = state_results
                results["documents_fetched"] += state_results.get("documents_count", 0)

            # Phase 2: Fetch Payer Policies
            if expansion_config.get("fetch_payer_policies", True):
                logger.info("Phase 2: Fetching payer policies")
                payer_results = self._fetch_payer_policies(
                    expansion_config.get("payer_codes"),
                    expansion_config.get("policy_types")
                )
                results["sources_processed"]["payer_policies"] = payer_results
                results["documents_fetched"] += payer_results.get("documents_count", 0)

            # Phase 3: Fetch Appeal Decisions
            if expansion_config.get("fetch_appeals", True):
                logger.info("Phase 3: Fetching appeal decisions")
                appeals_results = self._fetch_appeal_decisions(
                    expansion_config.get("appeal_sources"),
                    expansion_config.get("appeal_search_terms")
                )
                results["sources_processed"]["appeals"] = appeals_results
                results["documents_fetched"] += appeals_results.get("documents_count", 0)

            # Phase 4: Process and Chunk Documents
            if expansion_config.get("process_documents", True):
                logger.info("Phase 4: Processing and chunking documents")
                chunk_results = self._process_and_chunk_documents()
                results["chunks_created"] = chunk_results.get("chunks_count", 0)

            # Phase 5: Update RAG Index
            if expansion_config.get("update_index", True):
                logger.info("Phase 5: Updating RAG index")
                index_results = self._update_rag_index()
                results["index_updated"] = index_results.get("success", False)

            # Phase 6: Generate Provenance Report
            provenance_report = self._generate_provenance_report()
            results["provenance_report"] = provenance_report

        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            results["errors"].append(str(e))

        finally:
            end_time = datetime.now(timezone.utc)
            results["end_time"] = end_time.isoformat()
            results["duration_minutes"] = (end_time - start_time).total_seconds() / 60

            # Save pipeline results
            self._save_pipeline_results(results)

        logger.info(f"Data expansion pipeline completed in {results['duration_minutes']:.2f} minutes")
        return results

    def _get_default_expansion_config(self) -> Dict[str, Any]:
        """Get default configuration for data expansion."""
        return {
            "fetch_state_doi": True,
            "state_codes": ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "MI", "WA", "MA"],  # Top 10 states
            "state_priority_topics": [
                "claims handling", "appeals procedures", "network adequacy",
                "surprise billing", "external review", "medical necessity"
            ],

            "fetch_payer_policies": True,
            "payer_codes": ["AETNA", "BCBS", "UHC", "CIGNA", "HUMANA", "ANTHEM"],  # Major payers
            "policy_types": ["medical", "appeals", "prior_auth"],

            "fetch_appeals": True,
            "appeal_sources": ["IRO_DECISIONS", "CMS_APPEALS", "JUSTIA"],  # Most reliable sources
            "appeal_search_terms": [
                "medical necessity", "external review", "coverage denial",
                "ERISA appeal", "health insurance appeal"
            ],

            "process_documents": True,
            "update_index": True,

            "batch_processing": True,
            "parallel_fetching": True,
            "max_documents_per_source": 50  # Limit for initial expansion
        }

    def _fetch_state_regulations(self, state_codes: Optional[List[str]],
                               priority_topics: Optional[List[str]]) -> Dict[str, Any]:
        """Fetch state DOI regulations with error handling and progress tracking."""
        results = {
            "documents_count": 0,
            "states_processed": [],
            "states_failed": [],
            "documents": []
        }

        if state_codes is None:
            state_codes = ["CA", "NY", "TX", "FL", "IL"]  # Default subset

        output_dir = self.base_output_dir / "state_doi"

        for state_code in state_codes:
            try:
                logger.info(f"Fetching regulations for state: {state_code}")

                state_output_dir = output_dir / f"state_{state_code.lower()}"
                docs = self.state_doi_fetcher.fetch_state_regulations(state_code, state_output_dir)

                # Apply authority ranking
                for doc in docs:
                    doc.retrieval_priority = self._calculate_authority_rank(doc, "state_doi")

                results["documents"].extend(docs)
                results["documents_count"] += len(docs)
                results["states_processed"].append(state_code)

                # Track provenance
                self._track_provenance(docs, "state_doi", {"state_code": state_code})

                logger.info(f"Fetched {len(docs)} documents from {state_code}")

                # Rate limiting between states
                time.sleep(self.config["rate_limit_delay"])

            except Exception as e:
                logger.warning(f"Failed to fetch regulations for {state_code}: {e}")
                results["states_failed"].append({"state": state_code, "error": str(e)})

        return results

    def _fetch_payer_policies(self, payer_codes: Optional[List[str]],
                            policy_types: Optional[List[str]]) -> Dict[str, Any]:
        """Fetch payer policies with error handling and progress tracking."""
        results = {
            "documents_count": 0,
            "payers_processed": [],
            "payers_failed": [],
            "documents": []
        }

        if payer_codes is None:
            payer_codes = ["AETNA", "BCBS", "UHC", "CIGNA"]  # Default subset

        if policy_types is None:
            policy_types = ["medical", "appeals"]

        output_dir = self.base_output_dir / "payer_policies"

        for payer_code in payer_codes:
            try:
                logger.info(f"Fetching policies for payer: {payer_code}")

                payer_output_dir = output_dir / f"payer_{payer_code.lower()}"
                docs = self.payer_policy_fetcher.fetch_payer_policies(
                    payer_code, payer_output_dir, policy_types
                )

                # Apply authority ranking
                for doc in docs:
                    doc.retrieval_priority = self._calculate_authority_rank(doc, "payer_policy")

                results["documents"].extend(docs)
                results["documents_count"] += len(docs)
                results["payers_processed"].append(payer_code)

                # Track provenance
                self._track_provenance(docs, "payer_policy", {"payer_code": payer_code})

                logger.info(f"Fetched {len(docs)} policies from {payer_code}")

                # Rate limiting between payers
                time.sleep(self.config["rate_limit_delay"] * 2)

            except Exception as e:
                logger.warning(f"Failed to fetch policies for {payer_code}: {e}")
                results["payers_failed"].append({"payer": payer_code, "error": str(e)})

        return results

    def _fetch_appeal_decisions(self, appeal_sources: Optional[List[str]],
                              search_terms: Optional[List[str]]) -> Dict[str, Any]:
        """Fetch appeal decisions with error handling and progress tracking."""
        results = {
            "documents_count": 0,
            "sources_processed": [],
            "sources_failed": [],
            "documents": []
        }

        if appeal_sources is None:
            appeal_sources = ["IRO_DECISIONS", "CMS_APPEALS"]  # Default reliable sources

        output_dir = self.base_output_dir / "appeals"

        for source_code in appeal_sources:
            try:
                logger.info(f"Fetching appeals from source: {source_code}")

                source_output_dir = output_dir / f"source_{source_code.lower()}"
                docs = self.appeals_history_fetcher.fetch_appeal_decisions(
                    source_code, source_output_dir, search_terms
                )

                # Apply authority ranking
                for doc in docs:
                    doc.retrieval_priority = self._calculate_authority_rank(doc, "appeal_precedent")

                results["documents"].extend(docs)
                results["documents_count"] += len(docs)
                results["sources_processed"].append(source_code)

                # Track provenance
                self._track_provenance(docs, "appeal_precedent", {"source_code": source_code})

                logger.info(f"Fetched {len(docs)} decisions from {source_code}")

                # Rate limiting between sources
                time.sleep(self.config["rate_limit_delay"] * 3)

            except Exception as e:
                logger.warning(f"Failed to fetch appeals from {source_code}: {e}")
                results["sources_failed"].append({"source": source_code, "error": str(e)})

        return results

    def _calculate_authority_rank(self, doc: DOC, source_type: str) -> float:
        """
        Calculate authority ranking for a document based on its type and source.

        Args:
            doc: Document object
            source_type: Type of source

        Returns:
            Authority ranking between 0.0 and 1.0
        """
        base_rankings = self.config["authority_rankings"]

        if source_type not in base_rankings:
            return 0.75  # Default

        ranking_range = base_rankings[source_type]
        base_rank = ranking_range["min"]

        # Adjust based on document characteristics
        adjustments = 0.0

        # Jurisdiction adjustments
        if doc.jurisdiction == Jurisdiction.FEDERAL:
            adjustments += 0.02
        elif doc.jurisdiction == Jurisdiction.STATE:
            # Some states have stronger healthcare regulations
            state_bonuses = {"CA": 0.02, "NY": 0.02, "MA": 0.01, "WA": 0.01}
            state_code = doc.metadata.get("state_code", "")
            adjustments += state_bonuses.get(state_code, 0.0)

        # Document type adjustments
        if doc.doc_type == DocType.REGULATION:
            adjustments += 0.01
        elif doc.doc_type == DocType.COURT_OPINION:
            adjustments += 0.01

        # Content quality indicators
        text_length = len(doc.text)
        if text_length > 5000:  # Substantial content
            adjustments += 0.005
        if text_length > 20000:  # Very detailed
            adjustments += 0.005

        # Recent documents may be more relevant
        if doc.effective_date or doc.published_date:
            recent_date = doc.effective_date or doc.published_date
            if recent_date and recent_date > datetime.now(timezone.utc) - timedelta(days=365):
                adjustments += 0.01

        final_rank = min(base_rank + adjustments, ranking_range["max"])
        return round(final_rank, 3)

    def _process_and_chunk_documents(self) -> Dict[str, Any]:
        """Process all fetched documents and create chunks."""
        results = {
            "chunks_count": 0,
            "documents_processed": 0,
            "processing_errors": []
        }

        # Find all document files
        doc_files = list(self.base_output_dir.rglob("*.json"))

        logger.info(f"Processing {len(doc_files)} document files")

        for doc_file in doc_files:
            try:
                # Load document
                with open(doc_file, 'r', encoding='utf-8') as f:
                    doc_data = json.load(f)

                doc = DOC(**doc_data)

                # Create chunks
                chunks = self.chunker.chunk_document(doc)

                # Apply authority ranking to chunks
                for chunk in chunks:
                    chunk.authority_rank = doc.retrieval_priority

                # Save chunks
                chunks_dir = doc_file.parent / "chunks"
                chunks_dir.mkdir(exist_ok=True)

                chunk_file = chunks_dir / f"{doc.source_id}_chunks.json"
                with open(chunk_file, 'w', encoding='utf-8') as f:
                    json.dump(
                        [chunk.model_dump() for chunk in chunks],
                        f, indent=2, ensure_ascii=False, default=str
                    )

                results["chunks_count"] += len(chunks)
                results["documents_processed"] += 1

                logger.info(f"Created {len(chunks)} chunks for {doc.title[:50]}...")

            except Exception as e:
                logger.warning(f"Error processing {doc_file}: {e}")
                results["processing_errors"].append({"file": str(doc_file), "error": str(e)})

        return results

    def _update_rag_index(self) -> Dict[str, Any]:
        """Update the RAG index with new chunks."""
        results = {
            "success": False,
            "chunks_indexed": 0,
            "index_errors": []
        }

        try:
            self.initialize_index()

            # Find all chunk files
            chunk_files = list(self.base_output_dir.rglob("*_chunks.json"))

            logger.info(f"Indexing chunks from {len(chunk_files)} files")

            all_chunks = []

            for chunk_file in chunk_files:
                try:
                    with open(chunk_file, 'r', encoding='utf-8') as f:
                        chunk_data_list = json.load(f)

                    for chunk_data in chunk_data_list:
                        from ..schemas import CHUNK
                        chunk = CHUNK(**chunk_data)
                        all_chunks.append(chunk)

                except Exception as e:
                    logger.warning(f"Error loading chunks from {chunk_file}: {e}")
                    results["index_errors"].append({"file": str(chunk_file), "error": str(e)})

            # Batch index chunks
            if all_chunks:
                self.hybrid_index.add_chunks(all_chunks)
                results["chunks_indexed"] = len(all_chunks)
                results["success"] = True

                logger.info(f"Successfully indexed {len(all_chunks)} chunks")

        except Exception as e:
            logger.error(f"Error updating RAG index: {e}")
            results["index_errors"].append({"stage": "indexing", "error": str(e)})

        return results

    def _track_provenance(self, docs: List[DOC], source_type: str, metadata: Dict[str, Any]):
        """Track provenance information for fetched documents."""
        for doc in docs:
            provenance_id = hashlib.sha256(
                f"{doc.source_id}_{source_type}_{datetime.now(timezone.utc).isoformat()}".encode()
            ).hexdigest()[:16]

            self.provenance_db[provenance_id] = {
                "doc_id": str(doc.doc_id),
                "source_id": doc.source_id,
                "source_type": source_type,
                "fetch_date": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata,
                "url": doc.url,
                "authority_rank": doc.retrieval_priority
            }

    def _generate_provenance_report(self) -> Dict[str, Any]:
        """Generate a comprehensive provenance report."""
        report = {
            "total_documents": len(self.provenance_db),
            "source_breakdown": {},
            "authority_distribution": {},
            "fetch_summary": {},
            "data_quality_metrics": {}
        }

        # Source breakdown
        source_counts = {}
        authority_ranks = []

        for provenance in self.provenance_db.values():
            source_type = provenance["source_type"]
            source_counts[source_type] = source_counts.get(source_type, 0) + 1
            authority_ranks.append(provenance["authority_rank"])

        report["source_breakdown"] = source_counts

        # Authority distribution
        if authority_ranks:
            report["authority_distribution"] = {
                "min": min(authority_ranks),
                "max": max(authority_ranks),
                "average": sum(authority_ranks) / len(authority_ranks),
                "high_authority_count": len([r for r in authority_ranks if r >= 0.85])
            }

        # Save provenance database
        provenance_file = self.base_output_dir / "provenance_db.json"
        with open(provenance_file, 'w', encoding='utf-8') as f:
            json.dump(self.provenance_db, f, indent=2, ensure_ascii=False)

        return report

    def _save_pipeline_results(self, results: Dict[str, Any]):
        """Save pipeline execution results."""
        results_file = self.base_output_dir / f"pipeline_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False, default=str)

        logger.info(f"Pipeline results saved to {results_file}")

    def run_incremental_update(self, days_lookback: int = 7) -> Dict[str, Any]:
        """
        Run incremental update to fetch only new/updated documents.

        Args:
            days_lookback: Number of days to look back for updates

        Returns:
            Summary of incremental update results
        """
        logger.info(f"Running incremental update (last {days_lookback} days)")

        # This would implement logic to:
        # 1. Check last successful fetch dates for each source
        # 2. Only fetch documents updated since then
        # 3. Identify and update changed documents
        # 4. Incrementally update the index

        # For now, return a placeholder
        return {
            "update_type": "incremental",
            "days_lookback": days_lookback,
            "documents_updated": 0,
            "implementation": "placeholder"
        }

    def get_expansion_status(self) -> Dict[str, Any]:
        """Get current status of the data expansion system."""
        status = {
            "last_full_expansion": None,
            "total_documents": 0,
            "total_chunks": 0,
            "source_counts": {},
            "index_status": {},
            "data_freshness": {}
        }

        # Check for latest pipeline results
        results_files = list(self.base_output_dir.glob("pipeline_results_*.json"))
        if results_files:
            latest_results = max(results_files, key=lambda f: f.stat().st_mtime)
            with open(latest_results, 'r') as f:
                latest_data = json.load(f)
            status["last_full_expansion"] = latest_data.get("end_time")

        # Count documents and chunks
        doc_files = list(self.base_output_dir.rglob("*.json"))
        chunk_files = list(self.base_output_dir.rglob("*_chunks.json"))

        status["total_documents"] = len([f for f in doc_files if not f.name.endswith("_chunks.json")])
        status["total_chunks"] = len(chunk_files)

        # Check index status
        if self.index_dir.exists():
            status["index_status"]["exists"] = True
            status["index_status"]["size_gb"] = sum(
                f.stat().st_size for f in self.index_dir.rglob("*")
            ) / (1024**3)
        else:
            status["index_status"]["exists"] = False

        return status