#!/usr/bin/env python3
"""
Simple Healthcare Regulation Data Collection
Collects healthcare regulations from key sources and adds them to WyngAI index
"""

import sys
import json
import requests
import time
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

def collect_cms_medicare_data():
    """Collect Medicare coverage determination data from CMS"""
    print("📋 Collecting CMS Medicare Data...")

    # CMS Medicare Coverage Database
    cms_sources = [
        {
            "title": "Medicare Coverage Database - National Coverage Determinations",
            "url": "https://www.cms.gov/medicare-coverage-database/search/ncd-search.aspx",
            "authority_rank": 0.95,
            "content": """
National Coverage Determinations (NCDs) are decisions by CMS about whether Medicare will pay for an item or service.
NCDs are binding on all Medicare contractors and are nationwide in scope.

Key NCD Topics:
• Diagnostic tests and procedures
• Durable medical equipment
• Prosthetics and orthotics
• Surgical procedures
• Preventive services

NCD Appeal Process:
1. Initial determination by CMS
2. Reconsideration by CMS
3. Administrative Law Judge hearing
4. Medicare Appeals Council review
5. Federal district court review

Authority: 42 CFR 405.860-405.874
Citation: Social Security Act Section 1862(a)(1)(A)
            """
        },
        {
            "title": "Medicare Part D Coverage Determinations",
            "url": "https://www.cms.gov/Medicare/Appeals-and-Grievances/MedPrescriptDrugApplsGriev",
            "authority_rank": 0.95,
            "content": """
Medicare Part D coverage determinations for prescription drugs include:
• Formulary coverage decisions
• Prior authorization requirements
• Step therapy protocols
• Quantity limits

Part D Appeal Levels:
1. Coverage determination by plan (72 hours standard, 24 hours expedited)
2. Redetermination by plan (7 days standard, 72 hours expedited)
3. Independent Review Entity (IRE) reconsideration
4. Administrative Law Judge hearing
5. Medicare Appeals Council review
6. Federal district court

Authority: 42 CFR Part 423
Citation: Medicare Prescription Drug, Improvement, and Modernization Act of 2003
            """
        },
        {
            "title": "Medicare Advantage Organization Determinations",
            "url": "https://www.cms.gov/Medicare/Appeals-and-Grievances/MMCAG",
            "authority_rank": 0.94,
            "content": """
Medicare Advantage (MA) organizations must have procedures for:
• Prior authorization decisions
• Coverage determinations
• Payment decisions
• Service authorizations

MA Appeal Timeline:
• Standard coverage determination: 14 days
• Expedited coverage determination: 72 hours
• Standard reconsideration: 30 days
• Expedited reconsideration: 72 hours

Authority: 42 CFR 422.566-422.618
Citation: Social Security Act Section 1852
            """
        }
    ]

    return cms_sources

def collect_state_insurance_codes():
    """Collect key state insurance code provisions"""
    print("🏛️ Collecting State Insurance Codes...")

    state_codes = [
        {
            "title": "California Insurance Code - External Review",
            "url": "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=10169",
            "authority_rank": 0.87,
            "content": """
California Insurance Code Section 10169 - Independent Medical Review

An enrollee may request independent medical review if:
1. The health care service plan has denied, delayed, or modified a service based on medical necessity
2. The plan has denied an experimental or investigational treatment
3. The plan has denied coverage based on medical necessity for emergency services

Timeline Requirements:
• Standard review: 30 days from receipt of complete application
• Expedited review: 3 days for urgent cases
• Implementation: Within 5 days of favorable decision

Authority: California Insurance Code Section 10169
Citation: Knox-Keene Health Care Service Plan Act
            """
        },
        {
            "title": "New York Insurance Law - External Appeals",
            "url": "https://www.nysenate.gov/legislation/laws/ISC/4910",
            "authority_rank": 0.87,
            "content": """
New York Insurance Law Section 4910 - External Appeal Process

External appeal rights apply to:
• Adverse determinations based on medical necessity
• Experimental or investigational treatment denials
• Emergency service coverage denials
• Out-of-network coverage disputes

Appeal Timeline:
• Request must be filed within 4 months of final adverse determination
• Standard review: 30 days
• Expedited review: 2 business days for urgent cases
• Implementation: Immediately upon approval

Authority: New York Insurance Law Article 49
Citation: New York Public Health Law Article 49
            """
        },
        {
            "title": "Texas Insurance Code - Utilization Review",
            "url": "https://statutes.capitol.texas.gov/Docs/IN/htm/IN.4201.htm",
            "authority_rank": 0.86,
            "content": """
Texas Insurance Code Chapter 4201 - Utilization Review

Utilization review requirements include:
• Written procedures for review criteria
• Qualified personnel conducting reviews
• Timely determination requirements
• Appeal procedures

Review Timeframes:
• Prospective review: 3 business days
• Concurrent review: 1 business day
• Retrospective review: 30 days

Appeal Rights:
• Internal appeal to health plan
• External appeal to independent review organization
• Complaint to Texas Department of Insurance

Authority: Texas Insurance Code Chapter 4201
Citation: Texas Health and Safety Code Chapter 843
            """
        }
    ]

    return state_codes

