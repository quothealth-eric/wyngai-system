"""
Source registry management and Excel generation.
"""

import json
import pandas as pd
from pathlib import Path
from typing import Dict, List
from .schemas import SourceRegistry


# Source registry data
SOURCES_JSON = {
    "sources": [
        {
            "Category": "Federal Regulations & Rulemaking",
            "Source": "eCFR (Electronic Code of Federal Regulations)",
            "DatasetScope": "Full CFR; key sections: 29 CFR 2560.503-1 (ERISA claims), 45 CFR 147.136 (ACA appeals), 26 CFR 54.9815-2719",
            "Format": "JSON API, HTML; bulk XML via GPO",
            "HowToDownload": "Use eCFR REST API for sections; use govinfo bulk ECFR XML for full titles",
            "URL": "https://www.ecfr.gov/developers/documentation/api/v1 ; https://www.govinfo.gov/bulkdata/ECFR",
            "AutomationNotes": "Example GET: https://www.ecfr.gov/api/v1/render/title-45/part-147/section-147.136",
            "LicenseNotes": "US Gov works; verify currentness"
        },
        {
            "Category": "Federal Regulations & Rulemaking",
            "Source": "Federal Register API",
            "DatasetScope": "Rules, proposed rules, notices (NSA, TiC, HIPAA) since 1994",
            "Format": "JSON/CSV via API",
            "HowToDownload": "Search FR API for terms like 'No Surprises Act', 'Transparency in Coverage'",
            "URL": "https://www.federalregister.gov/developers/documentation/api/v1",
            "AutomationNotes": "e.g., /api/v1/articles?conditions[term]=No%20Surprises%20Act&per_page=1000",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Federal Regulations & Rulemaking",
            "Source": "Regulations.gov API",
            "DatasetScope": "Dockets, supporting docs, comments (HHS/DOL/Treasury)",
            "Format": "JSON API",
            "HowToDownload": "Use v4 API for documents & comments",
            "URL": "https://open.gsa.gov/api/regulationsgov/",
            "AutomationNotes": "Endpoint: /v4/documents?filter[searchTerm]=No%20Surprises",
            "LicenseNotes": "Public domain; rate limits apply"
        },
        {
            "Category": "Medicare Coverage & Policy",
            "Source": "CMS Medicare Coverage Database (MCD)",
            "DatasetScope": "NCDs, LCDs, related articles (current+retired)",
            "Format": "CSV/ZIP, HTML",
            "HowToDownload": "Use MCD Downloads page for NCD/LCD datasets + data dictionaries",
            "URL": "https://www.cms.gov/medicare-coverage-database/downloads/downloads.aspx",
            "AutomationNotes": "Refresh quarterly; parse IDs/effective dates",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Medicare Coverage & Policy",
            "Source": "CMS Internet-Only Manuals (IOM)",
            "DatasetScope": "Pub 100-04 Claims Processing, 100-02 Benefit Policy, 100-08 Program Integrity",
            "Format": "PDF per chapter",
            "HowToDownload": "Download chapters from IOM index pages",
            "URL": "https://www.cms.gov/medicare/regulations-guidance/manuals/internet-only-manuals-ioms",
            "AutomationNotes": "Track Transmittal IDs and revision history",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Medicare Coverage & Policy",
            "Source": "CMS Transmittals & MLN Matters",
            "DatasetScope": "Change Requests & provider education articles",
            "Format": "PDF",
            "HowToDownload": "Scrape transmittal index + MLN Matters PDFs",
            "URL": "https://www.cms.gov/medicare/regulations-guidance/transmittals",
            "AutomationNotes": "Capture CR#, effective date, impacted manual chapters",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Coding & Payment Standards",
            "Source": "NCCI (National Correct Coding Initiative)",
            "DatasetScope": "PTP edits, MUEs, Policy Manual",
            "Format": "CSV/ZIP; PDF",
            "HowToDownload": "Download quarterly CSVs and annual policy manual",
            "URL": "https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits",
            "AutomationNotes": "Separate Physician vs Facility sets",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Coding & Payment Standards",
            "Source": "ICD-10-CM (CDC)",
            "DatasetScope": "Diagnosis codes + guidelines",
            "Format": "ZIP (tabular/list), XML, PDF",
            "HowToDownload": "CDC ICD-10-CM files page",
            "URL": "https://www.cdc.gov/nchs/icd/icd-10-cm/files.html",
            "AutomationNotes": "Annual October release",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Coding & Payment Standards",
            "Source": "ICD-10-PCS (CMS)",
            "DatasetScope": "Inpatient procedure codes + guidelines",
            "Format": "ZIP/PDF",
            "HowToDownload": "CMS ICD-10-PCS page",
            "URL": "https://www.cms.gov/medicare/coding-billing/icd-10-codes",
            "AutomationNotes": "Annual October release",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Coding & Payment Standards",
            "Source": "HCPCS Level II (CMS)",
            "DatasetScope": "Supplies/drugs codes; quarterly updates",
            "Format": "CSV/Excel/ZIP",
            "HowToDownload": "CMS HCPCS quarterly updates",
            "URL": "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update",
            "AutomationNotes": "Parse descriptors; join to fee schedules later",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Coding & Payment Standards",
            "Source": "CPT (American Medical Association)",
            "DatasetScope": "CPT codes & descriptors",
            "Format": "Licensed data files",
            "HowToDownload": "License via AMA or authorized distributors",
            "URL": "https://www.ama-assn.org/topics/cpt-royalties-licenses",
            "AutomationNotes": "Do NOT train on CPT text until license acquired",
            "LicenseNotes": "Proprietary; license required"
        },
        {
            "Category": "Coding & Payment Standards",
            "Source": "X12 HIPAA Transactions (837/835/276/277)",
            "DatasetScope": "EDI implementation guides (005010)",
            "Format": "Licensed PDFs/online viewer",
            "HowToDownload": "Purchase via X12 (Glass); supplement with payer companion guides",
            "URL": "https://x12.org/products",
            "AutomationNotes": "Do NOT train on spec text without license",
            "LicenseNotes": "Proprietary; license required"
        },
        {
            "Category": "Appeals Decisions & Outcomes",
            "Source": "HHS Departmental Appeals Board – Medicare Appeals Council",
            "DatasetScope": "Significant decisions; issues/outcomes",
            "Format": "HTML/PDF",
            "HowToDownload": "Crawl decisions index; save HTML/PDF + metadata",
            "URL": "https://www.hhs.gov/about/agencies/dab/decisions/council-decisions/index.html",
            "AutomationNotes": "Capture docket, issue, outcome, dates",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Appeals Decisions & Outcomes",
            "Source": "Provider Reimbursement Review Board (PRRB)",
            "DatasetScope": "PRRB decisions & jurisdictional rulings",
            "Format": "HTML/PDF",
            "HowToDownload": "Crawl PRRB decisions list",
            "URL": "https://www.cms.gov/medicare/regulations-guidance/provider-reimbursement-review-board/list-prrb-decisions",
            "AutomationNotes": "Parse case metadata and outcomes",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Appeals Decisions & Outcomes",
            "Source": "CourtListener / RECAP",
            "DatasetScope": "Federal ERISA benefit denial cases; dockets & opinions",
            "Format": "Bulk CSV/JSON; REST API",
            "HowToDownload": "Use bulk data or REST API; filter §502(a)(1)(B)",
            "URL": "https://www.courtlistener.com/help/api/bulk-data/",
            "AutomationNotes": "Join with RECAP PDFs; store citations",
            "LicenseNotes": "Open data; see terms"
        },
        {
            "Category": "Appeals Decisions & Outcomes",
            "Source": "California DMHC – Independent Medical Review (IMR)",
            "DatasetScope": "IMR outcomes since 2001",
            "Format": "CSV via State Open Data; HTML",
            "HowToDownload": "Use data.chhs.ca.gov dataset/API",
            "URL": "https://data.chhs.ca.gov/dataset/independent-medical-review-imr-determinations-trend",
            "AutomationNotes": "Use API endpoint; consider historical snapshots",
            "LicenseNotes": "State open data"
        },
        {
            "Category": "Appeals Decisions & Outcomes",
            "Source": "New York DFS – External Appeals",
            "DatasetScope": "Searchable external appeal decisions",
            "Format": "HTML; PDF",
            "HowToDownload": "Scrape per decision; FOIL for bulk export",
            "URL": "https://www.dfs.ny.gov/complaints/file_external_appeal",
            "AutomationNotes": "Respect robots.txt and rate limits",
            "LicenseNotes": "State content; check ToS"
        },
        {
            "Category": "Appeals Decisions & Outcomes",
            "Source": "Texas Department of Insurance – IRO Decisions",
            "DatasetScope": "Independent Review Organization decisions",
            "Format": "HTML/PDF",
            "HowToDownload": "Scrape TDI IRO decisions pages",
            "URL": "https://www.tdi.texas.gov/hmo/mcqa/iro_decisions.html",
            "AutomationNotes": "Filter non-health-plan (e.g., workers' comp)",
            "LicenseNotes": "State content; check ToS"
        },
        {
            "Category": "Price Transparency Datasets",
            "Source": "Hospital Price Transparency (45 CFR Part 180)",
            "DatasetScope": "Machine-readable standard charge files per hospital",
            "Format": "CSV/JSON",
            "HowToDownload": "Discover MRF URLs via hospitals' required index; download & validate schema",
            "URL": "https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency/hospitals",
            "AutomationNotes": "Look for root TXT + CMS template JSON",
            "LicenseNotes": "Public info"
        },
        {
            "Category": "Price Transparency Datasets",
            "Source": "Transparency in Coverage (TiC) MRFs",
            "DatasetScope": "In-network negotiated rates; OON allowed amounts (monthly)",
            "Format": "JSON (very large, sharded)",
            "HowToDownload": "Locate payer MRF index pages; stream & convert to Parquet",
            "URL": "https://www.cms.gov/priorities/healthplan-price-transparency/overview/use-pricing-information-published-under-transparency-coverage-final-rule",
            "AutomationNotes": "Use distributed fetch; sample & downselect by service-codes",
            "LicenseNotes": "Public info"
        },
        {
            "Category": "Payer Medical Policies",
            "Source": "UnitedHealthcare Policy Library",
            "DatasetScope": "Commercial & MA medical/drug policies",
            "Format": "HTML/PDF",
            "HowToDownload": "Scrape policy pages & PDFs; store policy IDs + revision dates",
            "URL": "https://www.uhcprovider.com/en/policies-protocols.html",
            "AutomationNotes": "Capture archive links when available",
            "LicenseNotes": "Site ToS"
        },
        {
            "Category": "Payer Medical Policies",
            "Source": "Aetna Clinical Policy Bulletins (CPB)",
            "DatasetScope": "Coverage criteria across services",
            "Format": "HTML/PDF",
            "HowToDownload": "Crawl A–Z CPB index; fetch PDFs",
            "URL": "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins/medical-clinical-policy-bulletins.html",
            "AutomationNotes": "Store CPB number + last updated date",
            "LicenseNotes": "Site ToS"
        },
        {
            "Category": "Payer Medical Policies",
            "Source": "Cigna Coverage/Payment Policies",
            "DatasetScope": "Medical, behavioral, administrative policies",
            "Format": "HTML/PDF",
            "HowToDownload": "Crawl A–Z index pages; fetch PDFs",
            "URL": "https://static.cigna.com/assets/chcp/resourceLibrary/coveragePolicies/index.html",
            "AutomationNotes": "Include reimbursement/pmt policies",
            "LicenseNotes": "Site ToS"
        },
        {
            "Category": "Payer Medical Policies",
            "Source": "Elevance/Anthem Clinical UM Guidelines",
            "DatasetScope": "CG-* series (e.g., CG-SURG-XX)",
            "Format": "HTML/PDF",
            "HowToDownload": "Fetch individual policy pages",
            "URL": "https://www.anthem.com/provider/policies/clinical-guidelines/",
            "AutomationNotes": "Store code + revision history",
            "LicenseNotes": "Site ToS"
        },
        {
            "Category": "No Surprises Act (NSA)",
            "Source": "Federal IDR Reports & Public Use Files",
            "DatasetScope": "Quarterly outcomes, selections, award amounts",
            "Format": "CSV/XLSX, PDF",
            "HowToDownload": "Download PUFs and reports; parse CSV",
            "URL": "https://www.cms.gov/nosurprises/policies-and-resources/reports",
            "AutomationNotes": "Join on service codes; compute win rates",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "State DOI Regulations",
            "Source": "California Department of Insurance",
            "DatasetScope": "State insurance regulations, claims handling rules, appeals procedures (Title 10 CCR)",
            "Format": "PDF, HTML",
            "HowToDownload": "Scrape DOI regulation pages; parse PDF documents",
            "URL": "https://www.insurance.ca.gov/0250-insurers/0300-insurers/0100-applications/regulation-hearings/",
            "AutomationNotes": "Use StateDOIFetcher with state_code='CA'; track regulation numbers",
            "LicenseNotes": "State public domain"
        },
        {
            "Category": "State DOI Regulations",
            "Source": "New York Department of Financial Services",
            "DatasetScope": "NY insurance law, external appeals regulations, surprise billing rules",
            "Format": "PDF, HTML",
            "HowToDownload": "Fetch from DFS regulations and industry guidance pages",
            "URL": "https://www.dfs.ny.gov/legal/regulations",
            "AutomationNotes": "Use StateDOIFetcher with state_code='NY'; capture Part 216 external appeals",
            "LicenseNotes": "State public domain"
        },
        {
            "Category": "State DOI Regulations",
            "Source": "Texas Department of Insurance",
            "DatasetScope": "Texas Insurance Code regulations, HMO rules, external review procedures",
            "Format": "PDF, HTML",
            "HowToDownload": "Parse TDI rules and proposed regulations",
            "URL": "https://www.tdi.texas.gov/rules/",
            "AutomationNotes": "Use StateDOIFetcher with state_code='TX'; track Title 28 TAC rules",
            "LicenseNotes": "State public domain"
        },
        {
            "Category": "State DOI Regulations",
            "Source": "Multi-State DOI Comprehensive Collection",
            "DatasetScope": "Insurance regulations from all 50 states covering claims, appeals, network adequacy",
            "Format": "PDF, HTML",
            "HowToDownload": "Use automated StateDOIFetcher for systematic collection",
            "URL": "Various state DOI websites",
            "AutomationNotes": "Run StateDOIFetcher.fetch_all_states() with priority state list",
            "LicenseNotes": "State public domain"
        },
        {
            "Category": "Payer Medical Policies - Enhanced",
            "Source": "Blue Cross Blue Shield Association Plans",
            "DatasetScope": "Medical policies from major BCBS plans nationwide, technology evaluations",
            "Format": "PDF, HTML",
            "HowToDownload": "Use PayerPolicyFetcher with payer_code='BCBS' and state plan variations",
            "URL": "https://www.bcbs.com/providers/clinical-guidelines",
            "AutomationNotes": "Include state-specific BCBS plans (CA, NY, TX, FL); track TEC assessments",
            "LicenseNotes": "Proprietary - fair use for training"
        },
        {
            "Category": "Payer Medical Policies - Enhanced",
            "Source": "Humana Medicare Advantage Policies",
            "DatasetScope": "Medicare Advantage coverage policies, prior authorization criteria",
            "Format": "PDF, HTML",
            "HowToDownload": "Use PayerPolicyFetcher with payer_code='HUMANA' and policy_type=['medical', 'prior_auth']",
            "URL": "https://www.humana.com/provider/medical-resources/clinical-guidelines",
            "AutomationNotes": "Focus on Medicare Advantage specific policies and formularies",
            "LicenseNotes": "Proprietary - fair use for training"
        },
        {
            "Category": "Payer Medical Policies - Enhanced",
            "Source": "Kaiser Permanente Clinical Policies",
            "DatasetScope": "Integrated care model policies, technology assessments, HMO procedures",
            "Format": "PDF, HTML",
            "HowToDownload": "Use PayerPolicyFetcher with payer_code='KAISER'",
            "URL": "https://healthy.kaiserpermanente.org/providers/clinical-policies",
            "AutomationNotes": "Capture unique integrated delivery model policies",
            "LicenseNotes": "Proprietary - fair use for training"
        },
        {
            "Category": "Appeals & Legal Precedents",
            "Source": "Independent Review Organization (IRO) Decisions",
            "DatasetScope": "External review decisions, medical necessity determinations, appeal outcomes",
            "Format": "PDF, HTML",
            "HowToDownload": "Use AppealsHistoryFetcher with source_code='IRO_DECISIONS'",
            "URL": "https://www.dfs.ny.gov/consumers/health_insurance/external_appeal_decisions",
            "AutomationNotes": "Parse decision summaries, extract medical conditions and outcomes",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Appeals & Legal Precedents",
            "Source": "CourtListener Federal Court Decisions",
            "DatasetScope": "Federal court opinions on ERISA, healthcare appeals, insurance disputes",
            "Format": "JSON, PDF, HTML",
            "HowToDownload": "Use AppealsHistoryFetcher with source_code='COURTLISTENER'",
            "URL": "https://www.courtlistener.com/api/rest/v3/search/",
            "AutomationNotes": "Search for ERISA, health insurance, medical necessity cases; requires API key",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Appeals & Legal Precedents",
            "Source": "CMS Medicare Appeals Decisions",
            "DatasetScope": "Administrative Law Judge decisions, Medicare appeals board rulings",
            "Format": "PDF, HTML",
            "HowToDownload": "Use AppealsHistoryFetcher with source_code='CMS_APPEALS'",
            "URL": "https://www.cms.gov/medicare/appeals-and-grievances",
            "AutomationNotes": "Focus on ALJ decisions and coverage determination appeals",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Appeals & Legal Precedents",
            "Source": "Justia Legal Opinions Database",
            "DatasetScope": "State and federal court opinions on healthcare, insurance law",
            "Format": "HTML",
            "HowToDownload": "Use AppealsHistoryFetcher with source_code='JUSTIA'",
            "URL": "https://law.justia.com/cases/search/",
            "AutomationNotes": "Search terms: 'health insurance appeal', 'medical necessity', 'ERISA'",
            "LicenseNotes": "Public domain"
        },
        {
            "Category": "Appeals & Legal Precedents",
            "Source": "State Court Insurance Appeals",
            "DatasetScope": "State court decisions on insurance disputes, bad faith claims, coverage denials",
            "Format": "PDF, HTML",
            "HowToDownload": "Use AppealsHistoryFetcher with state-specific source codes",
            "URL": "Various state court systems",
            "AutomationNotes": "Target CA, NY, TX state courts; search insurance-related dockets",
            "LicenseNotes": "Public domain"
        }
    ]
}


