"""
State Department of Insurance (DOI) document parser.

Converts raw state DOI regulations and documents to normalized DOC format.
"""

import json
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from uuid import uuid4

from ..schemas import DOC, DocType, Jurisdiction


class StateDOIParser:
    """Parses state DOI regulations and documents into normalized DOC format."""

    def __init__(self):
        self.authority_rank = 0.87  # High authority for state regulations

    def parse_regulation(self, raw_data: Dict[str, Any], state_code: str) -> Optional[DOC]:
        """
        Parse a state DOI regulation into DOC format.

        Args:
            raw_data: Raw document data from state DOI fetcher
            state_code: Two-letter state code

        Returns:
            Normalized DOC object or None if parsing failed
        """
        try:
            # Extract document metadata
            title = raw_data.get('title', 'State Insurance Regulation')
            url = raw_data.get('url', '')
            text_content = raw_data.get('text', '')

            if not text_content.strip():
                return None

            # Extract regulation number/citation
            citation = self._extract_citation(text_content, state_code)

            # Extract effective dates
            effective_date = self._extract_effective_date(text_content)
            revised_date = self._extract_revised_date(text_content)

            # Extract topics and tags
            topics = self._extract_topics(text_content, title)

            # Determine document version
            version = self._extract_version(text_content) or "current"

            # Create DOC object
            doc = DOC(
                category=f"State DOI - {state_code}",
                title=self._clean_title(title),
                doc_type=DocType.REGULATION,
                jurisdiction=Jurisdiction.STATE,
                citation=citation,
                effective_date=effective_date,
                revised_date=revised_date,
                version=version,
                url=url,
                license="State public domain",
                text=self._clean_text(text_content),
                retrieval_priority=self._calculate_priority(state_code, text_content),
                tags=self._generate_tags(state_code, topics, title),
                metadata={
                    "state_code": state_code,
                    "document_type": "state_regulation",
                    "source_type": "state_doi",
                    "parsed_date": datetime.now(timezone.utc).isoformat(),
                    "topics": topics,
                    "regulation_type": self._classify_regulation_type(text_content, title)
                }
            )

            return doc

        except Exception as e:
            print(f"Error parsing state DOI regulation: {e}")
            return None

    def _extract_citation(self, text: str, state_code: str) -> str:
        """Extract regulation citation or number."""
        # Common state regulation citation patterns
        patterns = [
            # California style: Title 10, Section 2695.1
            r'(?:Title\s+\d+[,\s]+)?(?:Section\s+)?(\d+\.\d+(?:\.\d+)?)',
            # New York style: 11 NYCRR 52.1
            r'(\d+\s+[A-Z]+CRR?\s+\d+(?:\.\d+)?)',
            # Texas style: 28 TAC 21.1
            r'(\d+\s+TAC\s+\d+(?:\.\d+)?)',
            # Florida style: 69O-106.001
            r'(\d+[A-Z]-\d+\.\d+)',
            # General patterns
            r'(?:Rule|Regulation)\s+(?:No\.?\s*)?([A-Z]?\d+(?:[.-]\d+)*)',
            r'(?:Section|§)\s*([A-Z]?\d+(?:[.-]\d+)*)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return f"{state_code} {match.group(1)}"

        # Fallback to generic state citation
        return f"{state_code} DOI Regulation"

    def _extract_effective_date(self, text: str) -> Optional[datetime]:
        """Extract effective date from regulation text."""
        patterns = [
            r'effective\s+(?:date\s*:?\s*)?(\w+\s+\d{1,2},?\s+\d{4})',
            r'effective\s+(\d{1,2}/\d{1,2}/\d{4})',
            r'effective\s+(\d{1,2}-\d{1,2}-\d{4})',
            r'this\s+regulation\s+(?:becomes\s+)?effective\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'shall\s+become\s+effective\s+(\w+\s+\d{1,2},?\s+\d{4})'
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                try:
                    from dateutil import parser
                    return parser.parse(match.group(1))
                except:
                    continue

        return None

    def _extract_revised_date(self, text: str) -> Optional[datetime]:
        """Extract revision/amendment date."""
        patterns = [
            r'(?:revised|amended|updated)\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'(?:revised|amended|updated)\s+(\d{1,2}/\d{1,2}/\d{4})',
            r'last\s+(?:revised|amended|updated)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})',
            r'as\s+(?:revised|amended)\s+(\w+\s+\d{1,2},?\s+\d{4})'
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                try:
                    from dateutil import parser
                    return parser.parse(match.group(1))
                except:
                    continue

        return None

    def _extract_topics(self, text: str, title: str) -> List[str]:
        """Extract key topics from regulation content."""
        topics = []

        # Healthcare-specific topic keywords
        topic_keywords = {
            "claims_handling": [
                "claim", "claims processing", "claims handling", "claim payment",
                "claim denial", "claim investigation", "timely payment"
            ],
            "appeals_procedures": [
                "appeal", "appeals process", "grievance", "complaint",
                "external review", "independent review", "IRO"
            ],
            "network_adequacy": [
                "network", "provider network", "network adequacy", "access",
                "provider access", "geographic access", "appointment availability"
            ],
            "medical_necessity": [
                "medical necessity", "medically necessary", "medical appropriateness",
                "clinical criteria", "medical review"
            ],
            "surprise_billing": [
                "surprise billing", "balance billing", "out-of-network",
                "emergency services", "inadvertent out-of-network"
            ],
            "prior_authorization": [
                "prior authorization", "preauthorization", "pre-approval",
                "utilization review", "medical management"
            ],
            "coverage_determination": [
                "coverage", "covered services", "benefits", "exclusions",
                "coverage determination", "benefit determination"
            ],
            "unfair_practices": [
                "unfair practices", "bad faith", "unfair claim settlement",
                "prompt payment", "reasonable investigation"
            ]
        }

        text_lower = text.lower()
        title_lower = title.lower()

        for topic, keywords in topic_keywords.items():
            for keyword in keywords:
                if keyword.lower() in text_lower or keyword.lower() in title_lower:
                    topics.append(topic)
                    break  # Only add topic once

        return list(set(topics))  # Remove duplicates

    def _extract_version(self, text: str) -> Optional[str]:
        """Extract version information."""
        patterns = [
            r'version\s+(\d+(?:\.\d+)*)',
            r'revision\s+(\d+)',
            r'amendment\s+(?:no\.?\s*)?(\d+)',
            r'v\.?\s*(\d+(?:\.\d+)*)'
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)

        return None

    def _classify_regulation_type(self, text: str, title: str) -> str:
        """Classify the type of regulation."""
        text_lower = text.lower() + " " + title.lower()

        if any(term in text_lower for term in ["claim", "claims processing", "claim payment"]):
            return "claims_regulation"
        elif any(term in text_lower for term in ["appeal", "grievance", "external review"]):
            return "appeals_regulation"
        elif any(term in text_lower for term in ["network", "provider access", "adequacy"]):
            return "network_regulation"
        elif any(term in text_lower for term in ["surprise billing", "balance billing"]):
            return "billing_regulation"
        elif any(term in text_lower for term in ["license", "licensing", "certification"]):
            return "licensing_regulation"
        elif any(term in text_lower for term in ["solvency", "financial", "reserves"]):
            return "financial_regulation"
        else:
            return "general_regulation"

    def _calculate_priority(self, state_code: str, text: str) -> float:
        """Calculate retrieval priority based on state importance and content quality."""
        base_priority = self.authority_rank

        # State-specific adjustments
        state_bonuses = {
            "CA": 0.02,  # California has comprehensive healthcare regulations
            "NY": 0.02,  # New York has strong consumer protections
            "MA": 0.01,  # Massachusetts healthcare pioneer
            "WA": 0.01,  # Washington has good surprise billing laws
            "TX": 0.01,  # Large state with significant impact
            "FL": 0.01,  # Large state
        }

        priority = base_priority + state_bonuses.get(state_code, 0.0)

        # Content quality adjustments
        text_length = len(text)
        if text_length > 10000:  # Substantial regulation
            priority += 0.01
        if text_length > 25000:  # Very comprehensive
            priority += 0.01

        # Recent regulations get slight boost
        current_year = datetime.now().year
        if str(current_year) in text or str(current_year - 1) in text:
            priority += 0.005

        return min(priority, 0.90)  # Cap at 90%

    def _generate_tags(self, state_code: str, topics: List[str], title: str) -> List[str]:
        """Generate tags for the document."""
        tags = [
            "state_regulation",
            "doi_regulation",
            state_code.lower(),
            "insurance_regulation"
        ]

        # Add topic tags
        tags.extend(topics)

        # Add document-specific tags based on title
        title_lower = title.lower()
        if "appeal" in title_lower:
            tags.append("appeals")
        if "claim" in title_lower:
            tags.append("claims")
        if "network" in title_lower:
            tags.append("network")
        if "billing" in title_lower:
            tags.append("billing")
        if "emergency" in title_lower:
            tags.append("emergency_services")

        return list(set(tags))  # Remove duplicates

    def _clean_title(self, title: str) -> str:
        """Clean and standardize document title."""
        # Remove extra whitespace
        title = re.sub(r'\s+', ' ', title.strip())

        # Remove common prefixes/suffixes
        title = re.sub(r'^(?:Title\s+\d+[,\s]*)?(?:Section\s+\d+[,\s]*)?', '', title, flags=re.I)
        title = re.sub(r'\s*-\s*PDF\s*$', '', title, flags=re.I)

        return title

    def _clean_text(self, text: str) -> str:
        """Clean and normalize regulation text."""
        # Remove excessive whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text)

        # Remove page headers/footers that might interfere with content
        lines = text.split('\n')
        cleaned_lines = []

        for line in lines:
            line = line.strip()
            # Skip likely header/footer lines
            if (len(line) < 100 and
                any(marker in line.lower() for marker in ['page ', 'continued', 'footer', 'header'])):
                continue
            cleaned_lines.append(line)

        return '\n'.join(cleaned_lines).strip()

    def parse_multiple_regulations(self, raw_data_list: List[Dict[str, Any]],
                                 state_code: str) -> List[DOC]:
        """
        Parse multiple state regulations.

        Args:
            raw_data_list: List of raw regulation data
            state_code: State code

        Returns:
            List of parsed DOC objects
        """
        docs = []

        for raw_data in raw_data_list:
            doc = self.parse_regulation(raw_data, state_code)
            if doc:
                docs.append(doc)

        return docs