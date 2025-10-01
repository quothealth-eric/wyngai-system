"""
Payer policy document parser.

Converts raw insurance company policies and coverage guidelines to normalized DOC format.
"""

import json
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from uuid import uuid4

from ..schemas import DOC, DocType, Jurisdiction


class PayerPolicyParser:
    """Parses insurance payer policies and guidelines into normalized DOC format."""

    def __init__(self):
        self.authority_rank = 0.78  # Moderate-high authority for payer policies

    def parse_policy(self, raw_data: Dict[str, Any], payer_code: str,
                   policy_type: str) -> Optional[DOC]:
        """
        Parse a payer policy document into DOC format.

        Args:
            raw_data: Raw document data from payer policy fetcher
            payer_code: Payer identifier (e.g., 'AETNA', 'UHC')
            policy_type: Type of policy (medical, appeals, pharmacy, etc.)

        Returns:
            Normalized DOC object or None if parsing failed
        """
        try:
            # Extract document metadata
            title = raw_data.get('title', 'Insurance Policy')
            url = raw_data.get('url', '')
            text_content = raw_data.get('text', '')

            if not text_content.strip():
                return None

            # Extract policy information
            policy_number = self._extract_policy_number(text_content, title)
            citation = self._build_citation(payer_code, policy_number, policy_type)

            # Extract dates
            effective_date = self._extract_effective_date(text_content)
            revised_date = self._extract_revised_date(text_content)

            # Extract policy details
            coverage_determination = self._extract_coverage_determination(text_content)
            medical_criteria = self._extract_medical_criteria(text_content)
            topics = self._extract_topics(text_content, title, policy_type)

            # Determine version
            version = self._extract_version(text_content) or "current"

            # Create DOC object
            doc = DOC(
                category=f"Payer Policy - {payer_code}",
                title=self._clean_title(title, payer_code),
                doc_type=DocType.PAYER_POLICY,
                jurisdiction=Jurisdiction.PAYER,
                citation=citation,
                effective_date=effective_date,
                revised_date=revised_date,
                version=version,
                url=url,
                license="Proprietary - fair use for training",
                text=self._clean_text(text_content),
                retrieval_priority=self._calculate_priority(payer_code, policy_type, text_content),
                tags=self._generate_tags(payer_code, policy_type, topics, title),
                metadata={
                    "payer_code": payer_code,
                    "policy_type": policy_type,
                    "policy_number": policy_number,
                    "source_type": "payer_policy",
                    "parsed_date": datetime.now(timezone.utc).isoformat(),
                    "topics": topics,
                    "coverage_determination": coverage_determination,
                    "medical_criteria": medical_criteria,
                    "policy_category": self._classify_policy_category(text_content, title, policy_type)
                }
            )

            return doc

        except Exception as e:
            print(f"Error parsing payer policy: {e}")
            return None

    def _extract_policy_number(self, text: str, title: str) -> Optional[str]:
        """Extract policy number or identifier."""
        # Look in title first
        title_patterns = [
            r'(?:Policy|Guideline|Bulletin)\s+(?:No\.?\s*)?([A-Z]?\d+(?:[.-]\d+)*)',
            r'([A-Z]{2,4}[.-]\d+(?:[.-]\d+)*)',  # e.g., CPB-123.45
            r'(\d+\.\d+(?:\.\d+)*)',  # e.g., 123.45.67
        ]

        for pattern in title_patterns:
            match = re.search(pattern, title, re.I)
            if match:
                return match.group(1)

        # Look in document text
        text_patterns = [
            r'policy\s+(?:number|no\.?|#)\s*:?\s*([A-Z]?\d+(?:[.-]\d+)*)',
            r'bulletin\s+(?:number|no\.?|#)\s*:?\s*([A-Z]?\d+(?:[.-]\d+)*)',
            r'guideline\s+(?:number|no\.?|#)\s*:?\s*([A-Z]?\d+(?:[.-]\d+)*)',
            r'document\s+(?:number|no\.?|#)\s*:?\s*([A-Z]?\d+(?:[.-]\d+)*)',
        ]

        for pattern in text_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)

        return None

    def _build_citation(self, payer_code: str, policy_number: Optional[str],
                      policy_type: str) -> str:
        """Build standardized citation."""
        if policy_number:
            return f"{payer_code} Policy {policy_number}"
        else:
            return f"{payer_code} {policy_type.title()} Policy"

    def _extract_effective_date(self, text: str) -> Optional[datetime]:
        """Extract effective date from policy text."""
        patterns = [
            r'effective\s+(?:date\s*:?\s*)?(\w+\s+\d{1,2},?\s+\d{4})',
            r'effective\s+(\d{1,2}/\d{1,2}/\d{4})',
            r'effective\s+(\d{1,2}-\d{1,2}-\d{4})',
            r'this\s+policy\s+(?:becomes\s+)?effective\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'coverage\s+effective\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'policy\s+effective\s+(\w+\s+\d{1,2},?\s+\d{4})'
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
        """Extract revision date."""
        patterns = [
            r'(?:revised|updated|modified)\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'(?:revised|updated|modified)\s+(\d{1,2}/\d{1,2}/\d{4})',
            r'last\s+(?:revised|updated|modified)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})',
            r'revision\s+date\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})',
            r'policy\s+(?:revised|updated)\s+(\w+\s+\d{1,2},?\s+\d{4})'
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

    def _extract_coverage_determination(self, text: str) -> str:
        """Extract coverage determination (covered, not covered, etc.)."""
        text_lower = text.lower()

        # Look for explicit coverage statements
        if re.search(r'(?:is\s+)?not\s+(?:a\s+)?covered\s+(?:service|benefit)', text_lower):
            return "not_covered"
        elif re.search(r'(?:is\s+)?(?:a\s+)?covered\s+(?:service|benefit)', text_lower):
            return "covered"
        elif re.search(r'coverage\s+(?:is\s+)?(?:available|provided)', text_lower):
            return "covered"
        elif re.search(r'experimental|investigational', text_lower):
            return "experimental"
        elif re.search(r'medical(?:ly)?\s+necessary', text_lower):
            return "medical_necessity_required"
        elif re.search(r'prior\s+authorization\s+required', text_lower):
            return "prior_auth_required"
        else:
            return "varies"

    def _extract_medical_criteria(self, text: str) -> List[str]:
        """Extract medical criteria or requirements."""
        criteria = []

        # Look for criteria sections
        criteria_patterns = [
            r'medical\s+criteria[:\s]+(.*?)(?:\n\n|\n[A-Z])',
            r'clinical\s+criteria[:\s]+(.*?)(?:\n\n|\n[A-Z])',
            r'coverage\s+criteria[:\s]+(.*?)(?:\n\n|\n[A-Z])',
            r'requirements[:\s]+(.*?)(?:\n\n|\n[A-Z])',
        ]

        for pattern in criteria_patterns:
            matches = re.finditer(pattern, text, re.I | re.DOTALL)
            for match in matches:
                criteria_text = match.group(1).strip()
                if len(criteria_text) > 20:  # Skip very short matches
                    criteria.append(criteria_text[:200])  # Limit length

        return criteria[:5]  # Limit to 5 criteria

    def _extract_topics(self, text: str, title: str, policy_type: str) -> List[str]:
        """Extract key topics from policy content."""
        topics = []

        # Healthcare-specific topic keywords
        topic_keywords = {
            "medical_necessity": [
                "medical necessity", "medically necessary", "medical appropriateness",
                "clinical necessity", "medical justification"
            ],
            "prior_authorization": [
                "prior authorization", "preauthorization", "pre-approval",
                "utilization review", "medical management", "precertification"
            ],
            "experimental_treatment": [
                "experimental", "investigational", "clinical trial",
                "not FDA approved", "off-label use"
            ],
            "coverage_determination": [
                "coverage", "covered services", "benefits", "exclusions",
                "coverage determination", "benefit determination"
            ],
            "appeals_process": [
                "appeal", "appeals process", "grievance", "complaint",
                "external review", "independent review"
            ],
            "pharmacy_benefits": [
                "formulary", "prescription", "drug coverage", "pharmacy",
                "medication", "pharmaceutical"
            ],
            "diagnostic_procedures": [
                "diagnostic", "imaging", "laboratory", "test", "screening",
                "MRI", "CT scan", "ultrasound", "X-ray"
            ],
            "surgical_procedures": [
                "surgery", "surgical", "procedure", "operation",
                "minimally invasive", "robotic surgery"
            ],
            "mental_health": [
                "mental health", "behavioral health", "psychiatric",
                "psychology", "counseling", "therapy"
            ],
            "preventive_care": [
                "preventive", "preventative", "screening", "wellness",
                "routine care", "annual exam"
            ]
        }

        text_lower = text.lower()
        title_lower = title.lower()

        for topic, keywords in topic_keywords.items():
            for keyword in keywords:
                if keyword.lower() in text_lower or keyword.lower() in title_lower:
                    topics.append(topic)
                    break  # Only add topic once

        # Add policy type as topic
        topics.append(f"{policy_type}_policy")

        return list(set(topics))  # Remove duplicates

    def _extract_version(self, text: str) -> Optional[str]:
        """Extract version information."""
        patterns = [
            r'version\s+(\d+(?:\.\d+)*)',
            r'revision\s+(\d+)',
            r'v\.?\s*(\d+(?:\.\d+)*)',
            r'policy\s+version\s+(\d+(?:\.\d+)*)'
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)

        return None

    def _classify_policy_category(self, text: str, title: str, policy_type: str) -> str:
        """Classify the policy into categories."""
        text_lower = text.lower() + " " + title.lower()

        if policy_type == "medical":
            if any(term in text_lower for term in ["experimental", "investigational"]):
                return "experimental_procedures"
            elif any(term in text_lower for term in ["surgery", "surgical", "procedure"]):
                return "surgical_procedures"
            elif any(term in text_lower for term in ["diagnostic", "imaging", "laboratory"]):
                return "diagnostic_procedures"
            elif any(term in text_lower for term in ["mental health", "behavioral", "psychiatric"]):
                return "mental_health"
            elif any(term in text_lower for term in ["preventive", "screening", "wellness"]):
                return "preventive_care"
            else:
                return "general_medical"
        elif policy_type == "appeals":
            return "appeals_procedures"
        elif policy_type == "pharmacy":
            return "pharmacy_benefits"
        elif policy_type == "prior_auth":
            return "prior_authorization"
        else:
            return "general_policy"

    def _calculate_priority(self, payer_code: str, policy_type: str, text: str) -> float:
        """Calculate retrieval priority based on payer importance and content."""
        base_priority = self.authority_rank

        # Payer-specific adjustments (based on market share and influence)
        payer_bonuses = {
            "UHC": 0.02,    # Largest US health insurer
            "ANTHEM": 0.015, # Large Blue Cross plan
            "AETNA": 0.015,  # Major national insurer
            "CIGNA": 0.01,   # Large national insurer
            "HUMANA": 0.01,  # Major in Medicare Advantage
            "BCBS": 0.02,    # Large federation
            "KAISER": 0.01,  # Major HMO
        }

        priority = base_priority + payer_bonuses.get(payer_code, 0.0)

        # Policy type adjustments
        type_bonuses = {
            "medical": 0.01,     # Medical policies are most important
            "appeals": 0.01,     # Appeals procedures are critical
            "prior_auth": 0.005, # Prior auth policies important
            "pharmacy": 0.005,   # Pharmacy policies relevant
        }

        priority += type_bonuses.get(policy_type, 0.0)

        # Content quality adjustments
        text_length = len(text)
        if text_length > 5000:  # Comprehensive policy
            priority += 0.005
        if text_length > 15000:  # Very detailed policy
            priority += 0.005

        # Recent policies get slight boost
        current_year = datetime.now().year
        if str(current_year) in text or str(current_year - 1) in text:
            priority += 0.005

        return min(priority, 0.80)  # Cap at 80%

    def _generate_tags(self, payer_code: str, policy_type: str,
                     topics: List[str], title: str) -> List[str]:
        """Generate tags for the document."""
        tags = [
            "payer_policy",
            "insurance_policy",
            payer_code.lower(),
            f"{policy_type}_policy"
        ]

        # Add topic tags
        tags.extend(topics)

        # Add title-based tags
        title_lower = title.lower()
        if "clinical" in title_lower:
            tags.append("clinical_policy")
        if "coverage" in title_lower:
            tags.append("coverage_policy")
        if "bulletin" in title_lower:
            tags.append("policy_bulletin")
        if "guideline" in title_lower:
            tags.append("clinical_guideline")

        return list(set(tags))  # Remove duplicates

    def _clean_title(self, title: str, payer_code: str) -> str:
        """Clean and standardize policy title."""
        # Remove extra whitespace
        title = re.sub(r'\s+', ' ', title.strip())

        # Remove common prefixes/suffixes
        title = re.sub(r'^(?:Policy|Guideline|Bulletin)\s*(?:No\.?\s*\d+[.-]?\d*)?[:\s]*', '', title, flags=re.I)
        title = re.sub(r'\s*-\s*PDF\s*$', '', title, flags=re.I)
        title = re.sub(rf'^{payer_code}\s*[:\s]*', '', title, flags=re.I)

        return title

    def _clean_text(self, text: str) -> str:
        """Clean and normalize policy text."""
        # Remove excessive whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text)

        # Remove common footer/header elements
        lines = text.split('\n')
        cleaned_lines = []

        for line in lines:
            line = line.strip()
            # Skip likely header/footer lines
            if (len(line) < 80 and
                any(marker in line.lower() for marker in [
                    'proprietary', 'confidential', 'page ', 'copyright',
                    'all rights reserved', 'internal use only'
                ])):
                continue
            cleaned_lines.append(line)

        return '\n'.join(cleaned_lines).strip()

    def parse_multiple_policies(self, raw_data_list: List[Dict[str, Any]],
                              payer_code: str, policy_type: str) -> List[DOC]:
        """
        Parse multiple payer policies.

        Args:
            raw_data_list: List of raw policy data
            payer_code: Payer identifier
            policy_type: Type of policies

        Returns:
            List of parsed DOC objects
        """
        docs = []

        for raw_data in raw_data_list:
            doc = self.parse_policy(raw_data, payer_code, policy_type)
            if doc:
                docs.append(doc)

        return docs