# License Gates - Healthcare Data Sources

## Overview
This document outlines licensing requirements and access controls for various healthcare data sources used in the WyngAI training pipeline.

## Public Domain Sources (No Gates)
✅ **Freely Available**
- Federal regulations (eCFR, Federal Register)
- CMS manuals and guidance
- ICD-10-CM/PCS codes (CDC/CMS)
- HCPCS Level II codes (CMS)
- State statutes and regulations
- Court decisions and case law
- NSA IDR public use files
- Hospital and TiC price transparency data

## Licensed Sources (Gated)

### SNOMED CT US Edition
🔒 **License Required: UMLS**
- **Source**: NLM UMLS Metathesaurus
- **License URL**: https://uts.nlm.nih.gov/uts/signup-login
- **Requirements**:
  - UMLS account registration
  - Annual license agreement
  - Attribution requirements
- **Environment Variable**: `UMLS_API_KEY`
- **Gate Implementation**: Check for valid UMLS credentials before downloading
- **Usage**: Medical concept mappings, clinical terminologies

### LOINC
⚠️ **Terms Required**
- **Source**: Regenstrief Institute
- **License URL**: https://loinc.org/license/
- **Requirements**:
  - Accept LOINC License Agreement
  - Attribution in derived works
- **Environment Variable**: `LOINC_TERMS_ACCEPTED=true`
- **Gate Implementation**: Require explicit terms acceptance flag

### CPT® Codes (Currently Excluded)
❌ **Commercial License Required - NOT IMPLEMENTED**
- **Source**: American Medical Association (AMA)
- **License**: Commercial license required for use
- **Status**: Excluded from current implementation
- **Alternative**: Use only publicly available HCPCS codes
- **Future Implementation**: Would require AMA licensing agreement

### AAPC Content (Currently Excluded)
❌ **Commercial License Required - NOT IMPLEMENTED**
- **Source**: American Academy of Professional Coders
- **License**: Commercial license required
- **Status**: Excluded from current implementation
- **Alternative**: Use public coding resources and CMS guidance

### X12 Implementation Guides (Currently Excluded)
❌ **Commercial License Required - NOT IMPLEMENTED**
- **Source**: Accredited Standards Committee X12
- **License**: Commercial license required for full implementation guides
- **Status**: Excluded from current implementation
- **Alternative**: Use publicly available transaction standards documentation

## Reddit Data
⚠️ **Terms of Service Compliance Required**
- **Source**: Reddit Data API
- **Requirements**:
  - OAuth authentication
  - Compliance with Reddit Terms of Service
  - Data Use Policy compliance
- **Environment Variables**:
  - `REDDIT_OAUTH_TOKEN`
  - `REDDIT_TERMS_ACCEPTED=true`
- **Implementation**: De-identified taxonomy only, no personal data storage

## Implementation Guidelines

### Environment Configuration
```bash
# Required for licensed sources
export UMLS_API_KEY="your_umls_key"
export LOINC_TERMS_ACCEPTED=true
export REDDIT_OAUTH_TOKEN="your_oauth_token"
export REDDIT_TERMS_ACCEPTED=true

# Feature flags for excluded sources
export ENABLE_CPT_CODES=false
export ENABLE_AAPC_CONTENT=false
export ENABLE_X12_GUIDES=false
```

### Code Implementation Pattern
```python
def fetch_licensed_source(source_name: str):
    if source_name == "SNOMED":
        if not os.getenv("UMLS_API_KEY"):
            raise LicenseError("UMLS license required for SNOMED access")

    elif source_name == "LOINC":
        if not os.getenv("LOINC_TERMS_ACCEPTED") == "true":
            raise LicenseError("LOINC terms acceptance required")

    elif source_name in ["CPT", "AAPC", "X12"]:
        if not os.getenv(f"ENABLE_{source_name}_CODES") == "true":
            raise LicenseError(f"{source_name} requires commercial license (not implemented)")
```

### Compliance Checks
- Automated license validation before data access
- Clear documentation of licensing requirements
- Fallback to public alternatives where possible
- Attribution tracking in generated content

## Training Data Guidelines

### Permissible for Training
✅ Can be included in training datasets:
- All public domain federal/state sources
- SNOMED CT (with UMLS license)
- LOINC (with terms acceptance)
- De-identified Reddit question patterns

### Excluded from Training
❌ Cannot be included without additional licensing:
- CPT® code descriptions (AMA copyright)
- AAPC proprietary content
- X12 implementation guide text
- Personal information from any source

### Citation Requirements
- All generated responses must include authoritative citations
- Attribution must reference original source and licensing
- Commercial content must be clearly marked if used

## Audit Trail
- Log all license checks and access attempts
- Track source attribution in generated content
- Maintain compliance documentation
- Regular review of licensing terms and updates

## Contact Information
- UMLS Licensing: custhelp@nlm.nih.gov
- LOINC Licensing: loinc@regenstrief.org
- Reddit API: redditdev@reddit.com

## Updates
This document should be reviewed quarterly and updated when:
- New data sources are added
- Licensing terms change
- New commercial agreements are established
- Compliance requirements are updated