class RegistryManager:
    """Manages source registry operations."""

    def __init__(self):
        self.sources = [SourceRegistry(**source) for source in SOURCES_JSON["sources"]]

    def to_dataframe(self) -> pd.DataFrame:
        """Convert sources to pandas DataFrame."""
        return pd.DataFrame([source.model_dump() for source in self.sources])

    def get_categories(self) -> List[str]:
        """Get unique categories from sources."""
        return list(set(source.category for source in self.sources))

    def filter_by_category(self, category: str) -> List[SourceRegistry]:
        """Filter sources by category."""
        return [source for source in self.sources if source.category == category]

    def write_excel(self, output_path: Path) -> None:
        """Write registry to Excel file with category sheets."""
        df = self.to_dataframe()

        # Rename columns for Excel display
        df_display = df.rename(columns={
            'category': 'Category',
            'source': 'Source',
            'dataset_scope': 'Dataset Scope',
            'format': 'Format',
            'how_to_download': 'How to Download',
            'url': 'URL',
            'automation_notes': 'Automation Notes',
            'license_notes': 'License Notes'
        })

        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            # All sources sheet
            df_display.to_excel(writer, sheet_name='All Sources', index=False)

            # Category-specific sheets
            for category in self.get_categories():
                category_df = df_display[df_display['Category'] == category]
                # Truncate sheet name if too long (Excel limit is 31 chars)
                sheet_name = category[:31] if len(category) > 31 else category
                category_df.to_excel(writer, sheet_name=sheet_name, index=False)

        print(f"Excel registry written to {output_path}")

    def write_csv(self, output_path: Path) -> None:
        """Write registry to CSV file."""
        df = self.to_dataframe()
        df.to_csv(output_path, index=False)
        print(f"CSV registry written to {output_path}")

    def get_source_by_name(self, name: str) -> SourceRegistry:
        """Get source by name."""
        for source in self.sources:
            if source.source.lower() == name.lower():
                return source
        raise ValueError(f"Source '{name}' not found in registry")

    def get_sources_by_category(self, category: str) -> List[SourceRegistry]:
        """Get sources by category."""
        return [source for source in self.sources if source.category == category]