# WyngAI - Healthcare LLM Training Infrastructure

> **Internal AI capability for Wyng (Quot Health)** - Build healthcare billing/appeals LLM specialized for U.S. rules, payer policies, and claims outcomes.

## Overview

WyngAI is a comprehensive data pipeline and training infrastructure designed to create healthcare-specialized language models without depending on external AI services. The system fetches authoritative healthcare data sources, normalizes them into consistent schemas, builds searchable RAG indices, and generates training datasets for fine-tuning LLMs on healthcare billing and appeals processes.

## Key Features

- **🗃️ Source Registry**: 25+ authoritative healthcare data sources with automated Excel/CSV export
- **📥 Data Fetchers**: Automated collection from eCFR, Federal Register, CMS databases, and payer policies
- **🔄 Data Normalization**: Consistent JSONL schema with robust metadata and versioning
- **🔍 RAG System**: Hybrid lexical + vector search with citation discipline and precedence awareness
- **🎯 Training Data**: Supervised pairs and template generation for LoRA fine-tuning
- **🛡️ Compliance**: PII/PHI scrubbing, licensing gates, and point-in-time versioning

## Quick Start

### Prerequisites

- Python 3.11+
- Virtual environment (recommended)

### Installation

```bash
# Clone and navigate to the project
cd wyng-lite

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# Install WyngAI
pip install -e .
```

### Basic Usage

```bash
# View available commands
wyngai --help

# Run quick demo
wyngai demo

# Export source registry to Excel
wyngai write-excel

# Fetch key CFR sections
wyngai fetch-ecfr

# Fetch Federal Register documents (last 30 days)
wyngai fetch-fedreg --since-days 30

# Fetch all primary sources
wyngai fetch-all
```

## Architecture

### Directory Structure

```
wyng-lite/
├── src/wyngai/           # Core package
│   ├── fetch/            # Data fetchers
│   ├── parse/            # Data parsers
│   ├── normalize/        # Data normalizers
│   ├── chunk/            # Text chunkers
│   └── utils/            # Utilities
├── warehouse/            # Data storage
│   ├── bronze/           # Raw fetched data
│   ├── silver/           # Parsed data
│   └── gold/             # Normalized chunks
├── data/registry/        # Source registry exports
├── rag/                  # RAG service
├── train/                # Training datasets
├── tests/                # Test suite
└── governance/           # Compliance policies
```

### Data Schemas

#### DOC (Document Level)
- `doc_id`: Unique identifier
- `source_id`: Stable hash of URL/path
- `category`: Source category from registry
- `title`: Document title
- `doc_type`: law | reg | payer_policy | manual | court_opinion | appeal_decision | dataset_record
- `jurisdiction`: federal | state | payer | medicare
- `citation`: Legal citation (e.g., "45 CFR 147.136")
- `effective_date`: When document takes effect
- `version`: Document version identifier
- `text`: Full document text
- `checksum_sha256`: Content integrity hash
- `retrieval_priority`: Authority ranking (0-1)

#### CHUNK (Retrieval Unit)
- `chunk_id`: Unique identifier
- `doc_id`: Parent document reference
- `text`: Chunk content (800-2,000 tokens)
- `token_count`: Estimated tokens
- `embeddings`: Vector embeddings (optional)
- `headings`: Section headings
- `citations`: Referenced URIs/sections
- `authority_rank`: Precedence ranking
- `topics`: Extracted topic tags

## Data Sources

The system includes 25+ authoritative healthcare data sources across 7 categories:

### Federal Regulations & Rulemaking
- **eCFR (Electronic Code of Federal Regulations)**: Key sections including ERISA claims (29 CFR 2560.503-1), ACA appeals (45 CFR 147.136)
- **Federal Register API**: Rules, proposed rules, and notices since 1994
- **Regulations.gov API**: Dockets, supporting documents, and public comments

### Medicare Coverage & Policy
- **CMS Medicare Coverage Database**: NCDs, LCDs, and related articles
- **CMS Internet-Only Manuals**: Claims processing, benefit policy, program integrity
- **CMS Transmittals & MLN Matters**: Change requests and provider education

### Coding & Payment Standards
- **NCCI**: Procedure-to-procedure edits and MUEs
- **ICD-10-CM/PCS**: Diagnosis and procedure codes
- **HCPCS Level II**: Supplies and drugs codes
- **CPT (Licensed)**: Procedure codes and descriptors
- **X12 HIPAA (Licensed)**: EDI transaction standards

### Appeals Decisions & Outcomes
- **HHS Departmental Appeals Board**: Medicare Appeals Council decisions
- **Provider Reimbursement Review Board**: PRRB decisions and rulings
- **CourtListener/RECAP**: Federal ERISA benefit denial cases
- **State Appeals**: California DMHC IMR, New York DFS, Texas TDI

### Price Transparency Datasets
- **Hospital Price Transparency**: Machine-readable charge files per 45 CFR Part 180
- **Transparency in Coverage**: Payer negotiated rates and out-of-network amounts

