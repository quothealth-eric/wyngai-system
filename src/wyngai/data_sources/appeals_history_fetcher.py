"""
Appeals history and legal docket fetcher.

Fetches appeal decisions, court opinions, and docket entries from:
- State docket systems for insurance claim appeals
- Public appeal decision repositories
- ERISA court decisions
- Administrative law judge decisions
- External review organization decisions
"""

import json
import re
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
import requests
from bs4 import BeautifulSoup
import PyPDF2
from urllib.parse import urljoin, urlparse, quote_plus
import logging

from ..schemas import DOC, DocType, Jurisdiction
from ..utils.config import config

logger = logging.getLogger(__name__)


class AppealsHistoryFetcher:
    """Fetches appeal decisions and legal precedents from various court and administrative systems."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'WyngAI/1.0 (Healthcare Training Data Pipeline)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        })

        # Conservative rate limiting for legal sites
        self.request_delay = 4.0  # 4 seconds between requests
        self.last_request_time = 0

    def _rate_limit(self):
        """Enforce rate limiting between requests."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.request_delay:
            time.sleep(self.request_delay - time_since_last)
        self.last_request_time = time.time()

    def get_appeal_sources(self) -> Dict[str, Dict[str, Any]]:
        """
        Get comprehensive list of appeal decision and legal precedent sources.

        Returns:
            Dictionary mapping source codes to source information
        """
        return {
            "COURTLISTENER": {
                "name": "CourtListener Federal Courts",
                "base_url": "https://www.courtlistener.com",
                "search_url": "https://www.courtlistener.com/api/rest/v3/search/",
                "api_required": True,
                "coverage": "Federal court decisions including ERISA cases",
                "key_topics": [
                    "ERISA", "healthcare appeals", "insurance disputes", "benefit denials",
                    "medical necessity", "external review", "fiduciary duty"
                ],
                "authority_rank": 0.72,
                "doc_formats": ["PDF", "HTML", "JSON"],
                "search_terms": ["ERISA", "health insurance", "medical necessity", "appeal", "denial"]
            },
            "JUSTIA": {
                "name": "Justia Legal Opinions",
                "base_url": "https://law.justia.com",
                "search_url": "https://law.justia.com/cases/search/",
                "coverage": "Federal and state court opinions on healthcare matters",
                "key_topics": [
                    "healthcare law", "insurance law", "ERISA appeals", "state insurance appeals",
                    "medical malpractice", "coverage disputes", "regulatory compliance"
                ],
                "authority_rank": 0.70,
                "doc_formats": ["HTML"],
                "search_terms": ["health insurance appeal", "ERISA", "coverage denial", "medical necessity"]
            },
            "GOOGLE_SCHOLAR": {
                "name": "Google Scholar Legal Opinions",
                "base_url": "https://scholar.google.com",
                "search_url": "https://scholar.google.com/scholar_case",
                "coverage": "Comprehensive legal case database",
                "key_topics": [
                    "insurance law", "healthcare appeals", "ERISA", "administrative law",
                    "medical necessity", "coverage determination", "external review"
                ],
                "authority_rank": 0.73,
                "doc_formats": ["HTML", "PDF"],
                "search_terms": ["health insurance appeal", "medical necessity", "ERISA appeal", "coverage denial"]
            },
            "STATE_COURTS_CA": {
                "name": "California Courts Case Search",
                "base_url": "https://www.courts.ca.gov",
                "search_url": "https://appellatecases.courtinfo.ca.gov/search/searchResults.cfm",
                "coverage": "California appellate court decisions",
                "jurisdiction": "CA",
                "key_topics": [
                    "insurance appeals", "healthcare coverage", "HMO appeals", "Knox-Keene Act",
                    "California insurance code", "medical necessity", "external review"
                ],
                "authority_rank": 0.71,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["insurance appeal", "medical necessity", "HMO", "Knox-Keene"]
            },
            "STATE_COURTS_NY": {
                "name": "New York Courts Electronic Filing",
                "base_url": "https://iapps.courts.state.ny.us",
                "search_url": "https://iapps.courts.state.ny.us/nyscef/CaseSearch",
                "coverage": "New York state court decisions on insurance matters",
                "jurisdiction": "NY",
                "key_topics": [
                    "insurance appeals", "external appeals", "healthcare coverage",
                    "New York insurance law", "medical necessity", "surprise billing"
                ],
                "authority_rank": 0.71,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["insurance appeal", "external appeal", "healthcare coverage", "medical necessity"]
            },
            "STATE_COURTS_TX": {
                "name": "Texas Courts Online",
                "base_url": "https://www.txcourts.gov",
                "search_url": "https://search.txcourts.gov/CaseSearch.aspx",
                "coverage": "Texas court decisions including insurance appeals",
                "jurisdiction": "TX",
                "key_topics": [
                    "Texas insurance code", "HMO appeals", "medical necessity",
                    "external review", "healthcare coverage", "insurance appeals"
                ],
                "authority_rank": 0.70,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["insurance appeal", "HMO", "medical necessity", "external review"]
            },
            "IRO_DECISIONS": {
                "name": "Independent Review Organization Decisions",
                "base_url": "https://www.dfs.ny.gov",
                "search_url": "https://www.dfs.ny.gov/consumers/health_insurance/external_appeal_decisions",
                "coverage": "External review decisions from Independent Review Organizations",
                "key_topics": [
                    "external review", "IRO decisions", "medical necessity",
                    "experimental treatment", "coverage determination", "appeal outcomes"
                ],
                "authority_rank": 0.68,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["external review", "IRO", "medical necessity", "experimental"]
            },
            "CMS_APPEALS": {
                "name": "CMS Medicare Appeals Decisions",
                "base_url": "https://www.cms.gov",
                "search_url": "https://www.cms.gov/medicare/appeals-and-grievances",
                "coverage": "Medicare appeals decisions and administrative law judge rulings",
                "key_topics": [
                    "Medicare appeals", "ALJ decisions", "administrative law",
                    "Medicare coverage", "medical necessity", "Part B appeals", "Part D appeals"
                ],
                "authority_rank": 0.75,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["Medicare appeal", "ALJ", "medical necessity", "coverage determination"]
            },
            "WESTLAW_CASES": {
                "name": "Westlaw Case Database (Public Access)",
                "base_url": "https://www.westlaw.com",
                "coverage": "Comprehensive legal database with healthcare and insurance cases",
                "note": "Requires subscription for full access",
                "key_topics": [
                    "ERISA cases", "insurance law", "healthcare appeals", "regulatory compliance",
                    "medical necessity", "fiduciary duty", "bad faith insurance"
                ],
                "authority_rank": 0.75,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["ERISA", "health insurance", "medical necessity", "appeal denial"]
            }
        }

    def fetch_appeal_decisions(self, source_code: str, output_dir: Path,
                             search_terms: Optional[List[str]] = None,
                             date_range: Optional[tuple] = None) -> List[DOC]:
        """
        Fetch appeal decisions from a specific source.

        Args:
            source_code: Source identifier (e.g., 'COURTLISTENER', 'JUSTIA')
            output_dir: Directory to save fetched documents
            search_terms: Custom search terms (defaults to source's key terms)
            date_range: Tuple of (start_date, end_date) for filtering

        Returns:
            List of DOC objects for parsed decisions
        """
        appeal_sources = self.get_appeal_sources()

        if source_code not in appeal_sources:
            logger.warning(f"No source configured for: {source_code}")
            return []

        source_info = appeal_sources[source_code]
        docs = []

        if search_terms is None:
            search_terms = source_info.get('search_terms', [])

        logger.info(f"Fetching appeal decisions from {source_info['name']}")

        # Different fetching strategies based on source
        if source_code == "COURTLISTENER":
            docs = self._fetch_courtlistener_cases(source_info, search_terms, output_dir, date_range)
        elif source_code == "JUSTIA":
            docs = self._fetch_justia_cases(source_info, search_terms, output_dir, date_range)
        elif source_code == "GOOGLE_SCHOLAR":
            docs = self._fetch_google_scholar_cases(source_info, search_terms, output_dir, date_range)
        elif source_code.startswith("STATE_COURTS_"):
            docs = self._fetch_state_court_cases(source_info, search_terms, output_dir, date_range)
        elif source_code == "IRO_DECISIONS":
            docs = self._fetch_iro_decisions(source_info, search_terms, output_dir, date_range)
        elif source_code == "CMS_APPEALS":
            docs = self._fetch_cms_appeals(source_info, search_terms, output_dir, date_range)
        else:
            logger.warning(f"No fetching strategy implemented for {source_code}")

        return docs

    def _fetch_courtlistener_cases(self, source_info: Dict[str, Any], search_terms: List[str],
                                 output_dir: Path, date_range: Optional[tuple]) -> List[DOC]:
        """Fetch cases from CourtListener API."""
        docs = []

        # Note: CourtListener API requires authentication for most endpoints
        # This is a simplified implementation for demonstration
        logger.info("CourtListener requires API key for full access")

        # Example implementation for public search
        for term in search_terms[:2]:  # Limit searches
            try:
                # Use public search interface
                search_url = f"{source_info['base_url']}/opinion/?q={quote_plus(term)}"

                self._rate_limit()
                response = self.session.get(search_url, timeout=30)
                response.raise_for_status()

                soup = BeautifulSoup(response.content, 'html.parser')

                # Extract case links
                case_links = soup.find_all('a', href=re.compile(r'/opinion/\d+/'))

                for link in case_links[:5]:  # Limit results
                    case_url = urljoin(source_info['base_url'], link.get('href'))
                    case_title = link.get_text(strip=True)

                    doc = self._fetch_case_document(
                        case_url, case_title, "COURTLISTENER", source_info
                    )
                    if doc:
                        docs.append(doc)
                        self._save_document(doc, output_dir)

            except Exception as e:
                logger.warning(f"Error fetching from CourtListener: {e}")

        return docs

    def _fetch_justia_cases(self, source_info: Dict[str, Any], search_terms: List[str],
                          output_dir: Path, date_range: Optional[tuple]) -> List[DOC]:
        """Fetch cases from Justia."""
        docs = []

        for term in search_terms[:2]:  # Limit searches
            try:
                search_url = f"{source_info['search_url']}?q={quote_plus(term)}&s=case"

                self._rate_limit()
                response = self.session.get(search_url, timeout=30)
                response.raise_for_status()

                soup = BeautifulSoup(response.content, 'html.parser')

                # Extract case links
                case_links = soup.find_all('a', href=re.compile(r'/cases/'))

                for link in case_links[:5]:  # Limit results
                    case_url = urljoin(source_info['base_url'], link.get('href'))
                    case_title = link.get_text(strip=True)

                    if any(healthcare_term in case_title.lower() for healthcare_term in
                          ['insurance', 'medical', 'health', 'erisa', 'appeal']):

                        doc = self._fetch_case_document(
                            case_url, case_title, "JUSTIA", source_info
                        )
                        if doc:
                            docs.append(doc)
                            self._save_document(doc, output_dir)

            except Exception as e:
                logger.warning(f"Error fetching from Justia: {e}")

        return docs

    def _fetch_google_scholar_cases(self, source_info: Dict[str, Any], search_terms: List[str],
                                  output_dir: Path, date_range: Optional[tuple]) -> List[DOC]:
        """Fetch cases from Google Scholar (note: may have rate limiting)."""
        docs = []
        logger.info("Google Scholar has strict rate limiting - using conservative approach")

        # Very limited implementation due to Google's restrictions
        for term in search_terms[:1]:  # Only one search
            try:
                search_url = f"{source_info['search_url']}?q={quote_plus(term + ' health insurance')}"

                self._rate_limit()
                time.sleep(5)  # Extra delay for Google

                response = self.session.get(search_url, timeout=30)

                if response.status_code == 429:  # Rate limited
                    logger.warning("Google Scholar rate limiting detected")
                    break

                response.raise_for_status()
                # Implementation would continue here...

            except Exception as e:
                logger.warning(f"Error fetching from Google Scholar: {e}")

        return docs

    def _fetch_state_court_cases(self, source_info: Dict[str, Any], search_terms: List[str],
                               output_dir: Path, date_range: Optional[tuple]) -> List[DOC]:
        """Fetch cases from state court systems."""
        docs = []
        logger.info(f"Fetching from {source_info['name']}")

        # State court systems often require specific search interfaces
        # This is a generalized implementation
        try:
            # Many state courts have public search interfaces
            base_url = source_info.get('search_url', source_info['base_url'])

            self._rate_limit()
            response = self.session.get(base_url, timeout=30)
            response.raise_for_status()

            # Look for searchable cases related to healthcare
            soup = BeautifulSoup(response.content, 'html.parser')

            # This would need to be customized for each state's interface
            case_links = soup.find_all('a', text=re.compile(r'insurance|medical|health', re.I))

            for link in case_links[:3]:  # Very limited
                case_url = urljoin(base_url, link.get('href', ''))
                case_title = link.get_text(strip=True)

                if case_url and case_title:
                    doc = self._fetch_case_document(
                        case_url, case_title, source_info.get('jurisdiction', 'STATE'), source_info
                    )
                    if doc:
                        docs.append(doc)
                        self._save_document(doc, output_dir)

        except Exception as e:
            logger.warning(f"Error fetching state court cases: {e}")

        return docs

    def _fetch_iro_decisions(self, source_info: Dict[str, Any], search_terms: List[str],
                           output_dir: Path, date_range: Optional[tuple]) -> List[DOC]:
        """Fetch Independent Review Organization decisions."""
        docs = []

        try:
            # IRO decisions are often published as summary reports
            decisions_url = source_info.get('search_url', source_info['base_url'])

            self._rate_limit()
            response = self.session.get(decisions_url, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for decision documents
            decision_links = soup.find_all('a', href=re.compile(r'\.pdf$|decision|appeal', re.I))

            for link in decision_links[:10]:  # Limit results
                doc_url = urljoin(decisions_url, link.get('href'))
                doc_title = link.get_text(strip=True) or "IRO Decision"

                doc = self._fetch_case_document(
                    doc_url, doc_title, "IRO_DECISIONS", source_info
                )
                if doc:
                    docs.append(doc)
                    self._save_document(doc, output_dir)

        except Exception as e:
            logger.warning(f"Error fetching IRO decisions: {e}")

        return docs

    def _fetch_cms_appeals(self, source_info: Dict[str, Any], search_terms: List[str],
                         output_dir: Path, date_range: Optional[tuple]) -> List[DOC]:
        """Fetch CMS Medicare appeals decisions."""
        docs = []

        try:
            appeals_url = source_info.get('search_url', source_info['base_url'])

            self._rate_limit()
            response = self.session.get(appeals_url, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for appeals decisions and ALJ rulings
            decision_links = soup.find_all('a', href=re.compile(r'appeal|decision|alj', re.I))

            for link in decision_links[:8]:  # Limit results
                doc_url = urljoin(appeals_url, link.get('href'))
                doc_title = link.get_text(strip=True) or "Medicare Appeals Decision"

                doc = self._fetch_case_document(
                    doc_url, doc_title, "CMS_APPEALS", source_info
                )
                if doc:
                    docs.append(doc)
                    self._save_document(doc, output_dir)

        except Exception as e:
            logger.warning(f"Error fetching CMS appeals: {e}")

        return docs

    def _fetch_case_document(self, url: str, title: str, source_code: str,
                           source_info: Dict[str, Any]) -> Optional[DOC]:
        """
        Fetch and parse a specific case document.

        Args:
            url: Document URL
            title: Document title
            source_code: Source identifier
            source_info: Source configuration

        Returns:
            DOC object or None if failed
        """
        try:
            self._rate_limit()
            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            text_content = ""

            if url.lower().endswith('.pdf'):
                # Parse PDF content
                try:
                    import io
                    pdf_file = io.BytesIO(response.content)
                    pdf_reader = PyPDF2.PdfReader(pdf_file)

                    for page in pdf_reader.pages:
                        text_content += page.extract_text() + "\n"

                except Exception as e:
                    logger.warning(f"Failed to parse PDF {url}: {e}")
                    return None
            else:
                # Parse HTML content
                soup = BeautifulSoup(response.content, 'html.parser')

                # Remove script and style elements
                for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    script.decompose()

                # Look for main content areas
                main_content = (
                    soup.find('main') or
                    soup.find('article') or
                    soup.find('div', class_=re.compile(r'content|opinion|decision|case', re.I)) or
                    soup.find('div', id=re.compile(r'content|opinion|decision|case', re.I)) or
                    soup
                )

                text_content = main_content.get_text(separator='\n', strip=True)

            if not text_content.strip() or len(text_content) < 500:
                return None

            # Determine document type and jurisdiction
            doc_type = DocType.COURT_OPINION
            if "IRO" in source_code or "external review" in title.lower():
                doc_type = DocType.APPEAL_DECISION

            jurisdiction = Jurisdiction.FEDERAL
            if source_info.get('jurisdiction'):
                jurisdiction = Jurisdiction.STATE

            # Extract case information
            case_citation = self._extract_case_citation(text_content, title)
            decision_date = self._extract_decision_date(text_content)

            # Create DOC object
            doc = DOC(
                category=f"Appeals - {source_code}",
                title=title,
                doc_type=doc_type,
                jurisdiction=jurisdiction,
                citation=case_citation,
                published_date=decision_date,
                version="final",
                url=url,
                license="Public domain",
                text=text_content.strip(),
                retrieval_priority=source_info.get('authority_rank', 0.70),
                tags=[
                    "appeal_decision",
                    "legal_precedent",
                    source_code.lower(),
                    "healthcare",
                    "insurance"
                ] + source_info.get('key_topics', []),
                metadata={
                    "source_code": source_code,
                    "source_name": source_info['name'],
                    "doc_format": "PDF" if url.lower().endswith('.pdf') else "HTML",
                    "fetch_date": datetime.now(timezone.utc).isoformat(),
                    "source_type": "appeal_decision",
                    "authority_rank": source_info.get('authority_rank', 0.70),
                    "jurisdiction": source_info.get('jurisdiction', 'federal')
                }
            )

            return doc

        except requests.RequestException as e:
            logger.error(f"Failed to fetch case document {url}: {e}")
            return None

    def _extract_case_citation(self, text: str, title: str) -> Optional[str]:
        """Extract legal citation from case text."""
        # Look for common citation patterns
        citation_patterns = [
            r'(\d+\s+F\.\s*(?:2d|3d|Supp\.?)\s*\d+)',  # Federal reporters
            r'(\d+\s+[A-Z][a-z]*\.?\s*(?:2d|3d)?\s*\d+)',  # State reporters
            r'(No\.\s*[A-Z]?\d+(?:-\d+)?)',  # Case numbers
            r'(\d{4}\s+WL\s+\d+)',  # Westlaw citations
        ]

        for pattern in citation_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)

        # Fall back to extracting from title
        return title.split(' - ')[0] if ' - ' in title else title

    def _extract_decision_date(self, text: str) -> Optional[datetime]:
        """Extract decision date from case text."""
        date_patterns = [
            r'decided\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'filed\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'opinion\s+filed\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'(\w+\s+\d{1,2},?\s+\d{4})\s*(?:\n|$)'
        ]

        for pattern in date_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                date_str = match.group(1)
                try:
                    from dateutil import parser
                    return parser.parse(date_str)
                except:
                    continue

        return None

    def _save_document(self, doc: DOC, output_dir: Path) -> Path:
        """
        Save document to JSON file.

        Args:
            doc: DOC object to save
            output_dir: Output directory

        Returns:
            Path to saved file
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Create filename
        source_code = doc.metadata.get('source_code', 'unknown')
        safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', doc.title)[:50]
        filename = f"{source_code}_{safe_title}_{doc.source_id}.json"

        output_path = output_dir / filename

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(doc.model_dump(), f, indent=2, ensure_ascii=False, default=str)

        logger.info(f"Saved {doc.title} to {output_path}")
        return output_path

    def fetch_all_sources(self, output_dir: Path,
                         source_codes: Optional[List[str]] = None,
                         search_terms: Optional[List[str]] = None) -> Dict[str, List[DOC]]:
        """
        Fetch appeal decisions from multiple sources.

        Args:
            output_dir: Directory to save documents
            source_codes: List of source codes to fetch (defaults to reliable sources)
            search_terms: Custom search terms

        Returns:
            Dictionary mapping source codes to lists of DOC objects
        """
        all_sources = self.get_appeal_sources()

        if source_codes is None:
            # Start with most reliable sources
            source_codes = ['IRO_DECISIONS', 'CMS_APPEALS', 'JUSTIA']

        results = {}

        for source_code in source_codes:
            logger.info(f"Processing appeals source: {source_code}")

            source_output_dir = output_dir / f"appeals_{source_code.lower()}"
            docs = self.fetch_appeal_decisions(source_code, source_output_dir, search_terms)

            results[source_code] = docs

            # Longer delay between sources to be respectful
            time.sleep(15.0)

        return results

    def search_appeal_precedents(self, query: str,
                               jurisdiction: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Search appeal precedents and decisions.

        Args:
            query: Search query
            jurisdiction: Specific jurisdiction to search

        Returns:
            List of search results with metadata
        """
        results = []
        sources = self.get_appeal_sources()

        for source_code, source_info in sources.items():
            # Filter by jurisdiction if specified
            if jurisdiction and source_info.get('jurisdiction') != jurisdiction:
                continue

            # Return metadata about available sources
            results.append({
                "source_code": source_code,
                "source_name": source_info['name'],
                "search_query": query,
                "coverage": source_info.get('coverage', ''),
                "key_topics": source_info.get('key_topics', []),
                "base_url": source_info.get('base_url'),
                "authority_rank": source_info.get('authority_rank', 0.70),
                "jurisdiction": source_info.get('jurisdiction', 'federal')
            })

        return results