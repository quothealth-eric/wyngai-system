"""
Hierarchical chunking system with metadata enrichment.

Splits documents into retrieval-optimized chunks while preserving structure.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from uuid import uuid4

from ..schemas import DOC, CHUNK, AuthorityRanking


class HierarchicalChunker:
    """Hierarchical document chunker with structure awareness."""

    def __init__(self,
                 min_chunk_size: int = 800,
                 max_chunk_size: int = 2000,
                 overlap_size: int = 200):
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
        self.overlap_size = overlap_size
        self.authority_ranking = AuthorityRanking()

    def chunk_document(self, doc: DOC) -> List[CHUNK]:
        """
        Chunk a single document into retrieval units.

        Args:
            doc: Document to chunk

        Returns:
            List of CHUNK objects
        """
        # Extract document structure
        sections = self._extract_sections(doc.text, doc.doc_type)

        chunks = []
        chunk_ordinal = 0

        for section in sections:
            section_chunks = self._chunk_section(
                section,
                doc,
                chunk_ordinal
            )
            chunks.extend(section_chunks)
            chunk_ordinal += len(section_chunks)

        # Enrich chunks with metadata
        enriched_chunks = []
        for chunk in chunks:
            enriched_chunk = self._enrich_chunk(chunk, doc)
            enriched_chunks.append(enriched_chunk)

        return enriched_chunks

    def chunk_documents(self, docs: List[DOC]) -> List[CHUNK]:
        """
        Chunk multiple documents.

        Args:
            docs: List of documents to chunk

        Returns:
            List of all CHUNK objects
        """
        all_chunks = []

        for doc in docs:
            doc_chunks = self.chunk_document(doc)
            all_chunks.extend(doc_chunks)

        print(f"Created {len(all_chunks)} chunks from {len(docs)} documents")
        return all_chunks

    def _extract_sections(self, text: str, doc_type: str) -> List[Dict[str, Any]]:
        """Extract logical sections from document text."""
        sections = []

        if doc_type == "reg":  # Regulation
            sections = self._extract_regulation_sections(text)
        elif doc_type == "manual":  # Manual/Policy
            sections = self._extract_manual_sections(text)
        elif doc_type == "court_opinion":
            sections = self._extract_court_sections(text)
        else:
            # Generic paragraph-based chunking
            sections = self._extract_generic_sections(text)

        return sections

    def _extract_regulation_sections(self, text: str) -> List[Dict[str, Any]]:
        """Extract sections from regulatory text (CFR style)."""
        sections = []

        # Look for section patterns like "§ 147.136" or "(a)", "(1)", etc.
        section_patterns = [
            r'§\s*\d+\.\d+[a-z]*(?:\([^)]+\))*',  # § 147.136(a)(1)
            r'\([a-z]+\)\s*[A-Z]',                  # (a) Capital letter
            r'\(\d+\)\s*[A-Z]',                     # (1) Capital letter
            r'\n[A-Z][^.]*\.\s*\n'                 # Title-like lines
        ]

        current_section = {"text": "", "headings": [], "section_path": []}

        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue

            # Check if this line starts a new section
            is_new_section = any(re.match(pattern, line) for pattern in section_patterns)

            if is_new_section and current_section["text"]:
                # Save current section
                sections.append(current_section.copy())
                current_section = {"text": line, "headings": [line], "section_path": [line]}
            else:
                current_section["text"] += f"\n{line}"

        # Add final section
        if current_section["text"]:
            sections.append(current_section)

        return sections

    def _extract_manual_sections(self, text: str) -> List[Dict[str, Any]]:
        """Extract sections from manual/policy text."""
        sections = []

        # Look for numbered sections, headings, etc.
        heading_patterns = [
            r'^\d+\.\s+[A-Z]',           # 1. Section Title
            r'^[A-Z][^.]*:\s*$',         # Title:
            r'^[A-Z\s]+$',               # ALL CAPS HEADINGS
        ]

        current_section = {"text": "", "headings": [], "section_path": []}

        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue

            # Check for headings
            is_heading = any(re.match(pattern, line) for pattern in heading_patterns)

            if is_heading and current_section["text"]:
                sections.append(current_section.copy())
                current_section = {"text": line, "headings": [line], "section_path": [line]}
            else:
                current_section["text"] += f"\n{line}"

        if current_section["text"]:
            sections.append(current_section)

        return sections

    def _extract_court_sections(self, text: str) -> List[Dict[str, Any]]:
        """Extract sections from court opinions."""
        sections = []

        # Court opinion patterns
        court_patterns = [
            r'^I+\.\s+[A-Z]',            # I. SECTION
            r'^[A-Z]\.\s+[A-Z]',         # A. Subsection
            r'FACTUAL BACKGROUND',
            r'PROCEDURAL HISTORY',
            r'LEGAL STANDARD',
            r'DISCUSSION',
            r'CONCLUSION'
        ]

        current_section = {"text": "", "headings": [], "section_path": []}

        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue

            is_new_section = any(re.search(pattern, line, re.IGNORECASE) for pattern in court_patterns)

            if is_new_section and current_section["text"]:
                sections.append(current_section.copy())
                current_section = {"text": line, "headings": [line], "section_path": [line]}
            else:
                current_section["text"] += f"\n{line}"

        if current_section["text"]:
            sections.append(current_section)

        return sections

    def _extract_generic_sections(self, text: str) -> List[Dict[str, Any]]:
        """Generic paragraph-based sectioning."""
        paragraphs = text.split('\n\n')
        sections = []

        for i, para in enumerate(paragraphs):
            if para.strip():
                sections.append({
                    "text": para.strip(),
                    "headings": [],
                    "section_path": [f"Paragraph {i+1}"]
                })

        return sections

    def _chunk_section(self, section: Dict[str, Any], doc: DOC, start_ordinal: int) -> List[CHUNK]:
        """Chunk a single section into appropriately-sized pieces."""
        text = section["text"]
        chunks = []

        if len(text) <= self.max_chunk_size:
            # Section fits in one chunk
            chunk = CHUNK(
                doc_id=doc.doc_id,
                ordinal=start_ordinal,
                char_start=0,
                char_end=len(text),
                text=text,
                headings=section.get("headings", []),
                section_path=section.get("section_path", []),
                citations=self._extract_citations(text),
                authority_rank=self._calculate_authority_rank(doc)
            )
            chunks.append(chunk)
        else:
            # Split section into multiple chunks with overlap
            chunk_texts = self._split_text_with_overlap(text)

            for i, chunk_text in enumerate(chunk_texts):
                chunk = CHUNK(
                    doc_id=doc.doc_id,
                    ordinal=start_ordinal + i,
                    char_start=i * (self.max_chunk_size - self.overlap_size),
                    char_end=min((i + 1) * (self.max_chunk_size - self.overlap_size) + self.overlap_size, len(text)),
                    text=chunk_text,
                    headings=section.get("headings", []),
                    section_path=section.get("section_path", []),
                    citations=self._extract_citations(chunk_text),
                    authority_rank=self._calculate_authority_rank(doc)
                )
                chunks.append(chunk)

        return chunks

    def _split_text_with_overlap(self, text: str) -> List[str]:
        """Split text into overlapping chunks."""
        chunks = []
        start = 0

        while start < len(text):
            end = min(start + self.max_chunk_size, len(text))

            # Try to break at sentence boundaries
            if end < len(text):
                # Look for sentence ending near the target end
                for i in range(end - 100, end):
                    if i > start and text[i] in '.!?':
                        end = i + 1
                        break

            chunk_text = text[start:end].strip()
            if len(chunk_text) >= self.min_chunk_size or start == 0:
                chunks.append(chunk_text)

            start = end - self.overlap_size

        return chunks

    def _extract_citations(self, text: str) -> List[str]:
        """Extract legal citations from text."""
        citations = []

        # CFR citations
        cfr_pattern = r'\b\d+\s*CFR\s*\d+(?:\.\d+)*'
        citations.extend(re.findall(cfr_pattern, text, re.IGNORECASE))

        # USC citations
        usc_pattern = r'\b\d+\s*U\.?S\.?C\.?\s*§?\s*\d+'
        citations.extend(re.findall(usc_pattern, text, re.IGNORECASE))

        # Policy citations
        policy_patterns = [
            r'NCD\s*\d+(?:\.\d+)*',
            r'LCD\s*\d+(?:\.\d+)*',
            r'CPB\s*\d+(?:\.\d+)*',
            r'CG-\w+-\d+'
        ]

        for pattern in policy_patterns:
            citations.extend(re.findall(pattern, text, re.IGNORECASE))

        return list(set(citations))  # Remove duplicates

    def _calculate_authority_rank(self, doc: DOC) -> float:
        """Calculate authority ranking based on document type and source."""
        base_rank = doc.retrieval_priority

        # Adjust based on document characteristics
        if doc.doc_type == "law":
            return self.authority_ranking.federal_statute
        elif doc.doc_type == "reg":
            return self.authority_ranking.federal_regulation
        elif doc.jurisdiction == "medicare" and doc.doc_type == "manual":
            return self.authority_ranking.cms_manual
        elif "payer" in doc.category.lower():
            return self.authority_ranking.payer_policy
        elif doc.doc_type == "court_opinion":
            return self.authority_ranking.court_decision_erisa

        return base_rank

    def _enrich_chunk(self, chunk: CHUNK, doc: DOC) -> CHUNK:
        """Enrich chunk with additional metadata and topics."""
        # Extract topics from chunk text
        topics = self._extract_topics(chunk.text)

        # Combine with document-level tags
        all_topics = list(set(topics + doc.tags))

        # Update chunk with enriched data
        chunk.topics = all_topics

        return chunk

    def _extract_topics(self, text: str) -> List[str]:
        """Extract healthcare topics from text."""
        topics = []
        text_lower = text.lower()

        # Healthcare topic keywords
        topic_keywords = {
            'prior_authorization': ['prior authorization', 'preauthorization', 'pre-auth'],
            'medical_necessity': ['medical necessity', 'medically necessary', 'clinical necessity'],
            'appeals': ['appeal', 'grievance', 'external review', 'independent review'],
            'claims': ['claim', 'reimbursement', 'payment', 'billing'],
            'coverage': ['coverage', 'covered service', 'benefit'],
            'dme': ['durable medical equipment', 'prosthetic', 'orthotic'],
            'diagnostic': ['diagnostic', 'laboratory', 'pathology', 'radiology'],
            'emergency': ['emergency', 'urgent care', 'trauma'],
            'behavioral_health': ['mental health', 'behavioral health', 'substance abuse'],
            'pharmacy': ['prescription', 'drug', 'medication', 'pharmaceutical'],
            'balance_billing': ['balance billing', 'surprise billing', 'out-of-network']
        }

        for topic, keywords in topic_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                topics.append(topic)

        return topics