### Payer Medical Policies
- **UnitedHealthcare**: Commercial and Medicare Advantage policies
- **Aetna**: Clinical Policy Bulletins (CPB)
- **Cigna**: Coverage and payment policies
- **Elevance/Anthem**: Clinical UM Guidelines

### No Surprises Act (NSA)
- **Federal IDR Reports**: Quarterly outcomes, selections, and award amounts

## CLI Commands

### Registry Management
```bash
wyngai write-excel [path]     # Export source registry to Excel
wyngai list-sources           # Show all sources in table format
wyngai list-categories        # Show source categories
```

### Data Fetching
```bash
wyngai fetch-ecfr [--sections="45-147-136,29-2560-503-1"]
wyngai fetch-fedreg [--since-days=30] [--fetch-content]
wyngai fetch-all              # Fetch from all primary sources
```

### Processing Pipeline
```bash
wyngai parse-ecfr             # Parse eCFR data to DOC format
wyngai normalize-all          # Normalize to standard schema
wyngai chunk-all              # Create retrieval chunks
```

### RAG System
```bash
wyngai index build           # Build hybrid search index
wyngai serve rag             # Start RAG API service
wyngai eval run              # Run evaluation suite
```

## Data Processing Pipeline

### 1. Fetch Raw Data
```python
from wyngai.fetch.ecfr import eCFRFetcher

fetcher = eCFRFetcher()
paths = fetcher.fetch_key_sections(Path("warehouse/bronze/ecfr"))
```

### 2. Parse to DOC Format
```python
from wyngai.parse.ecfr_parser import eCFRParser

parser = eCFRParser()
docs = parser.parse_directory(Path("warehouse/bronze/ecfr"))
```

### 3. Chunk for Retrieval
```python
from wyngai.chunk.hierarchical import HierarchicalChunker

chunker = HierarchicalChunker()
chunks = chunker.chunk_documents(docs)
```

## Authority Precedence

The system implements authority-based ranking for citation discipline:

1. **Federal statute/regulation** (1.0) - Highest authority
2. **CMS manuals/coverage** (0.8) - Official Medicare policy
3. **State statutes/regulations** (0.7) - State-level authority
4. **Court decisions (ERISA)** (0.5) - Legal precedent
5. **Payer policies** (0.4) - Plan-specific rules
6. **Secondary sources** (0.2) - Commentary/analysis

## Configuration

Key settings in `src/wyngai/utils/config.py`:

```python
# API endpoints
ecfr_api_base = "https://www.ecfr.gov/api/v1"
federal_register_api_base = "https://www.federalregister.gov/api/v1"

# Processing settings
max_chunk_tokens = 2000
min_chunk_tokens = 800
vector_dim = 768  # BGE embedding dimension

# Rate limiting
requests_per_minute = 60
concurrent_requests = 10
```

## Compliance & Safety

### Licensing Gates
- **CPT®**: Requires AMA license - excluded from training until acquired
- **X12**: Requires license - excluded from training until acquired
- **Payer Content**: Respects robots.txt and terms of service

### PII/PHI Protection
- Presidio-based detection and scrubbing
- No user-contributed text in training data
- Point-in-time snapshots with version control

### Data Integrity
- SHA256 checksums for all raw and processed data
- Audit trails with fetch timestamps and source URLs
- Duplicate detection based on content hashing

## Development

### Adding New Sources

1. **Update Registry**: Add entry to `src/wyngai/registry.py`
2. **Create Fetcher**: Implement fetcher in `src/wyngai/fetch/`
3. **Create Parser**: Implement parser in `src/wyngai/parse/`
4. **Add CLI Commands**: Update `src/wyngai/cli_simple.py`

### Running Tests
```bash
pytest tests/                 # Run test suite
pytest tests/test_fetchers.py # Test specific module
```

### Code Quality
```bash
ruff check src/              # Lint code
black src/                   # Format code
mypy src/                    # Type checking
```

## Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Source registry with Excel export
- [x] eCFR and Federal Register fetchers
- [x] Basic parsing and CLI interface
- [x] Pydantic schemas and data validation

### Phase 2: Advanced Processing 🔄
- [ ] Complete parser suite (MCD, NCCI, ICD, Appeals)
- [ ] Hierarchical chunking with metadata enrichment
- [ ] Authority-weighted hybrid search index
- [ ] FastAPI RAG service with citation discipline

### Phase 3: Training Pipeline 📋
- [ ] SFT pair generation for appeal letter writing
- [ ] Classification dataset for IMR/IDR outcomes
- [ ] LoRA fine-tuning infrastructure
- [ ] Model evaluation and benchmarking

### Phase 4: Production Systems 🚀
- [ ] Dockerized deployment
- [ ] Scheduled data refresh pipeline
- [ ] Monitoring and alerting
- [ ] API rate limiting and scaling

## License

This project is internal to Wyng (Quot Health). External data sources maintain their respective licenses and terms of use.

## Support

For questions or issues:
- Internal team: Use Slack #wyngai-dev
- Technical issues: Create GitHub issue
- Data licensing: Contact legal team

---

**🎯 Mission**: Build internal AI capability without external dependencies, specialized for healthcare billing and appeals, powered by authoritative U.S. healthcare data sources.