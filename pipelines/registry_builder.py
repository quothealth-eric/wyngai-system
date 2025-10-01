"""
Registry Builder - Convert JSON source definitions to Excel registry
"""

import json
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)

class RegistryBuilder:
    """Builds comprehensive source registry from JSON definitions"""

    def __init__(self):
        self.sources = []
        self.state_sources = []

    def build_registry(self, output_path: str = "data/registry/wyng_llm_training_sources_expanded.xlsx"):
        """Build complete registry with all sources"""
        logger.info("🏗️ Building comprehensive source registry...")

        # Load federal and national sources
        self._load_federal_sources()

        # Load payer sources
        self._load_payer_sources()

        # Load FOIA sources
        self._load_foia_sources()

        # Create Excel with multiple sheets
        self._write_excel_registry(output_path)

        logger.info(f"✅ Registry written to {output_path}")

    def _load_federal_sources(self):
        """Load federal regulatory and coding sources"""
        federal_sources = {
            "sources": [
                {
                    "Category": "Federal Regulations & Rulemaking",
                    "Source": "eCFR + GovInfo Bulk",
                    "DatasetScope": "29 CFR 2560.503-1 (ERISA claims); 45 CFR 147.136; 26 CFR 54.9815-2719; full titles via ECFR bulk XML",
                    "Format": "JSON API, HTML, XML bulk",
                    "HowToDownload": "Use eCFR REST for sections; GovInfo ECFR bulk XML for titles",
                    "URL": "https://www.ecfr.gov/developers/documentation/api/v1 | https://www.govinfo.gov/bulkdata/ECFR",
                    "AutomationNotes": "GET /api/v1/render/title-45/part-147/section-147.136; snapshot ECFR bulk monthly",
                    "LicenseNotes": "US Gov works"
                },
                {
                    "Category": "Federal Regulations & Rulemaking",
                    "Source": "Federal Register API",
                    "DatasetScope": "Rules/Notices (NSA, TiC, HIPAA) since 1994",
                    "Format": "JSON/CSV API",
                    "HowToDownload": "Query /api/v1/articles?conditions[term]=No%20Surprises%20Act&per_page=1000",
                    "URL": "https://www.federalregister.gov/developers/documentation/api/v1",
                    "AutomationNotes": "Store FR doc numbers and links",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Federal Regulations & Rulemaking",
                    "Source": "Regulations.gov API",
                    "DatasetScope": "Rulemaking dockets, comments (HHS/DOL/Treasury)",
                    "Format": "JSON API",
                    "HowToDownload": "Use v4 /documents?filter[searchTerm]=No%20Surprises",
                    "URL": "https://open.gsa.gov/api/regulationsgov/",
                    "AutomationNotes": "Rate-limit; fetch attachments",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Medicare Coverage & Policy",
                    "Source": "CMS Medicare Coverage Database (MCD)",
                    "DatasetScope": "NCDs/LCDs + related articles (current & retired)",
                    "Format": "CSV/ZIP, HTML",
                    "HowToDownload": "Download from MCD Downloads page; quarterly refresh",
                    "URL": "https://www.cms.gov/medicare-coverage-database/downloads/downloads.aspx",
                    "AutomationNotes": "Parse effective/retired dates; policy IDs",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Medicare Coverage & Policy",
                    "Source": "CMS Internet-Only Manuals (IOM)",
                    "DatasetScope": "Claims Processing (Pub 100-04), Benefit Policy (Pub 100-02), Program Integrity (Pub 100-08)",
                    "Format": "PDF",
                    "HowToDownload": "Crawl chapter PDFs; store transmittal IDs",
                    "URL": "https://www.cms.gov/medicare/regulations-guidance/manuals/internet-only-manuals-ioms",
                    "AutomationNotes": "PDF→text with layout aware parser; keep revision history",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Coding & Payment Standards",
                    "Source": "NCCI (PTP/MUE + Policy Manual)",
                    "DatasetScope": "Quarterly edits & annual policy manual",
                    "Format": "CSV/ZIP, PDF",
                    "HowToDownload": "Download latest PTP/MUE CSVs and manual",
                    "URL": "https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits",
                    "AutomationNotes": "Physician vs Facility sets; version tagging",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Code Systems & Terminologies",
                    "Source": "ICD-10-CM (CDC)",
                    "DatasetScope": "Diagnosis codes + guidelines",
                    "Format": "ZIP/XML/PDF",
                    "HowToDownload": "Download from CDC ICD-10-CM files",
                    "URL": "https://www.cdc.gov/nchs/icd/icd-10-cm/files.html",
                    "AutomationNotes": "Annual October release",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Code Systems & Terminologies",
                    "Source": "ICD-10-PCS (CMS)",
                    "DatasetScope": "Inpatient procedure codes + guidelines",
                    "Format": "ZIP/PDF",
                    "HowToDownload": "Download from CMS ICD-10 page",
                    "URL": "https://www.cms.gov/medicare/coding-billing/icd-10-codes",
                    "AutomationNotes": "Annual October release",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Code Systems & Terminologies",
                    "Source": "HCPCS Level II (CMS)",
                    "DatasetScope": "Quarterly HCPCS updates",
                    "Format": "CSV/Excel/ZIP",
                    "HowToDownload": "Download quarterly files",
                    "URL": "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update",
                    "AutomationNotes": "Map to fee schedules later",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Code Systems & Terminologies (Licensed)",
                    "Source": "SNOMED CT US (via UMLS)",
                    "DatasetScope": "US Edition SNOMED CT; mappings to ICD‑10‑CM",
                    "Format": "RF2",
                    "HowToDownload": "Obtain UMLS license, then download US Edition",
                    "URL": "https://www.nlm.nih.gov/healthit/snomedct/us_edition.html | https://uts.nlm.nih.gov/uts/signup-login",
                    "AutomationNotes": "Gate behind UMLS creds; respect license",
                    "LicenseNotes": "License required (UMLS)"
                },
                {
                    "Category": "Code Systems & Terminologies",
                    "Source": "LOINC",
                    "DatasetScope": "LOINC terms, Parts; Users' Guide",
                    "Format": "ZIP/CSV; FHIR API",
                    "HowToDownload": "Download current release; optional FHIR API",
                    "URL": "https://loinc.org/downloads/",
                    "AutomationNotes": "Track release version; Part.csv for components",
                    "LicenseNotes": "Free with terms"
                },
                {
                    "Category": "No Surprises Act (NSA) – Federal IDR",
                    "Source": "CMS NSA Reports & Public Use Files",
                    "DatasetScope": "Quarterly IDR outcomes + PUFs",
                    "Format": "CSV/XLSX, PDF",
                    "HowToDownload": "Download from CMS NSA reports page",
                    "URL": "https://www.cms.gov/nosurprises/policies-and-resources/reports",
                    "AutomationNotes": "Join on CPT/HCPCS where available",
                    "LicenseNotes": "Public domain"
                },
                {
                    "Category": "Price Transparency",
                    "Source": "Hospital Price Transparency (45 CFR 180)",
                    "DatasetScope": "Machine-readable standard charge files",
                    "Format": "CSV/JSON per hospital",
                    "HowToDownload": "Discover hospital MRF index/root TXT; download JSON/CSV",
                    "URL": "https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency/hospitals",
                    "AutomationNotes": "Validate schema; normalize to Parquet",
                    "LicenseNotes": "Public info"
                },
                {
                    "Category": "Price Transparency",
                    "Source": "Transparency in Coverage (TiC) MRFs",
                    "DatasetScope": "In-network rates; OON allowed amounts (monthly)",
                    "Format": "Sharded JSON",
                    "HowToDownload": "Locate payer MRF index; stream to Parquet",
                    "URL": "https://www.cms.gov/priorities/healthplan-price-transparency/overview/use-pricing-information-published-under-transparency-coverage-final-rule",
                    "AutomationNotes": "Distributed fetch; downselect by codes/providers",
                    "LicenseNotes": "Public info"
                },
                {
                    "Category": "Case Law",
                    "Source": "CourtListener / RECAP",
                    "DatasetScope": "ERISA benefit denial cases; opinions+dockets",
                    "Format": "Bulk CSV/JSON; REST API",
                    "HowToDownload": "Use bulk or REST; filter §502(a)(1)(B)",
                    "URL": "https://www.courtlistener.com/help/api/bulk-data/",
                    "AutomationNotes": "Join RECAP PDFs; store citations",
                    "LicenseNotes": "Open data; terms apply"
                }
            ]
        }

        self.sources.extend(federal_sources["sources"])

    def _load_payer_sources(self):
        """Load payer medical policy libraries"""
        payer_sources = [
            {
                "Category": "Payer Medical Policies",
                "Source": "UnitedHealthcare Policies",
                "DatasetScope": "Clinical policies, coverage determinations, prior auth requirements",
                "Format": "HTML/PDF",
                "HowToDownload": "Crawl policy library; respect robots.txt",
                "URL": "https://www.uhcprovider.com/en/policies-protocols.html",
                "AutomationNotes": "Track policy IDs, effective dates, revision history",
                "LicenseNotes": "Public access; ToS apply"
            },
            {
                "Category": "Payer Medical Policies",
                "Source": "Aetna Clinical Policy Bulletins (CPB)",
                "DatasetScope": "Medical necessity criteria, coverage policies",
                "Format": "HTML/PDF",
                "HowToDownload": "Crawl CPB library; respect robots.txt",
                "URL": "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins/medical-clinical-policy-bulletins.html",
                "AutomationNotes": "Parse CPB numbers, categories, effective dates",
                "LicenseNotes": "Public access; ToS apply"
            },
            {
                "Category": "Payer Medical Policies",
                "Source": "Cigna Coverage/Payment Policies",
                "DatasetScope": "Coverage position statements, medical necessity",
                "Format": "HTML/PDF",
                "HowToDownload": "Crawl policy index; respect robots.txt",
                "URL": "https://static.cigna.com/assets/chcp/resourceLibrary/coveragePolicies/index.html",
                "AutomationNotes": "Track policy codes, specialties, updates",
                "LicenseNotes": "Public access; ToS apply"
            },
            {
                "Category": "Payer Medical Policies",
                "Source": "Elevance/Anthem Clinical UM Guidelines",
                "DatasetScope": "Utilization management, prior authorization criteria",
                "Format": "HTML/PDF",
                "HowToDownload": "Crawl guidelines library; respect robots.txt",
                "URL": "https://www.anthem.com/provider/policies/clinical-guidelines/",
                "AutomationNotes": "Parse UM categories, approval criteria",
                "LicenseNotes": "Public access; ToS apply"
            }
        ]

        self.sources.extend(payer_sources)

    def _load_foia_sources(self):
        """Load FOIA and public records sources"""
        foia_sources = [
            {
                "Category": "FOIA / Public Records",
                "Source": "Federal FOIA API",
                "DatasetScope": "Agency components, FOIA contacts, processing data",
                "Format": "JSON API",
                "HowToDownload": "Query /api/agency_components/",
                "URL": "https://www.foia.gov/developer/",
                "AutomationNotes": "Build agency request templates",
                "LicenseNotes": "Public domain"
            },
            {
                "Category": "FOIA / Public Records",
                "Source": "NFOIC State Public Records",
                "DatasetScope": "State public records laws, contact information",
                "Format": "HTML/PDF",
                "HowToDownload": "Crawl state law summaries",
                "URL": "https://www.nfoic.org/state-freedom-of-information-laws/",
                "AutomationNotes": "Extract request procedures, fees, timelines",
                "LicenseNotes": "Public information"
            }
        ]

        self.sources.extend(foia_sources)

    def _generate_state_seed_sources(self):
        """Generate state-specific source templates"""
        state_seeds = [
            {
                "state_code": "CA",
                "doi_home": "https://www.dmhc.ca.gov",
                "imr_data": "https://data.chhs.ca.gov/dataset/independent-medical-review-imr-determinations-trend",
                "notes": "Strong IMR open data; DMHC coverage decisions"
            },
            {
                "state_code": "NY",
                "doi_home": "https://www.dfs.ny.gov",
                "external_appeals": "https://www.dfs.ny.gov/complaints/file_external_appeal",
                "notes": "DFS external appeals database; searchable decisions"
            },
            {
                "state_code": "TX",
                "doi_home": "https://www.tdi.texas.gov",
                "iro_decisions": "https://www.tdi.texas.gov/hmo/mcqa/iro_decisions.html",
                "notes": "TDI IRO decisions; HMO quality assurance"
            },
            {
                "state_code": "WA",
                "doi_home": "https://www.insurance.wa.gov",
                "notes": "OIC appeals resources and consumer guidance"
            },
            {
                "state_code": "MA",
                "doi_home": "https://www.mass.gov/orgs/office-of-patient-protection",
                "external_review": "https://www.mass.gov/request-an-external-review-of-a-health-insurance-decision",
                "notes": "OPP external review program"
            },
            {
                "state_code": "FL",
                "doi_home": "https://floir.com",
                "filings": "https://irfssearch.fldfs.com/",
                "public_records": "https://floir.com/resources-and-reports/public-records-requests",
                "notes": "OIR filings search; public records system"
            }
        ]

        # Convert to registry format
        for seed in state_seeds:
            source_entry = {
                "Category": "State DOI",
                "Source": f"STATE_{seed['state_code']}",
                "DatasetScope": f"DOI guidance; external review decisions; consumer appeals resources",
                "Format": "HTML/PDF; CSV where available",
                "HowToDownload": "Crawl HTML pages; download data files; respect robots",
                "URL": f"doi_home={seed['doi_home']}",
                "AutomationNotes": f"Capture decision outcomes, issues, plan types; {seed.get('notes', '')}",
                "LicenseNotes": "State open data / agency terms"
            }

            # Add specific URLs if available
            if "imr_data" in seed:
                source_entry["URL"] += f" | imr_csv={seed['imr_data']}"
            if "external_appeals" in seed:
                source_entry["URL"] += f" | appeals={seed['external_appeals']}"
            if "iro_decisions" in seed:
                source_entry["URL"] += f" | iro={seed['iro_decisions']}"

            self.state_sources.append(source_entry)

    def _write_excel_registry(self, output_path: str):
        """Write comprehensive Excel registry with multiple sheets"""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        # Generate state sources
        self._generate_state_seed_sources()

        # Create master dataframe
        all_sources = self.sources + self.state_sources
        df_all = pd.DataFrame(all_sources)

        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            # All Sources sheet
            df_all.to_excel(writer, sheet_name='All Sources', index=False)

            # Category-specific sheets
            categories = df_all['Category'].unique()
            for category in categories:
                df_category = df_all[df_all['Category'] == category]
                sheet_name = category.replace('/', '_').replace(' ', '_')[:31]  # Excel sheet name limit
                df_category.to_excel(writer, sheet_name=sheet_name, index=False)

            # Per-state sheets for state sources
            state_df = pd.DataFrame(self.state_sources)
            if not state_df.empty:
                for _, row in state_df.iterrows():
                    state_code = row['Source'].replace('STATE_', '')
                    df_state = pd.DataFrame([row])
                    df_state.to_excel(writer, sheet_name=f'STATE_{state_code}', index=False)

        # Also save as CSV
        csv_path = output_path.replace('.xlsx', '.csv')
        df_all.to_csv(csv_path, index=False)

        logger.info(f"📊 Registry contains {len(all_sources)} sources across {len(categories)} categories")
        logger.info(f"📊 State sources: {len(self.state_sources)} seed entries")