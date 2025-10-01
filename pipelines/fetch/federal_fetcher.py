"""
Federal Data Fetcher - Fetch federal regulatory and healthcare data
"""

import asyncio
import aiohttp
import json
import csv
import zipfile
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional, Any
import logging
from datetime import datetime, timedelta
import hashlib
import xml.etree.ElementTree as ET
from urllib.parse import urljoin
import os

logger = logging.getLogger(__name__)

class FederalDataFetcher:
    """Fetches federal regulatory and healthcare data sources"""

    def __init__(self, output_dir: str = "warehouse/bronze"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = None
        self.fetch_results = []

    async def fetch_all(self, source_filter: Optional[str] = None, dry_run: bool = False):
        """Fetch all federal data sources"""
        logger.info("📥 Starting federal data fetching pipeline...")

        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=300),
            headers={'User-Agent': 'WyngAI/1.0 Healthcare Research Bot'}
        ) as session:
            self.session = session

            # Define fetching tasks
            fetch_tasks = [
                self._fetch_ecfr_data,
                self._fetch_federal_register,
                self._fetch_regulations_gov,
                self._fetch_cms_mcd,
                self._fetch_cms_iom,
                self._fetch_ncci_data,
                self._fetch_icd10_codes,
                self._fetch_hcpcs_codes,
                self._fetch_loinc_data,
                self._fetch_nsa_reports,
                self._fetch_courtlistener_data
            ]

            # Filter tasks if specific source requested
            if source_filter:
                fetch_tasks = [task for task in fetch_tasks if source_filter.lower() in task.__name__.lower()]

            # Execute fetching tasks
            for task in fetch_tasks:
                try:
                    if dry_run:
                        logger.info(f"🔍 [DRY RUN] Would execute: {task.__name__}")
                        continue

                    logger.info(f"📥 Executing: {task.__name__}")
                    await task()
                    await asyncio.sleep(2)  # Be respectful with rate limiting

                except Exception as e:
                    logger.error(f"❌ Error in {task.__name__}: {e}")
                    self.fetch_results.append({
                        'task': task.__name__,
                        'status': 'error',
                        'error': str(e),
                        'timestamp': datetime.now().isoformat()
                    })

        self._save_fetch_report()
        logger.info(f"✅ Federal data fetching completed. Results: {len(self.fetch_results)}")

    async def _fetch_ecfr_data(self):
        """Fetch key eCFR sections for healthcare regulations"""
        logger.info("📋 Fetching eCFR healthcare regulations...")

        # Key healthcare regulation sections
        sections = [
            # ERISA claims procedures
            {'title': 29, 'part': 2560, 'section': '2560.503-1'},
            # ACA external review
            {'title': 45, 'part': 147, 'section': '147.136'},
            # Internal Revenue Code health provisions
            {'title': 26, 'part': 54, 'section': '54.9815-2719'},
            # HIPAA privacy rule
            {'title': 45, 'part': 164, 'section': '164.524'},
            # Hospital price transparency
            {'title': 45, 'part': 180, 'section': '180.50'}
        ]

        fetched_sections = []

        for section_info in sections:
            try:
                # Construct eCFR API URL
                url = f"https://www.ecfr.gov/api/versioner/v1/full/{section_info['title']}/CFR"

                async with self.session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()

                        # Save raw JSON
                        output_file = self.output_dir / f"ecfr_title_{section_info['title']}_part_{section_info['part']}.json"
                        with open(output_file, 'w') as f:
                            json.dump(data, f, indent=2)

                        fetched_sections.append({
                            'title': section_info['title'],
                            'part': section_info['part'],
                            'section': section_info.get('section'),
                            'file': str(output_file),
                            'size_kb': output_file.stat().st_size / 1024
                        })

                        logger.info(f"✅ Fetched eCFR Title {section_info['title']} Part {section_info['part']}")

                await asyncio.sleep(1)  # Rate limiting

            except Exception as e:
                logger.error(f"❌ Error fetching eCFR section {section_info}: {e}")

        self.fetch_results.append({
            'source': 'eCFR',
            'status': 'completed',
            'sections_fetched': len(fetched_sections),
            'sections': fetched_sections,
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_federal_register(self):
        """Fetch Federal Register documents related to healthcare"""
        logger.info("📋 Fetching Federal Register healthcare documents...")

        # Search terms for healthcare regulations
        search_terms = [
            "No Surprises Act",
            "Transparency in Coverage",
            "Hospital Price Transparency",
            "External Review",
            "ERISA claims"
        ]

        all_documents = []

        for term in search_terms:
            try:
                # Federal Register API search
                url = f"https://www.federalregister.gov/api/v1/articles"
                params = {
                    'conditions[term]': term,
                    'per_page': 100,
                    'order': 'newest',
                    'conditions[publication_date][gte]': '2020-01-01'  # Last 4 years
                }

                async with self.session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        documents = data.get('results', [])

                        for doc in documents:
                            all_documents.append({
                                'document_number': doc.get('document_number'),
                                'title': doc.get('title'),
                                'publication_date': doc.get('publication_date'),
                                'agencies': doc.get('agencies', []),
                                'type': doc.get('type'),
                                'html_url': doc.get('html_url'),
                                'pdf_url': doc.get('pdf_url'),
                                'search_term': term
                            })

                        logger.info(f"✅ Found {len(documents)} documents for '{term}'")

                await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"❌ Error searching Federal Register for '{term}': {e}")

        # Save consolidated results
        if all_documents:
            output_file = self.output_dir / "federal_register_healthcare_docs.json"
            with open(output_file, 'w') as f:
                json.dump(all_documents, f, indent=2)

            # Also save as CSV for easy analysis
            df = pd.DataFrame(all_documents)
            csv_file = self.output_dir / "federal_register_healthcare_docs.csv"
            df.to_csv(csv_file, index=False)

        self.fetch_results.append({
            'source': 'Federal Register',
            'status': 'completed',
            'documents_found': len(all_documents),
            'search_terms': search_terms,
            'output_file': str(output_file) if all_documents else None,
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_regulations_gov(self):
        """Fetch regulations.gov dockets and comments"""
        logger.info("📋 Fetching Regulations.gov healthcare dockets...")

        # Note: Regulations.gov API requires API key for full access
        # This is a simplified implementation for publicly available data

        search_terms = [
            "No Surprises Act",
            "Price Transparency",
            "External Review",
            "Health Insurance"
        ]

        dockets_found = []

        for term in search_terms:
            try:
                # Regulations.gov search (public endpoint)
                url = "https://api.regulations.gov/v4/documents"
                params = {
                    'filter[searchTerm]': term,
                    'filter[documentType]': 'Rule',
                    'page[size]': 25
                }

                headers = {
                    'X-API-Key': os.getenv('REGULATIONS_GOV_API_KEY', 'DEMO_KEY')
                }

                async with self.session.get(url, params=params, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        documents = data.get('data', [])

                        for doc in documents:
                            attrs = doc.get('attributes', {})
                            dockets_found.append({
                                'document_id': doc.get('id'),
                                'title': attrs.get('title'),
                                'docket_id': attrs.get('docketId'),
                                'document_type': attrs.get('documentType'),
                                'agency_id': attrs.get('agencyId'),
                                'posted_date': attrs.get('postedDate'),
                                'search_term': term
                            })

                        logger.info(f"✅ Found {len(documents)} dockets for '{term}'")

                await asyncio.sleep(2)  # Respect rate limits

            except Exception as e:
                logger.error(f"❌ Error searching Regulations.gov for '{term}': {e}")

        # Save results
        if dockets_found:
            output_file = self.output_dir / "regulations_gov_healthcare_dockets.json"
            with open(output_file, 'w') as f:
                json.dump(dockets_found, f, indent=2)

        self.fetch_results.append({
            'source': 'Regulations.gov',
            'status': 'completed',
            'dockets_found': len(dockets_found),
            'search_terms': search_terms,
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_cms_mcd(self):
        """Fetch CMS Medicare Coverage Database"""
        logger.info("📋 Fetching CMS Medicare Coverage Database...")

        # CMS MCD download page URLs
        mcd_urls = [
            'https://www.cms.gov/medicare-coverage-database/downloads/ncd-downloads.aspx',
            'https://www.cms.gov/medicare-coverage-database/downloads/lcd-downloads.aspx'
        ]

        for url in mcd_urls:
            try:
                async with self.session.get(url) as response:
                    if response.status == 200:
                        # This would need HTML parsing to find actual download links
                        # For now, we'll create a placeholder structure
                        coverage_type = 'NCD' if 'ncd' in url else 'LCD'

                        placeholder_file = self.output_dir / f"cms_mcd_{coverage_type.lower()}_placeholder.json"
                        placeholder_data = {
                            'source': f'CMS MCD {coverage_type}',
                            'url': url,
                            'note': 'Requires HTML parsing to extract actual download links',
                            'status': 'placeholder_created',
                            'timestamp': datetime.now().isoformat()
                        }

                        with open(placeholder_file, 'w') as f:
                            json.dump(placeholder_data, f, indent=2)

                        logger.info(f"✅ Created placeholder for CMS MCD {coverage_type}")

            except Exception as e:
                logger.error(f"❌ Error accessing CMS MCD {url}: {e}")

        self.fetch_results.append({
            'source': 'CMS MCD',
            'status': 'placeholder',
            'note': 'Requires HTML parsing implementation for actual data extraction',
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_cms_iom(self):
        """Fetch CMS Internet-Only Manuals"""
        logger.info("📋 Fetching CMS Internet-Only Manuals...")

        # Key IOM publications
        iom_manuals = [
            {'pub': '100-02', 'name': 'Medicare Benefit Policy Manual'},
            {'pub': '100-04', 'name': 'Medicare Claims Processing Manual'},
            {'pub': '100-08', 'name': 'Medicare Program Integrity Manual'}
        ]

        for manual in iom_manuals:
            try:
                # Create placeholder for IOM manual structure
                manual_file = self.output_dir / f"cms_iom_{manual['pub'].replace('-', '_')}_placeholder.json"
                manual_data = {
                    'publication': manual['pub'],
                    'name': manual['name'],
                    'base_url': 'https://www.cms.gov/medicare/regulations-guidance/manuals/internet-only-manuals-ioms',
                    'note': 'Requires PDF chapter enumeration and download',
                    'status': 'placeholder_created',
                    'timestamp': datetime.now().isoformat()
                }

                with open(manual_file, 'w') as f:
                    json.dump(manual_data, f, indent=2)

                logger.info(f"✅ Created placeholder for IOM {manual['pub']}")

            except Exception as e:
                logger.error(f"❌ Error processing IOM {manual['pub']}: {e}")

        self.fetch_results.append({
            'source': 'CMS IOM',
            'status': 'placeholder',
            'manuals': len(iom_manuals),
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_ncci_data(self):
        """Fetch NCCI (National Correct Coding Initiative) data"""
        logger.info("📋 Fetching NCCI data...")

        # NCCI edit files are available quarterly
        ncci_base_url = "https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits"

        try:
            # Create placeholder for NCCI data structure
            ncci_file = self.output_dir / "ncci_edits_placeholder.json"
            ncci_data = {
                'source': 'NCCI PTP/MUE Edits',
                'base_url': ncci_base_url,
                'quarterly_files': [
                    'Practitioner PTP Edits',
                    'Outpatient PTP Edits',
                    'MUE Values',
                    'NCCI Policy Manual'
                ],
                'note': 'Requires quarterly CSV/ZIP file enumeration and download',
                'status': 'placeholder_created',
                'timestamp': datetime.now().isoformat()
            }

            with open(ncci_file, 'w') as f:
                json.dump(ncci_data, f, indent=2)

            logger.info("✅ Created placeholder for NCCI data")

        except Exception as e:
            logger.error(f"❌ Error processing NCCI data: {e}")

        self.fetch_results.append({
            'source': 'NCCI',
            'status': 'placeholder',
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_icd10_codes(self):
        """Fetch ICD-10-CM and ICD-10-PCS codes"""
        logger.info("📋 Fetching ICD-10 codes...")

        icd_sources = [
            {
                'type': 'ICD-10-CM',
                'url': 'https://www.cdc.gov/nchs/icd/icd-10-cm/files.html',
                'description': 'Diagnosis codes from CDC'
            },
            {
                'type': 'ICD-10-PCS',
                'url': 'https://www.cms.gov/medicare/coding-billing/icd-10-codes',
                'description': 'Procedure codes from CMS'
            }
        ]

        for source in icd_sources:
            try:
                # Create placeholder for ICD-10 data
                icd_file = self.output_dir / f"{source['type'].lower().replace('-', '_')}_placeholder.json"
                icd_data = {
                    'type': source['type'],
                    'url': source['url'],
                    'description': source['description'],
                    'annual_release': 'October',
                    'note': 'Requires ZIP file enumeration and extraction',
                    'status': 'placeholder_created',
                    'timestamp': datetime.now().isoformat()
                }

                with open(icd_file, 'w') as f:
                    json.dump(icd_data, f, indent=2)

                logger.info(f"✅ Created placeholder for {source['type']}")

            except Exception as e:
                logger.error(f"❌ Error processing {source['type']}: {e}")

        self.fetch_results.append({
            'source': 'ICD-10 Codes',
            'status': 'placeholder',
            'types': ['ICD-10-CM', 'ICD-10-PCS'],
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_hcpcs_codes(self):
        """Fetch HCPCS Level II codes"""
        logger.info("📋 Fetching HCPCS codes...")

        try:
            hcpcs_url = "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update"

            # Create placeholder for HCPCS data
            hcpcs_file = self.output_dir / "hcpcs_level_ii_placeholder.json"
            hcpcs_data = {
                'source': 'HCPCS Level II',
                'url': hcpcs_url,
                'update_frequency': 'Quarterly',
                'formats': ['CSV', 'Excel', 'ZIP'],
                'note': 'Requires quarterly file enumeration and download',
                'status': 'placeholder_created',
                'timestamp': datetime.now().isoformat()
            }

            with open(hcpcs_file, 'w') as f:
                json.dump(hcpcs_data, f, indent=2)

            logger.info("✅ Created placeholder for HCPCS codes")

        except Exception as e:
            logger.error(f"❌ Error processing HCPCS codes: {e}")

        self.fetch_results.append({
            'source': 'HCPCS Level II',
            'status': 'placeholder',
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_loinc_data(self):
        """Fetch LOINC terminology (with terms acceptance check)"""
        logger.info("📋 Fetching LOINC data...")

        # Check for LOINC terms acceptance
        if not os.getenv('LOINC_TERMS_ACCEPTED') == 'true':
            logger.warning("⚠️ LOINC terms not accepted - skipping download")
            self.fetch_results.append({
                'source': 'LOINC',
                'status': 'skipped',
                'reason': 'Terms not accepted (set LOINC_TERMS_ACCEPTED=true)',
                'timestamp': datetime.now().isoformat()
            })
            return

        try:
            loinc_url = "https://loinc.org/downloads/"

            # Create placeholder for LOINC data
            loinc_file = self.output_dir / "loinc_terminology_placeholder.json"
            loinc_data = {
                'source': 'LOINC',
                'url': loinc_url,
                'license_status': 'Terms accepted',
                'formats': ['ZIP/CSV', 'FHIR API'],
                'note': 'Requires release version identification and download',
                'status': 'placeholder_created',
                'timestamp': datetime.now().isoformat()
            }

            with open(loinc_file, 'w') as f:
                json.dump(loinc_data, f, indent=2)

            logger.info("✅ Created placeholder for LOINC data")

        except Exception as e:
            logger.error(f"❌ Error processing LOINC data: {e}")

        self.fetch_results.append({
            'source': 'LOINC',
            'status': 'placeholder',
            'license_check': 'passed',
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_nsa_reports(self):
        """Fetch No Surprises Act IDR reports and public use files"""
        logger.info("📋 Fetching NSA IDR reports...")

        try:
            nsa_url = "https://www.cms.gov/nosurprises/policies-and-resources/reports"

            # Create placeholder for NSA data
            nsa_file = self.output_dir / "nsa_idr_reports_placeholder.json"
            nsa_data = {
                'source': 'NSA IDR Reports',
                'url': nsa_url,
                'frequency': 'Quarterly',
                'formats': ['CSV/XLSX', 'PDF'],
                'data_types': ['IDR outcomes', 'Public use files', 'Summary reports'],
                'note': 'Requires quarterly report enumeration and download',
                'status': 'placeholder_created',
                'timestamp': datetime.now().isoformat()
            }

            with open(nsa_file, 'w') as f:
                json.dump(nsa_data, f, indent=2)

            logger.info("✅ Created placeholder for NSA IDR data")

        except Exception as e:
            logger.error(f"❌ Error processing NSA data: {e}")

        self.fetch_results.append({
            'source': 'NSA IDR Reports',
            'status': 'placeholder',
            'timestamp': datetime.now().isoformat()
        })

    async def _fetch_courtlistener_data(self):
        """Fetch ERISA case law from CourtListener"""
        logger.info("📋 Fetching ERISA case law from CourtListener...")

        try:
            # CourtListener API for ERISA benefit denial cases
            base_url = "https://www.courtlistener.com/api/rest/v3/search/"

            # Search for ERISA section 502(a)(1)(B) cases
            params = {
                'q': 'ERISA 502(a)(1)(B) benefit denial',
                'type': 'o',  # Opinions
                'filed_after': '2020-01-01',
                'format': 'json'
            }

            async with self.session.get(base_url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    results = data.get('results', [])

                    # Save case law results
                    if results:
                        case_file = self.output_dir / "erisa_case_law.json"
                        with open(case_file, 'w') as f:
                            json.dump(results, f, indent=2)

                        logger.info(f"✅ Found {len(results)} ERISA cases")

                    self.fetch_results.append({
                        'source': 'CourtListener ERISA',
                        'status': 'completed',
                        'cases_found': len(results),
                        'timestamp': datetime.now().isoformat()
                    })

                else:
                    logger.warning(f"CourtListener API returned {response.status}")
                    self.fetch_results.append({
                        'source': 'CourtListener ERISA',
                        'status': 'error',
                        'error': f'API returned {response.status}',
                        'timestamp': datetime.now().isoformat()
                    })

        except Exception as e:
            logger.error(f"❌ Error fetching CourtListener data: {e}")
            self.fetch_results.append({
                'source': 'CourtListener ERISA',
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })

    def _save_fetch_report(self):
        """Save comprehensive fetch report"""
        report_file = self.output_dir / "federal_fetch_report.json"

        report = {
            'pipeline': 'Federal Data Fetcher',
            'execution_time': datetime.now().isoformat(),
            'total_sources': len(self.fetch_results),
            'results': self.fetch_results,
            'summary': {
                'completed': len([r for r in self.fetch_results if r.get('status') == 'completed']),
                'placeholder': len([r for r in self.fetch_results if r.get('status') == 'placeholder']),
                'errors': len([r for r in self.fetch_results if r.get('status') == 'error']),
                'skipped': len([r for r in self.fetch_results if r.get('status') == 'skipped'])
            }
        }

        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)

        logger.info(f"📊 Fetch report saved to {report_file}")
        logger.info(f"📊 Summary: {report['summary']}")