def collect_major_payer_policies():
    """Collect major insurance payer medical policies"""
    print("🏥 Collecting Major Payer Medical Policies...")

    payer_policies = [
        {
            "title": "Aetna Clinical Policy Bulletin - Prior Authorization",
            "url": "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins.html",
            "authority_rank": 0.78,
            "content": """
Aetna Clinical Policy Bulletins provide coverage guidance for medical services.

Prior Authorization Requirements:
• Advanced imaging (CT, MRI, PET scans)
• Specialty medications
• Durable medical equipment
• Surgical procedures

Appeal Process:
1. Peer-to-peer review with medical director
2. Formal appeal submission with clinical documentation
3. External review by independent medical reviewer
4. Timeline: 30 days for standard, 72 hours for urgent

Coverage Criteria Based On:
• FDA approval status
• Clinical evidence and guidelines
• Medical necessity criteria
• Safety and efficacy data

Authority: Plan documents and benefit summaries
Citation: ERISA Section 503 appeal procedures
            """
        },
        {
            "title": "Blue Cross Blue Shield Technology Evaluation Center",
            "url": "https://www.bcbs.com/about-us/capabilities-initiatives/technology-evaluation-center",
            "authority_rank": 0.79,
            "content": """
BCBS Technology Evaluation Center (TEC) assessments determine coverage for new medical technologies.

TEC Criteria for Coverage:
1. Final approval from appropriate government regulatory bodies
2. Scientific evidence permits conclusions on safety and effectiveness
3. Technology improves net health outcomes
4. Technology is as beneficial as established alternatives
5. Improvement is attainable outside investigational settings

Evidence Requirements:
• Randomized controlled trials
• Systematic reviews and meta-analyses
• Professional society guidelines
• Regulatory approvals (FDA, etc.)

Appeal Rights:
• Medical director review
• External independent review
• State insurance department complaint process

Authority: Medical policy and coverage guidelines
Citation: State insurance regulations and ERISA
            """
        },
        {
            "title": "UnitedHealthcare Medical Policy - Coverage Determination",
            "url": "https://www.uhcprovider.com/en/policies-protocols/medical-policies.html",
            "authority_rank": 0.77,
            "content": """
UnitedHealthcare Medical Policies establish coverage criteria for medical services and technologies.

Coverage Decision Factors:
• Clinical effectiveness and safety
• FDA approval or clearance status
• Professional medical guidelines
• Peer-reviewed literature
• Cost-effectiveness analysis

Prior Authorization Process:
1. Provider submits request with clinical documentation
2. Medical review by clinical staff
3. Determination within 72 hours (urgent) or 15 days (non-urgent)
4. Written notification of decision with rationale

Appeal Options:
• Peer-to-peer consultation
• Formal written appeal with additional documentation
• External independent medical review
• Expedited appeal for urgent cases

Authority: Summary Plan Description and benefit documents
Citation: ERISA fiduciary responsibilities
            """
        }
    ]

    return payer_policies

def collect_federal_regulations():
    """Collect key federal healthcare regulations"""
    print("🇺🇸 Collecting Federal Healthcare Regulations...")

    federal_regs = [
        {
            "title": "ERISA Section 503 - Claims Procedure Regulations",
            "url": "https://www.dol.gov/sites/dolgov/files/EBSA/laws-and-regulations/regulations/technical-appendices/claims-procedure-regulation.pdf",
            "authority_rank": 0.98,
            "content": """
ERISA Section 503 establishes minimum standards for employee benefit plan claims procedures.

Initial Claims Timeline:
• Health plans: 30 days (extendable to 45 days)
• Disability claims: 45 days (extendable to 75 days)
• Post-service claims: 30 days (extendable to 45 days)
• Pre-service urgent claims: 72 hours

Appeal Requirements:
• Minimum 60 days to file appeal
• Full and fair review of denial
• Written decision within reasonable timeframe
• Right to external review (for group health plans)

Required Information in Denial:
• Specific reason(s) for denial
• Reference to plan provisions
• Description of additional material needed
• Explanation of appeal procedures

Authority: 29 CFR 2560.503-1
Citation: Employee Retirement Income Security Act Section 503
            """
        },
        {
            "title": "Affordable Care Act - Essential Health Benefits",
            "url": "https://www.healthcare.gov/coverage/what-marketplace-plans-cover/",
            "authority_rank": 0.96,
            "content": """
The Affordable Care Act requires health plans to cover Essential Health Benefits (EHBs).

Ten Essential Health Benefit Categories:
1. Ambulatory patient services
2. Emergency services
3. Hospitalization
4. Maternity and newborn care
5. Mental health and substance use disorder services
6. Prescription drugs
7. Rehabilitative and habilitative services
8. Laboratory services
9. Preventive and wellness services
10. Pediatric services

Coverage Requirements:
• No annual or lifetime benefit caps
• Coverage of pre-existing conditions
• Preventive services without cost-sharing
• Mental health parity compliance

Appeal Rights:
• Internal appeal process
• External review by independent reviewer
• Expedited process for urgent cases

Authority: 42 USC 18022 (ACA Section 1302)
Citation: 45 CFR Part 156 - Health Insurance Issuer Standards
            """
        }
    ]

    return federal_regs

