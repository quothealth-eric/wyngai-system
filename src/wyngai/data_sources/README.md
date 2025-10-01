# WyngAI Data Expansion System

A comprehensive data expansion system for healthcare regulation datasets that fetches, parses, and indexes documents from multiple sources including state DOI regulations, insurance payer policies, and legal appeal decisions.

## Overview

The WyngAI Data Expansion System extends beyond federal regulations to include:

- **State DOI Regulations**: Insurance regulations from all 50 states covering claims handling, appeals procedures, network adequacy, and surprise billing protection
- **Payer Policies**: Medical policies and coverage guidelines from major insurance carriers (Aetna, BCBS, United, Cigna, Humana, etc.)
- **Appeal Decisions**: Historical appeal decisions and legal precedents from courts, IROs, and administrative bodies

## Architecture

### Core Components

1. **Fetchers** (`src/wyngai/data_sources/`)
   - `state_doi_fetcher.py` - Fetches state DOI regulations
   - `payer_policy_fetcher.py` - Fetches insurance company policies
   - `appeals_history_fetcher.py` - Fetches appeal decisions and legal precedents

2. **Parsers** (`src/wyngai/parse/`)
   - `state_doi_parser.py` - Parses state regulation documents
   - `payer_policy_parser.py` - Parses insurance policy documents
   - `appeals_parser.py` - Parses legal decisions and IRO determinations

3. **Pipeline** (`src/wyngai/data_sources/`)
   - `data_expansion_pipeline.py` - Orchestrates the entire expansion process

### Authority Rankings

The system implements a sophisticated authority ranking system:

- **State DOI Regulations**: 85-90% authority
- **Insurance Payer Policies**: 75-80% authority
- **Appeal Precedents**: 70-75% authority
- **IRO Decisions**: 70% authority
- **Federal Regulations**: 90-95% authority (existing)

## Data Sources

### State DOI Regulations

| State | Department | Coverage |
|-------|------------|----------|
| CA | California Department of Insurance | Title 10 CCR, claims handling, Knox-Keene Act |
| NY | Department of Financial Services | Part 216 external appeals, surprise billing |
| TX | Texas Department of Insurance | Title 28 TAC, HMO rules, external review |
| FL | Office of Insurance Regulation | Insurance regulations, network access |
| IL | Department of Insurance | External review, claims processing |
| + 45 more states | Various DOI agencies | Comprehensive regulation coverage |

### Insurance Payer Policies

| Payer | Coverage | Policy Types |
|-------|----------|--------------|
| Aetna | Medical necessity, prior auth, appeals | Clinical Policy Bulletins (CPB) |
| BCBS | Technology evaluations, coverage policies | Medical policies, state plan variations |
| UnitedHealthcare | Coverage determinations, medical policies | Commercial & Medicare Advantage |
| Cigna | Coverage positions, clinical policies | Medical, behavioral, administrative |
| Humana | Clinical guidelines, Medicare Advantage | Coverage policies, formularies |
| Anthem | Clinical UM guidelines, CG-series | Medical necessity criteria |
| Kaiser Permanente | Integrated care policies, technology assessments | HMO-specific procedures |

### Appeal Decision Sources

| Source | Coverage | Document Types |
|--------|----------|----------------|
| CourtListener | Federal court ERISA decisions | Court opinions, legal precedents |
| Justia | State and federal healthcare law | Legal opinions, insurance disputes |
| IRO Decisions | External review determinations | Medical necessity appeals |
| CMS Appeals | Medicare ALJ decisions | Administrative law rulings |
| State Courts | Insurance dispute precedents | Bad faith, coverage denial cases |

## Installation & Setup

### Requirements

```bash
pip install requests beautifulsoup4 PyPDF2 python-dateutil pandas pydantic
```

### Basic Usage

```python
from wyngai.data_sources.data_expansion_pipeline import DataExpansionPipeline

# Initialize pipeline
pipeline = DataExpansionPipeline(
    base_output_dir=Path("./healthcare_data"),
    index_dir=Path("./healthcare_data/index")
)

# Run full expansion
results = pipeline.run_full_expansion()
```

### CLI Usage

```bash
# Full expansion pipeline
python cli_expansion.py --mode full --output-dir ./data --update-index

# State DOI regulations only
python cli_expansion.py --mode state-doi --states CA NY TX --output-dir ./state_data

# Payer policies only
python cli_expansion.py --mode payer-policies --payers AETNA UHC BCBS --output-dir ./payer_data

# Appeal decisions only
python cli_expansion.py --mode appeals --sources IRO_DECISIONS CMS_APPEALS --output-dir ./appeals_data

# Check system status
python cli_expansion.py --mode status --output-dir ./data
```

## Configuration

### Default Expansion Config

```python
expansion_config = {
    "fetch_state_doi": True,
    "state_codes": ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "MI", "WA", "MA"],

    "fetch_payer_policies": True,
    "payer_codes": ["AETNA", "BCBS", "UHC", "CIGNA", "HUMANA", "ANTHEM"],
    "policy_types": ["medical", "appeals", "prior_auth"],

    "fetch_appeals": True,
    "appeal_sources": ["IRO_DECISIONS", "CMS_APPEALS", "JUSTIA"],

    "process_documents": True,
    "update_index": True,
    "max_documents_per_source": 50
}
```

### Rate Limiting

The system implements conservative rate limiting:
- State DOI sites: 2 seconds between requests
- Payer sites: 3 seconds between requests
- Legal sites: 4 seconds between requests
- Additional delays between different sources

