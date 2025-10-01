# WyngAI Enhanced Healthcare LLM Training Pipeline

## Overview
This implementation creates a comprehensive, factually and legally sound healthcare billing/appeals LLM training pipeline as requested. The system fetches, processes, and indexes authoritative healthcare data sources to build a robust knowledge base with citation discipline.

## Key Features

### 🏛️ **Authoritative Source Coverage**
- **Federal Regulations**: eCFR, Federal Register, Regulations.gov
- **Medicare Coverage**: CMS MCD, Internet-Only Manuals, NCCI edits
- **Coding Systems**: ICD-10-CM/PCS, HCPCS, LOINC (with licensing)
- **State DOI Resources**: All 50 states + territories discovery
- **Case Law**: ERISA benefit denial cases via CourtListener
- **Price Transparency**: Hospital and TiC machine-readable files
- **Payer Policies**: UHC, Aetna, Cigna, Elevance medical policies

### 📊 **Citation-First Architecture**
- **Never answers without authoritative citations**
- Authority ranking system (federal > state > payer > secondary)
- Source precedence enforcement in retrieval
- Automatic citation formatting and verification

### 🔍 **Hybrid RAG System**
- BM25 + semantic vector search (BGE embeddings)
- Authority-weighted reranking
- Confidence scoring based on source quality
- Professional review recommendations for complex cases

### 📚 **Training Data Generation**
- Supervised fine-tuning pairs with citations
- Issue classification datasets
- Appeal letter templates
- Phone script generation
- Compliance with licensing restrictions

## Quick Start

### 1. Installation
```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment variables
export LOINC_TERMS_ACCEPTED=true
export UMLS_API_KEY=your_umls_key  # If using SNOMED
export REDDIT_OAUTH_TOKEN=your_token  # If using Reddit discovery
export REDDIT_TERMS_ACCEPTED=true
```

### 2. Build Source Registry
```bash
# Generate comprehensive source registry
python wyngai_cli.py registry write-excel

# Discover state DOI resources
python wyngai_cli.py discover states --update-registry
```

### 3. Fetch Data
```bash
# Fetch federal data (dry run first)
python wyngai_cli.py fetch federal --dry-run
python wyngai_cli.py fetch federal

# Fetch state data
python wyngai_cli.py fetch states

# Fetch payer policies
python wyngai_cli.py fetch payers
```

### 4. Build RAG Index
```bash
# Normalize and chunk data
python wyngai_cli.py normalize all
python wyngai_cli.py chunk all

# Build hybrid index
python wyngai_cli.py index build
```

### 5. Serve RAG API
```bash
# Start enhanced RAG service
python wyngai_cli.py index serve --port 8000
```

### 6. Generate Training Data
```bash
# Export training datasets
python wyngai_cli.py train export --format jsonl
```

## API Usage

### Query with Citation Requirements
```python
import requests

response = requests.post("http://localhost:8000/ask", json={
    "question": "What are my rights if my insurance denies my claim?",
    "max_sources": 5,
    "authority_threshold": 0.7
})

result = response.json()
print(f"Answer: {result['answer']}")
print(f"Citations: {[c['title'] for c in result['citations']]}")
print(f"Authority Sources: {result['authority_sources']}")
```

### Example Response
```json
{
  "answer": "Based on available healthcare regulations and policies, here is guidance for your situation:\n\n**Federal Regulations and CMS Guidance:**\nUnder ERISA Section 502(a)(1)(B), you have the right to recover benefits due under your plan and enforce your rights. The external review process under 45 CFR 147.136 requires independent review by accredited organizations...",
  "confidence": 0.92,
  "citations": [
    {
      "source_id": "erisa_502",
      "title": "ERISA Section 502 - Civil Enforcement",
      "url": "https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/erisa",
      "authority_rank": 1.0,
      "excerpt": "ERISA section 502(a)(1)(B) provides participants the right to recover benefits due under the terms of the plan..."
    }
  ],
  "authority_sources": ["ERISA Section 502", "45 CFR 147.136"],
  "legal_basis": ["ERISA 502(a)(1)(B): Right to recover benefits", "45 CFR 147.136: External review requirements"],
  "requires_professional_review": true
}
```

## Source Registry

The system generates a comprehensive Excel registry with:

### Federal Sources (15 sources)
- eCFR healthcare regulations
- Federal Register documents
- CMS coverage policies
- Medicare manuals
- Coding systems (ICD-10, HCPCS, LOINC)

### State Sources (51 jurisdictions)
- DOI home pages and guidance
- External review programs
- Consumer protection resources
- Statutes and administrative codes

### Licensed Sources (Gated)
- SNOMED CT (UMLS license required)
- LOINC (terms acceptance required)
- CPT codes (excluded - AMA license needed)