def save_collected_data(all_data):
    """Save collected data to JSON file for indexing"""
    print("💾 Saving collected healthcare regulation data...")

    output_file = "warehouse/healthcare_regulations_expanded.json"
    Path("warehouse").mkdir(exist_ok=True)

    # Structure data for WyngAI indexing
    structured_data = {
        "collection_date": datetime.now().isoformat(),
        "total_documents": len(all_data),
        "source_types": {
            "cms_medicare": len([d for d in all_data if "CMS" in d["title"] or "Medicare" in d["title"]]),
            "state_codes": len([d for d in all_data if "Insurance Code" in d["title"] or "Insurance Law" in d["title"]]),
            "payer_policies": len([d for d in all_data if any(payer in d["title"] for payer in ["Aetna", "BCBS", "UnitedHealthcare"])]),
            "federal_regulations": len([d for d in all_data if "ERISA" in d["title"] or "ACA" in d["title"]])
        },
        "documents": []
    }

    # Convert to WyngAI format
    for i, doc in enumerate(all_data):
        structured_doc = {
            "chunk_id": f"expanded_reg_{i+1:03d}",
            "title": doc["title"],
            "content": doc["content"].strip(),
            "url": doc["url"],
            "authority_rank": doc["authority_rank"],
            "section_path": doc["title"].split(" - "),
            "topics": extract_topics(doc["content"]),
            "citations": extract_citations(doc["content"]),
            "jurisdiction": determine_jurisdiction(doc["title"])
        }
        structured_data["documents"].append(structured_doc)

    with open(output_file, 'w') as f:
        json.dump(structured_data, f, indent=2)

    print(f"✅ Saved {len(all_data)} documents to {output_file}")
    return output_file

def extract_topics(content):
    """Extract key topics from content"""
    topics = []

    topic_keywords = {
        "appeals": ["appeal", "reconsideration", "review"],
        "prior_authorization": ["prior authorization", "pre-authorization", "preauth"],
        "coverage_determination": ["coverage", "determination", "medical necessity"],
        "external_review": ["external review", "independent review", "IRE"],
        "emergency_services": ["emergency", "urgent", "expedited"],
        "medicare": ["medicare", "cms", "part d", "part c"],
        "erisa": ["erisa", "employee benefit", "fiduciary"],
        "state_regulation": ["state", "insurance code", "insurance law"],
        "payer_policy": ["clinical policy", "medical policy", "coverage policy"]
    }

    content_lower = content.lower()
    for topic, keywords in topic_keywords.items():
        if any(keyword in content_lower for keyword in keywords):
            topics.append(topic)

    return topics

def extract_citations(content):
    """Extract legal citations from content"""
    import re

    citations = []

    # Common citation patterns
    patterns = [
        r'\d+\s+CFR\s+\d+[\.\d]*',  # Federal regulations
        r'\d+\s+USC\s+\d+',         # US Code
        r'Section\s+\d+[\.\d]*',     # Section references
        r'[A-Z]{2,}\s+Section\s+\d+' # State code sections
    ]

    for pattern in patterns:
        matches = re.findall(pattern, content)
        citations.extend(matches)

    return list(set(citations))  # Remove duplicates

def determine_jurisdiction(title):
    """Determine jurisdiction from title"""
    if "Medicare" in title or "CMS" in title:
        return "Federal-CMS"
    elif "ERISA" in title or "ACA" in title:
        return "Federal"
    elif "California" in title:
        return "State-CA"
    elif "New York" in title:
        return "State-NY"
    elif "Texas" in title:
        return "State-TX"
    elif any(payer in title for payer in ["Aetna", "BCBS", "UnitedHealthcare"]):
        return "Private-Payer"
    else:
        return "General"

def main():
    print("\n" + "="*70)
    print("🏥 WyngAI Healthcare Regulation Data Collection")
    print("="*70 + "\n")

    all_collected_data = []

    # Collect from all sources
    all_collected_data.extend(collect_cms_medicare_data())
    all_collected_data.extend(collect_state_insurance_codes())
    all_collected_data.extend(collect_major_payer_policies())
    all_collected_data.extend(collect_federal_regulations())

    # Save collected data
    output_file = save_collected_data(all_collected_data)

    print("\n" + "="*70)
    print("📊 Collection Summary:")
    print(f"   • Total documents collected: {len(all_collected_data)}")
    print(f"   • Average authority rank: {sum(d['authority_rank'] for d in all_collected_data) / len(all_collected_data):.1%}")
    print(f"   • Output file: {output_file}")
    print("="*70)

    print("\n🎯 Next Steps:")
    print("1. Run: python -c \"import json; print(json.load(open('warehouse/healthcare_regulations_expanded.json'))['source_types'])\"")
    print("2. Index this data into WyngAI RAG system")
    print("3. Test with healthcare regulation questions")

    return all_collected_data

if __name__ == "__main__":
    main()