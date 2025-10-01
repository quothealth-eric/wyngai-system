"""
Appeals and legal decision parser.

Converts raw legal decisions, court opinions, and appeal decisions to normalized DOC format.
"""

import json
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from uuid import uuid4

from ..schemas import DOC, DocType, Jurisdiction


class AppealsParser:
    """Parses legal decisions and appeal outcomes into normalized DOC format."""

    def __init__(self):
        self.authority_rank = 0.72  # Moderate authority for legal precedents

    def parse_court_decision(self, raw_data: Dict[str, Any], source_code: str) -> Optional[DOC]:
        """
        Parse a court decision or legal opinion into DOC format.

        Args:
            raw_data: Raw document data from appeals fetcher
            source_code: Source identifier

        Returns:
            Normalized DOC object or None if parsing failed
        """
        try:
            # Extract document metadata
            title = raw_data.get('title', 'Legal Decision')
            url = raw_data.get('url', '')
            text_content = raw_data.get('text', '')

            if not text_content.strip():
                return None

            # Extract case information
            case_citation = self._extract_case_citation(text_content, title)
            court_name = self._extract_court_name(text_content, title)
            decision_date = self._extract_decision_date(text_content)
            case_number = self._extract_case_number(text_content, title)

            # Extract legal details
            legal_issues = self._extract_legal_issues(text_content)
            holding = self._extract_holding(text_content)
            topics = self._extract_topics(text_content, title)

            # Determine document type and jurisdiction
            doc_type, jurisdiction = self._classify_document(text_content, title, source_code)

            # Create DOC object
            doc = DOC(
                category=f"Legal Decision - {source_code}",
                title=self._clean_title(title),
                doc_type=doc_type,
                jurisdiction=jurisdiction,
                citation=case_citation or case_number or title,
                published_date=decision_date,
                version="final",
                url=url,
                license="Public domain",
                text=self._clean_text(text_content),
                retrieval_priority=self._calculate_priority(source_code, doc_type, text_content),
                tags=self._generate_tags(source_code, doc_type, topics, title),
                metadata={
                    "source_code": source_code,
                    "court_name": court_name,
                    "case_number": case_number,
                    "decision_date": decision_date.isoformat() if decision_date else None,
                    "source_type": "legal_decision",
                    "parsed_date": datetime.now(timezone.utc).isoformat(),
                    "topics": topics,
                    "legal_issues": legal_issues,
                    "holding": holding,
                    "document_classification": self._classify_decision_type(text_content, title)
                }
            )

            return doc

        except Exception as e:
            print(f"Error parsing legal decision: {e}")
            return None

    def parse_iro_decision(self, raw_data: Dict[str, Any]) -> Optional[DOC]:
        """
        Parse an Independent Review Organization (IRO) decision.

        Args:
            raw_data: Raw IRO decision data

        Returns:
            Normalized DOC object or None if parsing failed
        """
        try:
            # Extract document metadata
            title = raw_data.get('title', 'IRO Decision')
            url = raw_data.get('url', '')
            text_content = raw_data.get('text', '')

            if not text_content.strip():
                return None

            # Extract IRO-specific information
            case_number = self._extract_iro_case_number(text_content, title)
            decision_date = self._extract_decision_date(text_content)
            iro_name = self._extract_iro_name(text_content)

            # Extract medical details
            medical_condition = self._extract_medical_condition(text_content)
            treatment_requested = self._extract_treatment_requested(text_content)
            decision_outcome = self._extract_decision_outcome(text_content)
            topics = self._extract_iro_topics(text_content, title)

            citation = f"IRO {case_number}" if case_number else "IRO Decision"

            # Create DOC object
            doc = DOC(
                category="IRO Decision",
                title=self._clean_title(title),
                doc_type=DocType.APPEAL_DECISION,
                jurisdiction=Jurisdiction.PAYER,  # IROs operate in payer space
                citation=citation,
                published_date=decision_date,
                version="final",
                url=url,
                license="Public domain",
                text=self._clean_text(text_content),
                retrieval_priority=0.70,  # Standard IRO authority
                tags=self._generate_iro_tags(topics, decision_outcome),
                metadata={
                    "source_type": "iro_decision",
                    "iro_name": iro_name,
                    "case_number": case_number,
                    "decision_date": decision_date.isoformat() if decision_date else None,
                    "parsed_date": datetime.now(timezone.utc).isoformat(),
                    "medical_condition": medical_condition,
                    "treatment_requested": treatment_requested,
                    "decision_outcome": decision_outcome,
                    "topics": topics
                }
            )

            return doc

        except Exception as e:
            print(f"Error parsing IRO decision: {e}")
            return None

    def _extract_case_citation(self, text: str, title: str) -> Optional[str]:
        """Extract legal citation from case text."""
        # Look in title first
        title_patterns = [
            r'(\d+\s+F\.\s*(?:2d|3d|Supp\.?)\s*\d+)',  # Federal reporters
            r'(\d+\s+[A-Z][a-z]*\.?\s*(?:2d|3d)?\s*\d+)',  # State reporters
            r'(\d{4}\s+WL\s+\d+)',  # Westlaw citations
            r'(\d{4}\s+U\.S\.\s+LEXIS\s+\d+)',  # Lexis citations
        ]

        for pattern in title_patterns:
            match = re.search(pattern, title, re.I)
            if match:
                return match.group(1)

        # Look in text
        for pattern in title_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)

        return None

    def _extract_court_name(self, text: str, title: str) -> Optional[str]:
        """Extract court name from decision."""
        # Common court name patterns
        court_patterns = [
            r'(?:United States\s+)?(?:Court\s+of\s+Appeals?|Appeals?\s+Court)(?:\s+for\s+the\s+[^,\n]+)?',
            r'(?:United States\s+)?District\s+Court(?:\s+for\s+the\s+[^,\n]+)?',
            r'(?:United States\s+)?Supreme\s+Court',
            r'[A-Z][a-z]+\s+(?:Supreme\s+)?Court(?:\s+of\s+Appeals?)?',
            r'Court\s+of\s+Appeals?\s+of\s+[^,\n]+',
        ]

        # Check title first
        for pattern in court_patterns:
            match = re.search(pattern, title, re.I)
            if match:
                return match.group(0).strip()

        # Check beginning of text
        text_start = text[:1000]  # First 1000 characters
        for pattern in court_patterns:
            match = re.search(pattern, text_start, re.I)
            if match:
                return match.group(0).strip()

        return None

    def _extract_decision_date(self, text: str) -> Optional[datetime]:
        """Extract decision date from text."""
        date_patterns = [
            r'decided\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'filed\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'opinion\s+filed\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'dated\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'date\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})',
            r'(\w+\s+\d{1,2},?\s+\d{4})',  # General date pattern
        ]

        for pattern in date_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                date_str = match.group(1)
                try:
                    from dateutil import parser
                    parsed_date = parser.parse(date_str)
                    # Only accept dates that seem reasonable (not future, not too old)
                    if (datetime(1980, 1, 1) <= parsed_date.replace(tzinfo=None) <=
                        datetime.now() + timedelta(days=30)):
                        return parsed_date
                except:
                    continue

        return None

    def _extract_case_number(self, text: str, title: str) -> Optional[str]:
        """Extract case number or docket number."""
        # Look in title first
        title_patterns = [
            r'(?:No|Case|Docket)\.?\s*([A-Z]?\d+(?:-\d+)*(?:\([A-Z]\))?)',
            r'(\d{2}-\d+)',  # e.g., 21-1234
            r'(\d{4}-\d+)',  # e.g., 2021-1234
        ]

        for pattern in title_patterns:
            match = re.search(pattern, title, re.I)
            if match:
                return match.group(1)

        # Look in beginning of text
        text_start = text[:500]
        for pattern in title_patterns:
            match = re.search(pattern, text_start, re.I)
            if match:
                return match.group(1)

        return None

    def _extract_legal_issues(self, text: str) -> List[str]:
        """Extract key legal issues from decision."""
        issues = []

        # Look for issue headings
        issue_patterns = [
            r'(?:ISSUES?|QUESTIONS? PRESENTED?)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
            r'(?:LEGAL ISSUES?)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
            r'(?:HOLDINGS?)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
        ]

        for pattern in issue_patterns:
            matches = re.finditer(pattern, text, re.I | re.DOTALL)
            for match in matches:
                issue_text = match.group(1).strip()
                if len(issue_text) > 20:
                    issues.append(issue_text[:300])  # Limit length

        return issues[:3]  # Limit to 3 issues

    def _extract_holding(self, text: str) -> Optional[str]:
        """Extract the court's holding or decision."""
        holding_patterns = [
            r'(?:WE HOLD|HELD)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
            r'(?:CONCLUSION|DECISION)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
            r'(?:HOLDING)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
            r'(?:IT IS ORDERED|ORDERED)[:\s]+(.*?)(?:\n\n|\n[A-Z]{2,})',
        ]

        for pattern in holding_patterns:
            match = re.search(pattern, text, re.I | re.DOTALL)
            if match:
                holding_text = match.group(1).strip()
                if len(holding_text) > 20:
                    return holding_text[:500]  # Limit length

        return None

    def _extract_topics(self, text: str, title: str) -> List[str]:
        """Extract key topics from legal decision."""
        topics = []

        # Healthcare legal topic keywords
        topic_keywords = {
            "erisa": ["ERISA", "Employee Retirement Income Security Act", "fiduciary duty"],
            "medical_necessity": ["medical necessity", "medically necessary", "medical appropriateness"],
            "coverage_denial": ["coverage denial", "benefit denial", "claim denial"],
            "external_review": ["external review", "independent review", "IRO"],
            "surprise_billing": ["surprise billing", "balance billing", "out-of-network"],
            "emergency_services": ["emergency services", "emergency room", "urgent care"],
            "network_adequacy": ["network adequacy", "provider access", "geographic access"],
            "appeals_process": ["appeals process", "grievance", "complaint procedures"],
            "bad_faith": ["bad faith", "unfair practices", "unreasonable denial"],
            "prior_authorization": ["prior authorization", "preauthorization", "precertification"],
            "administrative_exhaustion": ["administrative exhaustion", "exhaust remedies"],
            "class_action": ["class action", "class certification"],
            "damages": ["damages", "monetary relief", "compensation"],
            "preemption": ["preemption", "federal preemption", "state law preempted"]
        }

        text_lower = text.lower()
        title_lower = title.lower()

        for topic, keywords in topic_keywords.items():
            for keyword in keywords:
                if keyword.lower() in text_lower or keyword.lower() in title_lower:
                    topics.append(topic)
                    break

        return list(set(topics))

    def _extract_iro_case_number(self, text: str, title: str) -> Optional[str]:
        """Extract IRO case number."""
        patterns = [
            r'(?:IRO|Case|Reference)\.?\s*(?:No\.?\s*)?([A-Z]?\d+(?:-\d+)*)',
            r'Request\s+(?:No\.?\s*)?([A-Z]?\d+(?:-\d+)*)',
            r'Appeal\s+(?:No\.?\s*)?([A-Z]?\d+(?:-\d+)*)',
        ]

        # Check title first
        for pattern in patterns:
            match = re.search(pattern, title, re.I)
            if match:
                return match.group(1)

        # Check text
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)

        return None

    def _extract_iro_name(self, text: str) -> Optional[str]:
        """Extract IRO organization name."""
        patterns = [
            r'Independent\s+Review\s+Organization[:\s]*([^,\n]+)',
            r'IRO[:\s]*([^,\n]+)',
            r'External\s+Review[:\s]*([^,\n]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1).strip()

        return None

    def _extract_medical_condition(self, text: str) -> Optional[str]:
        """Extract medical condition from IRO decision."""
        patterns = [
            r'diagnosis[:\s]*([^,\n]+)',
            r'medical\s+condition[:\s]*([^,\n]+)',
            r'condition[:\s]*([^,\n]+)',
            r'treatment\s+for[:\s]*([^,\n]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                condition = match.group(1).strip()
                if len(condition) > 5:  # Avoid very short matches
                    return condition[:100]  # Limit length

        return None

    def _extract_treatment_requested(self, text: str) -> Optional[str]:
        """Extract requested treatment from IRO decision."""
        patterns = [
            r'requested\s+treatment[:\s]*([^,\n]+)',
            r'treatment\s+requested[:\s]*([^,\n]+)',
            r'proposed\s+treatment[:\s]*([^,\n]+)',
            r'service\s+requested[:\s]*([^,\n]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                treatment = match.group(1).strip()
                if len(treatment) > 5:
                    return treatment[:200]

        return None

    def _extract_decision_outcome(self, text: str) -> str:
        """Extract IRO decision outcome."""
        text_lower = text.lower()

        if any(phrase in text_lower for phrase in ["upheld", "affirmed", "denied"]):
            return "denied"
        elif any(phrase in text_lower for phrase in ["overturned", "reversed", "approved"]):
            return "approved"
        elif any(phrase in text_lower for phrase in ["remanded", "returned"]):
            return "remanded"
        else:
            return "unclear"

    def _extract_iro_topics(self, text: str, title: str) -> List[str]:
        """Extract topics specific to IRO decisions."""
        topics = []

        # IRO-specific keywords
        iro_keywords = {
            "experimental_treatment": ["experimental", "investigational", "clinical trial"],
            "medical_necessity": ["medical necessity", "medically necessary"],
            "prior_authorization": ["prior authorization", "preauthorization"],
            "coverage_determination": ["coverage", "covered service", "benefit"],
            "external_review": ["external review", "independent review"],
            "emergency_treatment": ["emergency", "urgent", "life-threatening"],
            "specialist_referral": ["specialist", "referral", "consultation"],
            "diagnostic_testing": ["diagnostic", "testing", "imaging", "scan"],
            "surgical_procedure": ["surgery", "surgical", "procedure", "operation"],
            "prescription_drug": ["prescription", "drug", "medication", "pharmaceutical"]
        }

        text_lower = text.lower()
        title_lower = title.lower()

        for topic, keywords in iro_keywords.items():
            for keyword in keywords:
                if keyword in text_lower or keyword in title_lower:
                    topics.append(topic)
                    break

        return list(set(topics))

    def _classify_document(self, text: str, title: str, source_code: str) -> tuple:
        """Classify document type and jurisdiction."""
        text_lower = text.lower()
        title_lower = title.lower()

        # Determine document type
        if source_code == "IRO_DECISIONS" or "iro" in title_lower:
            doc_type = DocType.APPEAL_DECISION
        elif any(term in text_lower for term in ["appeal", "external review"]):
            doc_type = DocType.APPEAL_DECISION
        else:
            doc_type = DocType.COURT_OPINION

        # Determine jurisdiction
        if any(term in text_lower for term in ["federal", "united states", "u.s."]):
            jurisdiction = Jurisdiction.FEDERAL
        elif source_code.startswith("STATE_"):
            jurisdiction = Jurisdiction.STATE
        else:
            jurisdiction = Jurisdiction.FEDERAL  # Default

        return doc_type, jurisdiction

    def _classify_decision_type(self, text: str, title: str) -> str:
        """Classify the type of legal decision."""
        text_lower = text.lower() + " " + title.lower()

        if "iro" in text_lower or "external review" in text_lower:
            return "iro_decision"
        elif "erisa" in text_lower:
            return "erisa_case"
        elif "class action" in text_lower:
            return "class_action"
        elif "summary judgment" in text_lower:
            return "summary_judgment"
        elif "appeal" in text_lower:
            return "appellate_decision"
        else:
            return "general_decision"

    def _calculate_priority(self, source_code: str, doc_type: DocType, text: str) -> float:
        """Calculate retrieval priority based on source and content."""
        base_priority = self.authority_rank

        # Source-specific adjustments
        source_bonuses = {
            "COURTLISTENER": 0.02,  # Federal court decisions
            "CMS_APPEALS": 0.03,    # Administrative decisions
            "JUSTIA": 0.01,         # Legal database
            "IRO_DECISIONS": 0.01,  # External review decisions
        }

        priority = base_priority + source_bonuses.get(source_code, 0.0)

        # Document type adjustments
        if doc_type == DocType.COURT_OPINION:
            priority += 0.01
        elif doc_type == DocType.APPEAL_DECISION:
            priority += 0.005

        # Content quality indicators
        if len(text) > 5000:  # Substantial decision
            priority += 0.005

        # ERISA cases get slight boost for healthcare relevance
        if "erisa" in text.lower():
            priority += 0.01

        return min(priority, 0.75)  # Cap at 75%

    def _generate_tags(self, source_code: str, doc_type: DocType,
                     topics: List[str], title: str) -> List[str]:
        """Generate tags for legal decision."""
        tags = [
            "legal_decision",
            "appeal_precedent",
            source_code.lower()
        ]

        if doc_type == DocType.COURT_OPINION:
            tags.append("court_opinion")
        elif doc_type == DocType.APPEAL_DECISION:
            tags.append("appeal_decision")

        # Add topic tags
        tags.extend(topics)

        # Add title-based tags
        title_lower = title.lower()
        if "erisa" in title_lower:
            tags.append("erisa")
        if "insurance" in title_lower:
            tags.append("insurance_law")
        if "healthcare" in title_lower or "health" in title_lower:
            tags.append("healthcare_law")

        return list(set(tags))

    def _generate_iro_tags(self, topics: List[str], outcome: str) -> List[str]:
        """Generate tags for IRO decisions."""
        tags = [
            "iro_decision",
            "external_review",
            "appeal_decision",
            f"outcome_{outcome}"
        ]

        tags.extend(topics)
        return list(set(tags))

    def _clean_title(self, title: str) -> str:
        """Clean and standardize title."""
        # Remove extra whitespace
        title = re.sub(r'\s+', ' ', title.strip())

        # Remove common prefixes
        title = re.sub(r'^(?:Case\s+)?(?:No\.?\s*\d+[:-]\s*)?', '', title, flags=re.I)

        return title

    def _clean_text(self, text: str) -> str:
        """Clean and normalize legal text."""
        # Remove excessive whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text)

        # Remove page numbers and headers
        lines = text.split('\n')
        cleaned_lines = []

        for line in lines:
            line = line.strip()
            # Skip likely page headers/footers
            if (len(line) < 60 and
                any(marker in line.lower() for marker in [
                    'page ', 'case ', 'no. ', 'westlaw', 'lexis'
                ]) and
                not any(content in line.lower() for content in [
                    'appeal', 'court', 'decision', 'holding'
                ])):
                continue
            cleaned_lines.append(line)

        return '\n'.join(cleaned_lines).strip()

    def parse_multiple_decisions(self, raw_data_list: List[Dict[str, Any]],
                               source_code: str) -> List[DOC]:
        """
        Parse multiple legal decisions.

        Args:
            raw_data_list: List of raw decision data
            source_code: Source identifier

        Returns:
            List of parsed DOC objects
        """
        docs = []

        for raw_data in raw_data_list:
            if source_code == "IRO_DECISIONS":
                doc = self.parse_iro_decision(raw_data)
            else:
                doc = self.parse_court_decision(raw_data, source_code)

            if doc:
                docs.append(doc)

        return docs