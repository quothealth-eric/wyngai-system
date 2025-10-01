"""
State Department of Insurance (DOI) regulations fetcher.

Fetches insurance regulations from all 50 state DOI websites and repositories.
"""

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
import requests
from bs4 import BeautifulSoup
import PyPDF2
from urllib.parse import urljoin, urlparse
import logging

from ..schemas import DOC, DocType, Jurisdiction
from ..utils.config import config

logger = logging.getLogger(__name__)


class StateDOIFetcher:
    """Fetches regulations from state Department of Insurance websites."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'WyngAI/1.0 (Healthcare Training Data Pipeline)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        })

        # Rate limiting
        self.request_delay = 2.0  # 2 seconds between requests
        self.last_request_time = 0

    def _rate_limit(self):
        """Enforce rate limiting between requests."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.request_delay:
            time.sleep(self.request_delay - time_since_last)
        self.last_request_time = time.time()

    def get_state_doi_sources(self) -> Dict[str, Dict[str, Any]]:
        """
        Get comprehensive list of state DOI regulation sources.

        Returns:
            Dictionary mapping state codes to DOI source information
        """
        return {
            "CA": {
                "name": "California Department of Insurance",
                "regulations_url": "https://www.insurance.ca.gov/0250-insurers/0300-insurers/0100-applications/regulation-hearings/",
                "code_sections_url": "https://govt.westlaw.com/calregs/Browse/Home/California/CaliforniaCodeofRegulations/CaliforniCodeofRegulationsTitle10?transitionType=Default",
                "appeals_url": "https://www.insurance.ca.gov/01-consumers/140-catastrophes/earthquake-insurance/02-appeals/",
                "key_topics": ["claims handling", "unfair practices", "appeals procedures", "network adequacy"],
                "authority_rank": 0.85,
                "doc_format": "PDF, HTML"
            },
            "NY": {
                "name": "New York State Department of Financial Services",
                "regulations_url": "https://www.dfs.ny.gov/industry_guidance/industry_letters",
                "code_sections_url": "https://www.dfs.ny.gov/legal/regulations",
                "appeals_url": "https://www.dfs.ny.gov/consumers/health_insurance/appeal_your_health_plan_decision",
                "key_topics": ["external appeals", "insurance law", "surprise billing", "network adequacy"],
                "authority_rank": 0.87,
                "doc_format": "PDF, HTML"
            },
            "TX": {
                "name": "Texas Department of Insurance",
                "regulations_url": "https://www.tdi.texas.gov/rules/",
                "code_sections_url": "https://www.tdi.texas.gov/rules/proposed.html",
                "appeals_url": "https://www.tdi.texas.gov/consumer/complaints/",
                "key_topics": ["insurance code", "claims procedures", "external review", "prompt payment"],
                "authority_rank": 0.85,
                "doc_format": "PDF, HTML"
            },
            "FL": {
                "name": "Florida Office of Insurance Regulation",
                "regulations_url": "https://www.floir.com/sections/legal/documents.aspx",
                "code_sections_url": "https://www.floir.com/rules/",
                "appeals_url": "https://www.floir.com/consumers/",
                "key_topics": ["insurance regulations", "claims handling", "appeals", "network access"],
                "authority_rank": 0.84,
                "doc_format": "PDF, HTML"
            },
            "IL": {
                "name": "Illinois Department of Insurance",
                "regulations_url": "https://www2.illinois.gov/sites/idol/rules/Pages/default.aspx",
                "code_sections_url": "https://www2.illinois.gov/idol/rules/Pages/CodeRules.aspx",
                "appeals_url": "https://www2.illinois.gov/idol/consumers/Pages/default.aspx",
                "key_topics": ["insurance appeals", "external review", "claims processing", "network adequacy"],
                "authority_rank": 0.84,
                "doc_format": "PDF, HTML"
            },
            "PA": {
                "name": "Pennsylvania Insurance Department",
                "regulations_url": "https://www.insurance.pa.gov/Pages/Regulations.aspx",
                "code_sections_url": "https://www.insurance.pa.gov/Regulations/Pages/default.aspx",
                "appeals_url": "https://www.insurance.pa.gov/Consumers/Pages/Appeals.aspx",
                "key_topics": ["insurance regulations", "external appeals", "claims disputes", "emergency services"],
                "authority_rank": 0.84,
                "doc_format": "PDF, HTML"
            },
            "OH": {
                "name": "Ohio Department of Insurance",
                "regulations_url": "https://insurance.ohio.gov/wps/portal/gov/odi/about-us/legal-information/rules-and-regulations",
                "code_sections_url": "https://codes.ohio.gov/ohio-administrative-code/chapter-3901",
                "appeals_url": "https://insurance.ohio.gov/wps/portal/gov/odi/consumers/file-a-complaint",
                "key_topics": ["administrative code", "appeals procedures", "claims handling", "external review"],
                "authority_rank": 0.84,
                "doc_format": "PDF, HTML"
            },
            "MI": {
                "name": "Michigan Department of Insurance and Financial Services",
                "regulations_url": "https://www.michigan.gov/difs/industry/insurance/rules-regs",
                "code_sections_url": "https://www.michigan.gov/difs/industry/insurance/rules-regs/administrative-rules",
                "appeals_url": "https://www.michigan.gov/difs/consumer/insurance/complaints-appeals",
                "key_topics": ["insurance appeals", "external review", "no surprise billing", "network access"],
                "authority_rank": 0.84,
                "doc_format": "PDF, HTML"
            },
            # Add remaining states with similar structure
            "WA": {
                "name": "Washington State Office of the Insurance Commissioner",
                "regulations_url": "https://www.insurance.wa.gov/laws-rules-and-guidance",
                "code_sections_url": "https://apps.leg.wa.gov/WAC/default.aspx?cite=284",
                "appeals_url": "https://www.insurance.wa.gov/external-review",
                "key_topics": ["WAC 284", "external review", "appeals", "balance billing protection"],
                "authority_rank": 0.86,
                "doc_format": "PDF, HTML"
            },
            "MA": {
                "name": "Massachusetts Division of Insurance",
                "regulations_url": "https://www.mass.gov/orgs/division-of-insurance/regulations",
                "code_sections_url": "https://www.mass.gov/regulations/211-cmr-000-division-of-insurance",
                "appeals_url": "https://www.mass.gov/external-appeal-process-for-health-insurance-decisions",
                "key_topics": ["211 CMR", "external appeals", "emergency services", "network adequacy"],
                "authority_rank": 0.86,
                "doc_format": "PDF, HTML"
            }
        }

    def fetch_state_regulations(self, state_code: str, output_dir: Path) -> List[DOC]:
        """
        Fetch regulations for a specific state.

        Args:
            state_code: Two-letter state code (e.g., 'CA', 'NY')
            output_dir: Directory to save fetched documents

        Returns:
            List of DOC objects for parsed regulations
        """
        state_sources = self.get_state_doi_sources()

        if state_code not in state_sources:
            logger.warning(f"No DOI source configured for state: {state_code}")
            return []

        state_info = state_sources[state_code]
        docs = []

        logger.info(f"Fetching regulations for {state_info['name']}")

        # Fetch from regulations URL
        if 'regulations_url' in state_info:
            reg_docs = self._fetch_from_url(
                state_info['regulations_url'],
                state_code,
                state_info,
                output_dir
            )
            docs.extend(reg_docs)

        # Fetch from code sections URL
        if 'code_sections_url' in state_info:
            self._rate_limit()
            code_docs = self._fetch_from_url(
                state_info['code_sections_url'],
                state_code,
                state_info,
                output_dir
            )
            docs.extend(code_docs)

        return docs

    def _fetch_from_url(self, url: str, state_code: str, state_info: Dict[str, Any],
                       output_dir: Path) -> List[DOC]:
        """
        Fetch documents from a specific URL.

        Args:
            url: URL to fetch from
            state_code: State code
            state_info: State configuration
            output_dir: Output directory

        Returns:
            List of DOC objects
        """
        docs = []

        try:
            self._rate_limit()
            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            # Parse HTML to find regulation documents
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for PDF links and document links
            doc_links = self._extract_document_links(soup, url)

            for doc_url, doc_title in doc_links:
                try:
                    doc = self._fetch_document(doc_url, doc_title, state_code, state_info)
                    if doc:
                        docs.append(doc)
                        # Save document
                        self._save_document(doc, output_dir)
                except Exception as e:
                    logger.warning(f"Failed to fetch document {doc_url}: {e}")
                    continue

        except requests.RequestException as e:
            logger.error(f"Failed to fetch {url}: {e}")

        return docs

    def _extract_document_links(self, soup: BeautifulSoup, base_url: str) -> List[tuple]:
        """
        Extract document links from HTML.

        Args:
            soup: BeautifulSoup object
            base_url: Base URL for resolving relative links

        Returns:
            List of (url, title) tuples
        """
        links = []

        # Look for PDF links
        pdf_links = soup.find_all('a', href=re.compile(r'\.pdf$', re.I))
        for link in pdf_links:
            href = link.get('href')
            title = link.get_text(strip=True) or link.get('title', '')

            if href:
                full_url = urljoin(base_url, href)
                links.append((full_url, title))

        # Look for regulation-specific links
        reg_patterns = [
            r'regulation',
            r'rule',
            r'code',
            r'appeal',
            r'insurance',
            r'claim'
        ]

        for pattern in reg_patterns:
            reg_links = soup.find_all('a', text=re.compile(pattern, re.I))
            for link in reg_links:
                href = link.get('href')
                title = link.get_text(strip=True)

                if href and not href.endswith('.pdf'):
                    full_url = urljoin(base_url, href)
                    links.append((full_url, title))

        return links[:10]  # Limit to prevent excessive requests

    def _fetch_document(self, url: str, title: str, state_code: str,
                       state_info: Dict[str, Any]) -> Optional[DOC]:
        """
        Fetch and parse a specific document.

        Args:
            url: Document URL
            title: Document title
            state_code: State code
            state_info: State configuration

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
                for script in soup(["script", "style"]):
                    script.decompose()

                text_content = soup.get_text()

            if not text_content.strip():
                return None

            # Create DOC object
            doc = DOC(
                category=f"State DOI - {state_code}",
                title=title or f"{state_info['name']} Regulation",
                doc_type=DocType.REGULATION,
                jurisdiction=Jurisdiction.STATE,
                citation=f"{state_code} DOI",
                version="current",
                url=url,
                license="State public domain",
                text=text_content.strip(),
                retrieval_priority=state_info.get('authority_rank', 0.85),
                tags=[
                    "state_regulation",
                    "doi",
                    state_code.lower(),
                    "insurance"
                ] + state_info.get('key_topics', []),
                metadata={
                    "state_code": state_code,
                    "state_name": state_info['name'],
                    "doc_format": state_info.get('doc_format', 'HTML'),
                    "fetch_date": datetime.now(timezone.utc).isoformat(),
                    "source_type": "state_doi"
                }
            )

            return doc

        except requests.RequestException as e:
            logger.error(f"Failed to fetch document {url}: {e}")
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
        state_code = doc.metadata.get('state_code', 'unknown')
        safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', doc.title)[:50]
        filename = f"{state_code}_{safe_title}_{doc.source_id}.json"

        output_path = output_dir / filename

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(doc.model_dump(), f, indent=2, ensure_ascii=False, default=str)

        logger.info(f"Saved {doc.title} to {output_path}")
        return output_path

    def fetch_all_states(self, output_dir: Path,
                        state_codes: Optional[List[str]] = None) -> Dict[str, List[DOC]]:
        """
        Fetch regulations from multiple states.

        Args:
            output_dir: Directory to save documents
            state_codes: List of state codes to fetch (defaults to all configured)

        Returns:
            Dictionary mapping state codes to lists of DOC objects
        """
        all_sources = self.get_state_doi_sources()

        if state_codes is None:
            state_codes = list(all_sources.keys())

        results = {}

        for state_code in state_codes:
            logger.info(f"Processing state: {state_code}")

            state_output_dir = output_dir / f"state_{state_code.lower()}"
            docs = self.fetch_state_regulations(state_code, state_output_dir)

            results[state_code] = docs

            # Longer delay between states to be respectful
            time.sleep(5.0)

        return results

    def search_state_regulations(self, query: str,
                               state_codes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Search state regulations for specific terms.

        Args:
            query: Search query
            state_codes: States to search (defaults to priority states)

        Returns:
            List of search results
        """
        if state_codes is None:
            # Priority states for healthcare regulations
            state_codes = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'MI', 'WA', 'MA']

        results = []
        sources = self.get_state_doi_sources()

        for state_code in state_codes:
            if state_code not in sources:
                continue

            state_info = sources[state_code]

            # This would implement actual search functionality
            # For now, return metadata about available sources
            results.append({
                "state_code": state_code,
                "state_name": state_info['name'],
                "search_query": query,
                "available_topics": state_info.get('key_topics', []),
                "regulations_url": state_info.get('regulations_url'),
                "authority_rank": state_info.get('authority_rank', 0.85)
            })

        return results