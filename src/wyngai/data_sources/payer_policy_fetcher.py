"""
Payer policy fetcher for major insurance companies.

Fetches medical policies, coverage guidelines, and appeals procedures from
major insurance carriers like Aetna, BCBS, United, Cigna, Humana, etc.
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
from urllib.parse import urljoin, urlparse, quote_plus
import logging

from ..schemas import DOC, DocType, Jurisdiction
from ..utils.config import config

logger = logging.getLogger(__name__)


class PayerPolicyFetcher:
    """Fetches medical policies and coverage guidelines from major insurance payers."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'WyngAI/1.0 (Healthcare Training Data Pipeline)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        })

        # Rate limiting - more conservative for commercial sites
        self.request_delay = 3.0  # 3 seconds between requests
        self.last_request_time = 0

    def _rate_limit(self):
        """Enforce rate limiting between requests."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.request_delay:
            time.sleep(self.request_delay - time_since_last)
        self.last_request_time = time.time()

    def get_payer_sources(self) -> Dict[str, Dict[str, Any]]:
        """
        Get comprehensive list of major insurance payer policy sources.

        Returns:
            Dictionary mapping payer codes to source information
        """
        return {
            "AETNA": {
                "name": "Aetna Inc.",
                "medical_policies_url": "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins.html",
                "coverage_guidelines_url": "https://www.aetna.com/health-care-professionals/coverage-guidelines.html",
                "appeals_url": "https://www.aetna.com/individuals-families/using-your-aetna-better-health-plan/appeals-grievances.html",
                "prior_auth_url": "https://www.aetna.com/health-care-professionals/precertification-preauthorization.html",
                "pharmacy_url": "https://www.aetna.com/health-care-professionals/pharmacy-information.html",
                "key_topics": [
                    "medical necessity", "prior authorization", "appeals procedures",
                    "coverage guidelines", "experimental treatments", "pharmacy benefits"
                ],
                "authority_rank": 0.78,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["clinical policy", "coverage guideline", "medical necessity", "appeals"]
            },
            "BCBS": {
                "name": "Blue Cross Blue Shield Association",
                "medical_policies_url": "https://www.bcbs.com/providers/clinical-guidelines",
                "coverage_guidelines_url": "https://www.bcbs.com/providers/coverage-policies",
                "appeals_url": "https://www.bcbs.com/members/appeal-a-claim-decision",
                "prior_auth_url": "https://www.bcbs.com/providers/prior-authorization",
                "key_topics": [
                    "technology evaluation", "medical policy", "coverage determination",
                    "appeals process", "prior authorization", "clinical guidelines"
                ],
                "authority_rank": 0.80,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["medical policy", "technology evaluation", "coverage", "appeals"],
                "state_plans": {
                    "BCBS_CA": "https://www.bluecrossca.com/provider",
                    "BCBS_NY": "https://www.excellusbcbs.com/providers",
                    "BCBS_TX": "https://www.bcbstx.com/provider",
                    "BCBS_FL": "https://www.floridablue.com/providers"
                }
            },
            "UHC": {
                "name": "UnitedHealthcare",
                "medical_policies_url": "https://www.uhcprovider.com/en/policies-protocols/medical-clinical-policies.html",
                "coverage_guidelines_url": "https://www.uhcprovider.com/en/policies-protocols/coverage-determination-guidelines.html",
                "appeals_url": "https://www.uhc.com/member-guide/health-plan-information/appeals-and-grievances",
                "prior_auth_url": "https://www.uhcprovider.com/en/prior-auth-advance-notification.html",
                "pharmacy_url": "https://www.uhcprovider.com/en/policies-protocols/pharmacy-clinical-policies.html",
                "key_topics": [
                    "coverage determination", "medical necessity", "prior authorization",
                    "appeals procedures", "pharmacy benefits", "experimental procedures"
                ],
                "authority_rank": 0.79,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["coverage determination", "medical policy", "appeals", "authorization"]
            },
            "CIGNA": {
                "name": "Cigna Corporation",
                "medical_policies_url": "https://www.cigna.com/healthcare-professionals/coverage-positions",
                "coverage_guidelines_url": "https://www.cigna.com/healthcare-professionals/clinical-medical-policies",
                "appeals_url": "https://www.cigna.com/individuals-families/member-guide/appeals-complaints",
                "prior_auth_url": "https://www.cigna.com/healthcare-professionals/prior-authorization",
                "pharmacy_url": "https://www.cigna.com/healthcare-professionals/pharmacy-benefits",
                "key_topics": [
                    "coverage positions", "medical policies", "appeals process",
                    "prior authorization", "pharmacy coverage", "experimental treatments"
                ],
                "authority_rank": 0.77,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["coverage position", "medical policy", "appeals", "authorization"]
            },
            "HUMANA": {
                "name": "Humana Inc.",
                "medical_policies_url": "https://www.humana.com/provider/medical-resources/clinical-guidelines",
                "coverage_guidelines_url": "https://www.humana.com/provider/medical-resources/coverage-policies",
                "appeals_url": "https://www.humana.com/member/member-guide/appeals-grievances",
                "prior_auth_url": "https://www.humana.com/provider/administrative-resources/prior-authorization",
                "pharmacy_url": "https://www.humana.com/provider/pharmacy-resources",
                "key_topics": [
                    "clinical guidelines", "coverage policies", "appeals procedures",
                    "prior authorization", "Medicare Advantage", "pharmacy benefits"
                ],
                "authority_rank": 0.76,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["clinical guideline", "coverage policy", "appeals", "authorization"]
            },
            "ANTHEM": {
                "name": "Anthem Inc.",
                "medical_policies_url": "https://www.anthem.com/provider/clinical-policies",
                "coverage_guidelines_url": "https://www.anthem.com/provider/clinical-resources/clinical-guidelines",
                "appeals_url": "https://www.anthem.com/member/appeals-grievances",
                "prior_auth_url": "https://www.anthem.com/provider/authorizations",
                "key_topics": [
                    "clinical policies", "medical necessity", "appeals process",
                    "prior authorization", "coverage determination", "pharmacy benefits"
                ],
                "authority_rank": 0.77,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["clinical policy", "medical necessity", "appeals", "authorization"]
            },
            "KAISER": {
                "name": "Kaiser Permanente",
                "medical_policies_url": "https://healthy.kaiserpermanente.org/providers/clinical-policies",
                "coverage_guidelines_url": "https://healthy.kaiserpermanente.org/providers/coverage-policies",
                "appeals_url": "https://healthy.kaiserpermanente.org/members/appeals-grievances",
                "prior_auth_url": "https://healthy.kaiserpermanente.org/providers/prior-authorization",
                "key_topics": [
                    "clinical policies", "technology assessment", "appeals procedures",
                    "coverage determination", "integrated care", "HMO policies"
                ],
                "authority_rank": 0.75,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["clinical policy", "technology assessment", "appeals", "coverage"]
            },
            "MOLINA": {
                "name": "Molina Healthcare",
                "medical_policies_url": "https://www.molinahealthcare.com/providers/medicaid/clinical-resources",
                "coverage_guidelines_url": "https://www.molinahealthcare.com/providers/coverage-policies",
                "appeals_url": "https://www.molinahealthcare.com/members/medicaid/appeals-grievances",
                "key_topics": [
                    "Medicaid policies", "coverage guidelines", "appeals procedures",
                    "prior authorization", "managed care", "community health"
                ],
                "authority_rank": 0.74,
                "doc_formats": ["PDF", "HTML"],
                "search_terms": ["coverage policy", "Medicaid", "appeals", "authorization"]
            }
        }

    def fetch_payer_policies(self, payer_code: str, output_dir: Path,
                           policy_types: Optional[List[str]] = None) -> List[DOC]:
        """
        Fetch policies for a specific payer.

        Args:
            payer_code: Payer identifier (e.g., 'AETNA', 'UHC')
            output_dir: Directory to save fetched documents
            policy_types: Types of policies to fetch ['medical', 'appeals', 'pharmacy', 'prior_auth']

        Returns:
            List of DOC objects for parsed policies
        """
        payer_sources = self.get_payer_sources()

        if payer_code not in payer_sources:
            logger.warning(f"No source configured for payer: {payer_code}")
            return []

        if policy_types is None:
            policy_types = ['medical', 'appeals', 'prior_auth']

        payer_info = payer_sources[payer_code]
        docs = []

        logger.info(f"Fetching policies for {payer_info['name']}")

        # Fetch different types of policies
        for policy_type in policy_types:
            url_key = f"{policy_type}_policies_url"
            if policy_type == "medical":
                url_key = "medical_policies_url"
            elif policy_type == "appeals":
                url_key = "appeals_url"
            elif policy_type == "prior_auth":
                url_key = "prior_auth_url"
            elif policy_type == "pharmacy":
                url_key = "pharmacy_url"

            if url_key in payer_info:
                policy_docs = self._fetch_policy_documents(
                    payer_info[url_key],
                    payer_code,
                    policy_type,
                    payer_info,
                    output_dir
                )
                docs.extend(policy_docs)

        return docs

    def _fetch_policy_documents(self, url: str, payer_code: str, policy_type: str,
                              payer_info: Dict[str, Any], output_dir: Path) -> List[DOC]:
        """
        Fetch policy documents from a specific URL.

        Args:
            url: URL to fetch from
            payer_code: Payer code
            policy_type: Type of policy
            payer_info: Payer configuration
            output_dir: Output directory

        Returns:
            List of DOC objects
        """
        docs = []

        try:
            self._rate_limit()
            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            # Parse HTML to find policy documents
            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract document links
            doc_links = self._extract_policy_links(soup, url, payer_info)

            for doc_url, doc_title in doc_links:
                try:
                    doc = self._fetch_policy_document(
                        doc_url, doc_title, payer_code, policy_type, payer_info
                    )
                    if doc:
                        docs.append(doc)
                        # Save document
                        self._save_document(doc, output_dir)
                except Exception as e:
                    logger.warning(f"Failed to fetch policy document {doc_url}: {e}")
                    continue

        except requests.RequestException as e:
            logger.error(f"Failed to fetch {url}: {e}")

        return docs

    def _extract_policy_links(self, soup: BeautifulSoup, base_url: str,
                            payer_info: Dict[str, Any]) -> List[tuple]:
        """
        Extract policy document links from HTML.

        Args:
            soup: BeautifulSoup object
            base_url: Base URL for resolving relative links
            payer_info: Payer configuration

        Returns:
            List of (url, title) tuples
        """
        links = []

        # Look for PDF policy documents
        pdf_links = soup.find_all('a', href=re.compile(r'\.pdf$', re.I))
        for link in pdf_links:
            href = link.get('href')
            title = link.get_text(strip=True) or link.get('title', '')

            if href and any(term.lower() in title.lower() for term in payer_info.get('search_terms', [])):
                full_url = urljoin(base_url, href)
                links.append((full_url, title))

        # Look for policy-specific links
        search_terms = payer_info.get('search_terms', [])
        for term in search_terms:
            term_links = soup.find_all('a', text=re.compile(term, re.I))
            for link in term_links:
                href = link.get('href')
                title = link.get_text(strip=True)

                if href:
                    full_url = urljoin(base_url, href)
                    links.append((full_url, title))

        # Look for links in tables or lists that might contain policies
        policy_containers = soup.find_all(['table', 'ul', 'ol'], class_=re.compile(r'policy|clinical|coverage', re.I))
        for container in policy_containers:
            container_links = container.find_all('a')
            for link in container_links:
                href = link.get('href')
                title = link.get_text(strip=True)

                if href and title:
                    full_url = urljoin(base_url, href)
                    links.append((full_url, title))

        # Remove duplicates and limit results
        unique_links = list(dict.fromkeys(links))
        return unique_links[:20]  # Limit to prevent excessive requests

    def _fetch_policy_document(self, url: str, title: str, payer_code: str,
                             policy_type: str, payer_info: Dict[str, Any]) -> Optional[DOC]:
        """
        Fetch and parse a specific policy document.

        Args:
            url: Document URL
            title: Document title
            payer_code: Payer code
            policy_type: Policy type
            payer_info: Payer configuration

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
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.decompose()

                # Look for main content areas
                main_content = (
                    soup.find('main') or
                    soup.find('div', class_=re.compile(r'content|policy|main', re.I)) or
                    soup.find('article') or
                    soup
                )

                text_content = main_content.get_text(separator='\n', strip=True)

            if not text_content.strip() or len(text_content) < 200:
                return None

            # Determine document type
            doc_type = DocType.PAYER_POLICY

            # Extract effective dates and citations from content
            effective_date = self._extract_effective_date(text_content)
            citation = self._extract_citation(text_content, payer_code)

            # Create DOC object
            doc = DOC(
                category=f"Payer Policy - {payer_code}",
                title=title or f"{payer_info['name']} {policy_type.title()} Policy",
                doc_type=doc_type,
                jurisdiction=Jurisdiction.PAYER,
                citation=citation,
                effective_date=effective_date,
                version="current",
                url=url,
                license="Proprietary - fair use for training",
                text=text_content.strip(),
                retrieval_priority=payer_info.get('authority_rank', 0.75),
                tags=[
                    "payer_policy",
                    payer_code.lower(),
                    policy_type,
                    "insurance",
                    "coverage"
                ] + payer_info.get('key_topics', []),
                metadata={
                    "payer_code": payer_code,
                    "payer_name": payer_info['name'],
                    "policy_type": policy_type,
                    "doc_format": "PDF" if url.lower().endswith('.pdf') else "HTML",
                    "fetch_date": datetime.now(timezone.utc).isoformat(),
                    "source_type": "payer_policy",
                    "authority_rank": payer_info.get('authority_rank', 0.75)
                }
            )

            return doc

        except requests.RequestException as e:
            logger.error(f"Failed to fetch policy document {url}: {e}")
            return None

    def _extract_effective_date(self, text: str) -> Optional[datetime]:
        """Extract effective date from policy text."""
        # Look for common date patterns
        date_patterns = [
            r'effective\s+(?:date\s+)?:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
            r'effective\s+(\w+\s+\d{1,2},?\s+\d{4})',
            r'revised\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
            r'last\s+updated\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})'
        ]

        for pattern in date_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                date_str = match.group(1)
                try:
                    # Try to parse the date
                    from dateutil import parser
                    return parser.parse(date_str)
                except:
                    continue

        return None

    def _extract_citation(self, text: str, payer_code: str) -> Optional[str]:
        """Extract policy citation or identifier."""
        # Look for policy numbers or identifiers
        citation_patterns = [
            r'policy\s+(?:number|#)?\s*:?\s*([A-Z0-9.-]+)',
            r'guideline\s+(?:number|#)?\s*:?\s*([A-Z0-9.-]+)',
            r'coverage\s+policy\s*:?\s*([A-Z0-9.-]+)',
            rf'{payer_code}\s+policy\s*:?\s*([A-Z0-9.-]+)'
        ]

        for pattern in citation_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return f"{payer_code} {match.group(1)}"

        return f"{payer_code} Policy"

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
        payer_code = doc.metadata.get('payer_code', 'unknown')
        policy_type = doc.metadata.get('policy_type', 'policy')
        safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', doc.title)[:50]
        filename = f"{payer_code}_{policy_type}_{safe_title}_{doc.source_id}.json"

        output_path = output_dir / filename

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(doc.model_dump(), f, indent=2, ensure_ascii=False, default=str)

        logger.info(f"Saved {doc.title} to {output_path}")
        return output_path

    def fetch_all_payers(self, output_dir: Path,
                        payer_codes: Optional[List[str]] = None,
                        policy_types: Optional[List[str]] = None) -> Dict[str, List[DOC]]:
        """
        Fetch policies from multiple payers.

        Args:
            output_dir: Directory to save documents
            payer_codes: List of payer codes to fetch (defaults to all configured)
            policy_types: Types of policies to fetch

        Returns:
            Dictionary mapping payer codes to lists of DOC objects
        """
        all_sources = self.get_payer_sources()

        if payer_codes is None:
            payer_codes = list(all_sources.keys())

        if policy_types is None:
            policy_types = ['medical', 'appeals']

        results = {}

        for payer_code in payer_codes:
            logger.info(f"Processing payer: {payer_code}")

            payer_output_dir = output_dir / f"payer_{payer_code.lower()}"
            docs = self.fetch_payer_policies(payer_code, payer_output_dir, policy_types)

            results[payer_code] = docs

            # Longer delay between payers to be respectful
            time.sleep(10.0)

        return results

    def search_payer_policies(self, query: str,
                            payer_codes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Search payer policies for specific terms.

        Args:
            query: Search query
            payer_codes: Payers to search (defaults to major payers)

        Returns:
            List of search results
        """
        if payer_codes is None:
            # Major payers for comprehensive coverage
            payer_codes = ['AETNA', 'BCBS', 'UHC', 'CIGNA', 'HUMANA', 'ANTHEM']

        results = []
        sources = self.get_payer_sources()

        for payer_code in payer_codes:
            if payer_code not in sources:
                continue

            payer_info = sources[payer_code]

            # Return metadata about available sources
            results.append({
                "payer_code": payer_code,
                "payer_name": payer_info['name'],
                "search_query": query,
                "available_topics": payer_info.get('key_topics', []),
                "medical_policies_url": payer_info.get('medical_policies_url'),
                "appeals_url": payer_info.get('appeals_url'),
                "authority_rank": payer_info.get('authority_rank', 0.75)
            })

        return results