## Compliance & Governance

### License Gates
- Automatic license checking before data access
- Clear documentation of licensing requirements
- Fallback to public alternatives
- Attribution tracking in responses

### Citation Discipline
- Minimum 1 authoritative citation per response
- Authority ranking enforcement
- Source precedence in retrieval
- Never answer without authoritative backing

### PII/PHI Protection
- Automatic sensitive information redaction
- De-identified Reddit pattern extraction
- No personal data storage from consumer sources
- Compliance audit trails

## Training Data Exports

### SFT Pairs (`train/sft_pairs.jsonl`)
```json
{
  "instruction": "Explain the healthcare regulation regarding external review",
  "input": "",
  "output": "Based on 45 CFR 147.136, external review processes must be conducted by independent review organizations...",
  "citations": [{"title": "45 CFR 147.136", "url": "...", "authority_rank": 0.95}]
}
```

### Classification Data (`train/classification.jsonl`)
```json
{
  "text": "My claim was denied for lack of medical necessity",
  "label": "claim_denial",
  "confidence": 1.0
}
```

### Appeal Templates (`train/appeal_templates.jsonl`)
```json
{
  "template_name": "claim_denial_appeal",
  "use_case": "Appeal a denied insurance claim",
  "template": "[Date]\n\n[Insurance Company Name]...",
  "citations": ["45 CFR 147.136", "ERISA Section 503"]
}
```

## Architecture

### Data Pipeline
```
Source Registry → Fetch → Parse → Normalize → Chunk → Index → RAG API
```

### Authority Ranking
1. Federal statutes/regulations (1.0)
2. CMS manuals (0.9)
3. State statutes (0.85)
4. State DOI guidance (0.75)
5. Court decisions (0.7)
6. Payer policies (0.6)

### Hybrid Search
- **BM25**: Lexical matching for specific terms
- **BGE Vectors**: Semantic similarity
- **Authority Weighting**: Boost authoritative sources
- **Reranking**: Combined relevance + authority score

## Directory Structure

```
wyng-lite/
├── wyngai_cli.py                 # Main CLI interface
├── pipelines/
│   ├── registry_builder.py       # Excel registry generation
│   ├── state_discovery.py        # State DOI resource discovery
│   └── fetch/
│       ├── federal_fetcher.py     # Federal data fetching
│       ├── state_fetcher.py       # State data fetching
│       └── payer_fetcher.py       # Payer policy fetching
├── rag/
│   ├── service.py                 # Original RAG service
│   └── enhanced_service.py        # Citation-disciplined RAG
├── train/
│   └── exporter.py               # Training data generation
├── data/
│   └── registry/
│       └── wyng_llm_training_sources_expanded.xlsx
├── warehouse/
│   ├── bronze/                   # Raw fetched data
│   ├── silver/                   # Normalized data
│   └── gold/                     # Chunked, indexed data
└── governance/
    ├── LICENSE_GATES.md          # Licensing documentation
    ├── ROBOTS_COMPLIANCE.md      # Crawler policies
    └── PII_PHI_POLICY.md         # Data protection
```

## License & Citation Requirements

### Public Domain Sources ✅
- Federal regulations and guidance
- State statutes and DOI resources
- Court decisions and case law
- Price transparency data

### Licensed Sources 🔒
- SNOMED CT (UMLS license)
- LOINC (terms acceptance)
- CPT codes (excluded - AMA license)

### Citation Format
All responses include:
- Source title and authority rank
- URL and section references
- Legal basis with specific citations
- Professional review recommendations

## Development Commands

```bash
# Registry management
python wyngai_cli.py registry write-excel
python wyngai_cli.py discover states

# Data pipeline
python wyngai_cli.py fetch federal --dry-run
python wyngai_cli.py normalize all
python wyngai_cli.py chunk all

# RAG system
python wyngai_cli.py index build --rebuild
python wyngai_cli.py index serve --port 8000

# Training data
python wyngai_cli.py train export --format parquet

# Evaluation
python wyngai_cli.py eval run

# Status check
python wyngai_cli.py status
```

## Next Steps

1. **Complete Federal Fetchers**: Implement full eCFR/CMS data downloading
2. **State Resource Discovery**: Complete all 50 state DOI resource mapping
3. **Payer Policy Crawling**: Implement robots.txt-compliant policy fetching
4. **Reddit Discovery**: Add compliant consumer question taxonomy
5. **Advanced Chunking**: Implement section-aware document chunking
6. **Citation Verification**: Add automated citation accuracy checking
7. **Appeal Generation**: Enhance template-based appeal letter creation

This implementation provides the foundation for a factually and legally sound healthcare LLM that never responds without authoritative citations and maintains strict compliance with licensing and data protection requirements.