"""
State Resource Discovery - Discover state DOI resources using NAIC/USA.gov
"""

import asyncio
import aiohttp
import pandas as pd
from bs4 import BeautifulSoup
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging
import re
from urllib.parse import urljoin, urlparse
import time

logger = logging.getLogger(__name__)

class StateResourceDiscovery:
    """Discovers state DOI resources using NAIC directory and USA.gov"""

    def __init__(self):
        self.session = None
        self.discovered_resources = []
        self.naic_states = {}
        self.usa_gov_states = {}

    async def discover_all_states(self, update_registry: bool = False):
        """Discover resources for all states"""
        logger.info("🔍 Starting comprehensive state resource discovery...")

        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={'User-Agent': 'WyngAI/1.0 Healthcare Research Bot'}
        ) as session:
            self.session = session

            # Phase 1: Discover base DOI information from NAIC
            await self._discover_naic_directory()

            # Phase 2: Enhance with USA.gov state portals
            await self._discover_usa_gov_portals()

            # Phase 3: Deep discovery for high-priority states
            await self._deep_discovery_priority_states()

            # Phase 4: Generate comprehensive registry entries
            self._generate_registry_entries()

            if update_registry:
                await self._update_registry()

        logger.info(f"✅ Discovery completed for {len(self.discovered_resources)} state resources")

    async def _discover_naic_directory(self):
        """Discover state insurance departments from NAIC directory"""
        logger.info("📋 Discovering state DOI information from NAIC...")

        naic_url = "https://content.naic.org/state-insurance-departments"

        try:
            async with self.session.get(naic_url) as response:
                if response.status != 200:
                    logger.warning(f"NAIC directory unavailable: {response.status}")
                    return

                html = await response.text()
                soup = BeautifulSoup(html, 'html.parser')

                # Parse state insurance department listings
                state_links = soup.find_all('a', href=True)

                for link in state_links:
                    href = link.get('href', '')
                    text = link.get_text(strip=True)

                    # Look for state DOI patterns
                    if self._is_state_doi_link(href, text):
                        state_code = self._extract_state_code(href, text)
                        if state_code:
                            self.naic_states[state_code] = {
                                'doi_home': href,
                                'doi_name': text,
                                'source': 'NAIC'
                            }

                logger.info(f"📊 Found {len(self.naic_states)} state DOIs from NAIC")

        except Exception as e:
            logger.error(f"Error accessing NAIC directory: {e}")

    async def _discover_usa_gov_portals(self):
        """Discover state government portals from USA.gov"""
        logger.info("🏛️ Discovering state portals from USA.gov...")

        usa_gov_url = "https://www.usa.gov/state-governments"

        try:
            async with self.session.get(usa_gov_url) as response:
                if response.status != 200:
                    logger.warning(f"USA.gov unavailable: {response.status}")
                    return

                html = await response.text()
                soup = BeautifulSoup(html, 'html.parser')

                # Parse state government links
                state_links = soup.find_all('a', href=True)

                for link in state_links:
                    href = link.get('href', '')
                    text = link.get_text(strip=True)

                    # Look for official state government portals
                    if self._is_state_portal_link(href, text):
                        state_code = self._extract_state_code(href, text)
                        if state_code:
                            self.usa_gov_states[state_code] = {
                                'portal_home': href,
                                'portal_name': text,
                                'source': 'USA.gov'
                            }

                logger.info(f"📊 Found {len(self.usa_gov_states)} state portals from USA.gov")

        except Exception as e:
            logger.error(f"Error accessing USA.gov: {e}")

    async def _deep_discovery_priority_states(self):
        """Perform deep discovery for priority states with known strong resources"""
        priority_states = {
            'CA': {
                'doi_home': 'https://www.dmhc.ca.gov',
                'imr_data': 'https://data.chhs.ca.gov/dataset/independent-medical-review-imr-determinations-trend',
                'search_terms': ['independent medical review', 'IMR', 'external review', 'consumer complaints']
            },
            'NY': {
                'doi_home': 'https://www.dfs.ny.gov',
                'external_appeals': 'https://www.dfs.ny.gov/complaints/file_external_appeal',
                'search_terms': ['external appeal', 'consumer complaints', 'health insurance appeals']
            },
            'TX': {
                'doi_home': 'https://www.tdi.texas.gov',
                'iro_decisions': 'https://www.tdi.texas.gov/hmo/mcqa/iro_decisions.html',
                'search_terms': ['IRO decisions', 'independent review', 'HMO appeals']
            },
            'WA': {
                'doi_home': 'https://www.insurance.wa.gov',
                'search_terms': ['appeals', 'consumer protection', 'external review']
            },
            'MA': {
                'doi_home': 'https://www.mass.gov/orgs/office-of-patient-protection',
                'external_review': 'https://www.mass.gov/request-an-external-review-of-a-health-insurance-decision',
                'search_terms': ['external review', 'patient protection', 'appeals']
            },
            'FL': {
                'doi_home': 'https://floir.com',
                'filings': 'https://irfssearch.fldfs.com/',
                'public_records': 'https://floir.com/resources-and-reports/public-records-requests',
                'search_terms': ['external review', 'appeals', 'consumer services']
            }
        }

        logger.info(f"🎯 Deep discovery for {len(priority_states)} priority states...")

        for state_code, state_info in priority_states.items():
            await self._discover_state_resources(state_code, state_info)
            await asyncio.sleep(1)  # Be respectful

    async def _discover_state_resources(self, state_code: str, state_info: Dict):
        """Discover comprehensive resources for a specific state"""
        logger.info(f"🔍 Deep discovery for {state_code}...")

        try:
            doi_home = state_info['doi_home']

            # Start with known URLs
            discovered = {
                'state_code': state_code,
                'doi_home': doi_home,
                'discovered_urls': {},
                'search_results': []
            }

            # Add any known specific URLs
            for key, url in state_info.items():
                if key not in ['search_terms', 'doi_home']:
                    discovered['discovered_urls'][key] = url

            # Crawl DOI home page for key resources
            doi_resources = await self._crawl_doi_resources(doi_home, state_info.get('search_terms', []))
            discovered['discovered_urls'].update(doi_resources)

            # Search for specific resources using heuristic patterns
            search_patterns = [
                '/laws-and-regulations',
                '/legal',
                '/statutes',
                '/administrative-code',
                '/bulletins',
                '/orders',
                '/external-appeal',
                '/external-review',
                '/independent-review',
                '/consumer/appeals',
                '/consumer-services',
                '/complaints',
                '/public-records'
            ]

            for pattern in search_patterns:
                test_url = urljoin(doi_home, pattern)
                if await self._url_exists(test_url):
                    discovered['discovered_urls'][f'resource_{pattern.replace("/", "_")}'] = test_url

            self.discovered_resources.append(discovered)

        except Exception as e:
            logger.error(f"Error discovering resources for {state_code}: {e}")

    async def _crawl_doi_resources(self, doi_home: str, search_terms: List[str]) -> Dict[str, str]:
        """Crawl DOI home page to find key resources"""
        resources = {}

        try:
            async with self.session.get(doi_home) as response:
                if response.status != 200:
                    return resources

                html = await response.text()
                soup = BeautifulSoup(html, 'html.parser')

                # Find all links
                links = soup.find_all('a', href=True)

                for link in links:
                    href = link.get('href', '')
                    text = link.get_text(strip=True).lower()

                    # Make URL absolute
                    full_url = urljoin(doi_home, href)

                    # Check if link matches search terms
                    for term in search_terms:
                        if term.lower() in text or term.lower() in href.lower():
                            resource_key = f"found_{term.replace(' ', '_')}"
                            resources[resource_key] = full_url
                            break

                    # Check for common patterns
                    patterns = {
                        'external_review': ['external review', 'independent review', 'appeals'],
                        'bulletins': ['bulletin', 'order', 'guidance'],
                        'consumer_guides': ['consumer', 'guide', 'help'],
                        'laws': ['law', 'statute', 'regulation'],
                        'filings': ['filing', 'form', 'document']
                    }

                    for key, pattern_terms in patterns.items():
                        if any(term in text for term in pattern_terms):
                            resources[key] = full_url

        except Exception as e:
            logger.error(f"Error crawling DOI resources for {doi_home}: {e}")

        return resources

    async def _url_exists(self, url: str) -> bool:
        """Check if URL exists with HEAD request"""
        try:
            async with self.session.head(url) as response:
                return response.status == 200
        except:
            return False

    def _is_state_doi_link(self, href: str, text: str) -> bool:
        """Check if link appears to be a state DOI"""
        doi_patterns = [
            'insurance.', 'doi.', 'tdi.', 'dfs.', 'dmhc.', 'oci.',
            'insurance department', 'department of insurance',
            'financial services', 'banking and insurance'
        ]

        combined = f"{href} {text}".lower()
        return any(pattern in combined for pattern in doi_patterns)

    def _is_state_portal_link(self, href: str, text: str) -> bool:
        """Check if link appears to be a state government portal"""
        portal_patterns = [
            '.gov', 'state.', 'gov.', 'portal', 'government'
        ]

        combined = f"{href} {text}".lower()
        return any(pattern in combined for pattern in portal_patterns)

    def _extract_state_code(self, href: str, text: str) -> Optional[str]:
        """Extract state code from URL or text"""
        # Common state abbreviation patterns
        state_codes = [
            'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
            'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
            'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
            'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
            'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
        ]

        combined = f"{href} {text}".upper()

        for code in state_codes:
            if code in combined:
                return code

        # Try to extract from domain
        domain = urlparse(href).netloc.upper()
        for code in state_codes:
            if code in domain:
                return code

        return None

    def _generate_registry_entries(self):
        """Generate registry entries from discovered resources"""
        logger.info("📝 Generating registry entries from discovered resources...")

        registry_entries = []

        # Merge NAIC and USA.gov data with discovered resources
        all_states = set(self.naic_states.keys()) | set(self.usa_gov_states.keys()) | \
                    set(r['state_code'] for r in self.discovered_resources)

        for state_code in all_states:
            # Get base information
            naic_info = self.naic_states.get(state_code, {})
            usa_gov_info = self.usa_gov_states.get(state_code, {})

            # Find discovered resources
            discovered = next((r for r in self.discovered_resources
                             if r['state_code'] == state_code), {})

            # Build URL string
            urls = []
            if naic_info.get('doi_home'):
                urls.append(f"doi_home={naic_info['doi_home']}")
            if usa_gov_info.get('portal_home'):
                urls.append(f"portal={usa_gov_info['portal_home']}")

            # Add discovered URLs
            for key, url in discovered.get('discovered_urls', {}).items():
                urls.append(f"{key}={url}")

            # Create registry entry
            entry = {
                'Category': 'State DOI',
                'Source': f'STATE_{state_code}',
                'DatasetScope': 'DOI guidance; external review decisions; consumer appeals resources; statutes and regulations',
                'Format': 'HTML/PDF; CSV where available',
                'HowToDownload': 'Crawl HTML pages; download data files; respect robots.txt',
                'URL': ' | '.join(urls) if urls else 'Discovery needed',
                'AutomationNotes': f'Capture decision outcomes, issues, plan types; state-specific appeals processes',
                'LicenseNotes': 'State open data / agency terms'
            }

            # Add specific notes for known strong states
            if state_code in ['CA', 'NY', 'TX', 'WA', 'MA', 'FL']:
                entry['AutomationNotes'] += f'; Priority state with known strong data sources'

            registry_entries.append(entry)

        self.registry_entries = registry_entries
        logger.info(f"📊 Generated {len(registry_entries)} state registry entries")

    async def _update_registry(self):
        """Update the Excel registry with discovered state resources"""
        logger.info("📝 Updating registry with discovered resources...")

        registry_path = "data/registry/wyng_llm_training_sources_expanded.xlsx"

        if not Path(registry_path).exists():
            logger.warning("Registry file not found, creating new one...")
            return

        # Read existing registry
        df_existing = pd.read_excel(registry_path, sheet_name='All Sources')

        # Remove old state entries
        df_filtered = df_existing[~df_existing['Source'].str.startswith('STATE_')]

        # Add new state entries
        df_states = pd.DataFrame(self.registry_entries)
        df_updated = pd.concat([df_filtered, df_states], ignore_index=True)

        # Write updated registry
        with pd.ExcelWriter(registry_path, engine='openpyxl') as writer:
            # All Sources sheet
            df_updated.to_excel(writer, sheet_name='All Sources', index=False)

            # Per-state sheets
            for entry in self.registry_entries:
                state_code = entry['Source'].replace('STATE_', '')
                df_state = pd.DataFrame([entry])
                df_state.to_excel(writer, sheet_name=f'STATE_{state_code}', index=False)

        # Also update CSV
        csv_path = registry_path.replace('.xlsx', '.csv')
        df_updated.to_csv(csv_path, index=False)

        logger.info(f"✅ Registry updated with {len(self.registry_entries)} state resources")