## Output Structure

```
output_dir/
├── state_doi/
│   ├── state_ca/
│   │   ├── CA_Title_10_Claims_Handling_abc123.json
│   │   └── chunks/
│   └── state_ny/
├── payer_policies/
│   ├── payer_aetna/
│   │   ├── AETNA_medical_CPB_123_def456.json
│   │   └── chunks/
│   └── payer_uhc/
├── appeals/
│   ├── appeals_iro_decisions/
│   │   ├── IRO_DECISIONS_Medical_Necessity_ghi789.json
│   │   └── chunks/
│   └── appeals_cms_appeals/
├── hybrid_index/          # RAG index files
├── provenance_db.json     # Data provenance tracking
└── pipeline_results_*.json # Execution logs
```

## Data Quality & Provenance

### Provenance Tracking

Each document includes comprehensive metadata:

```json
{
  "doc_id": "uuid-string",
  "source_id": "content-hash",
  "source_type": "state_doi|payer_policy|appeal_precedent",
  "fetch_date": "2024-01-15T10:30:00Z",
  "authority_rank": 0.87,
  "metadata": {
    "state_code": "CA",
    "payer_code": "AETNA",
    "court_name": "U.S. District Court",
    "topics": ["medical_necessity", "appeals_procedures"]
  }
}
```

### Quality Metrics

- **Content filtering**: Minimum text length, quality thresholds
- **Deduplication**: SHA-256 content hashing
- **Authority validation**: Source credibility scoring
- **Recency weighting**: Newer documents get priority boosts
- **Topic relevance**: Healthcare-specific keyword matching

## Legal & Ethical Considerations

### Fair Use Compliance

- **Public Domain**: State regulations, court decisions (full access)
- **Fair Use**: Payer policies for educational/research purposes
- **Rate Limiting**: Respectful crawling practices
- **Attribution**: Full source attribution and URL preservation

### Data Licensing

| Source Type | License | Usage Rights |
|-------------|---------|--------------|
| Federal Regulations | Public Domain | Unrestricted |
| State Regulations | State Public Domain | Unrestricted |
| Court Decisions | Public Domain | Unrestricted |
| IRO Decisions | Public Domain | Unrestricted |
| Payer Policies | Proprietary | Fair use for training |

## Performance & Scalability

### Optimization Features

- **Parallel fetching**: Multi-threaded document retrieval
- **Incremental updates**: Only fetch changed documents
- **Intelligent chunking**: Context-aware text segmentation
- **Hybrid indexing**: Vector + keyword search optimization
- **Compression**: Efficient storage of large document sets

### Scaling Considerations

- **Memory usage**: ~2-4GB for full expansion
- **Storage**: ~10-50GB for comprehensive dataset
- **Processing time**: 2-6 hours for full expansion
- **Index size**: ~1-5GB for hybrid search index

## Monitoring & Maintenance

### Pipeline Monitoring

```python
# Check pipeline status
status = pipeline.get_expansion_status()
print(f"Total documents: {status['total_documents']}")
print(f"Last expansion: {status['last_full_expansion']}")

# Run incremental updates
pipeline.run_incremental_update(days_lookback=7)
```

### Error Handling

- Graceful failures with detailed logging
- Retry mechanisms for transient errors
- Skip problematic documents rather than failing entirely
- Comprehensive error reporting in results

## Integration with Existing WyngAI

### Schema Compatibility

The expansion system uses the existing WyngAI schemas:
- `DOC` objects for document storage
- `CHUNK` objects for retrieval units
- `HybridIndex` for search functionality
- Authority ranking integration

### API Integration

```python
# Use with existing RAG system
from wyngai.rag.hybrid_index import HybridIndex

index = HybridIndex(index_dir="./healthcare_data/index")
results = index.search("medical necessity appeals", top_k=10)
```

## Contributing

### Adding New Sources

1. Create fetcher in `data_sources/`
2. Create parser in `parse/`
3. Add source entries to `registry.py`
4. Update pipeline configuration
5. Add tests and documentation

### Source Requirements

- Stable, accessible URLs
- Substantial healthcare content (>500 documents)
- Regular updates (at least annually)
- Legal compliance for access
- Clear authority/precedence level

## Troubleshooting

### Common Issues

**Rate Limiting**: Increase delays in fetcher configuration
**Memory Issues**: Reduce batch sizes, enable incremental processing
**Index Corruption**: Delete index directory and rebuild
**Network Timeouts**: Check internet connectivity, reduce concurrent requests

### Debug Mode

```bash
python cli_expansion.py --mode full --verbose --dry-run --output-dir ./test
```

## Roadmap

### Planned Enhancements

- **Additional Sources**: More state courts, international precedents
- **Real-time Updates**: Webhook-based incremental fetching
- **Advanced NLP**: Entity extraction, relationship mapping
- **API Endpoints**: RESTful API for external access
- **Dashboard**: Web interface for monitoring and control

### Version History

- **v1.0**: Initial release with basic fetching
- **v1.1**: Added authority ranking system
- **v1.2**: Enhanced parsing and chunking
- **v2.0**: Full pipeline integration (current)

## Support

For issues, questions, or contributions:
- Review existing documentation
- Check troubleshooting section
- Submit issues with detailed error logs
- Include system specifications and configuration

---

*WyngAI Data Expansion System - Comprehensive Healthcare Regulation Intelligence*