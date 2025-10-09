# Enhanced Bill Analyzer

The Enhanced Bill Analyzer is a comprehensive medical billing analysis system that uses advanced AI models (Anthropic Claude and OpenAI GPT) to extract, parse, and analyze medical bills with 18 compliance detectors.

## Features

### Core Capabilities
- **OCR & Parsing**: Extracts structured data from medical bill images
- **18 Compliance Detectors**: Comprehensive billing compliance analysis
- **Dual AI Provider Support**: Uses both Anthropic Claude and OpenAI GPT-4
- **Structured JSON Output**: Machine-readable analysis results
- **Human-readable Reports**: Markdown reports with detailed findings

### 18 Compliance Detectors

1. **Duplicates** — Identical procedure codes, dates, or accidental repeats
2. **Unbundling (NCCI PTP)** — Disallowed procedure pairs without proper modifiers
3. **Modifier Misuse** — Incorrect or conflicting modifiers
4. **Prof/Tech Split** — Missing professional reads or double-charged services
5. **Facility Fee Surprise** — Undisclosed facility fees
6. **NSA Ancillary** — Out-of-network ancillary services at in-network facilities
7. **NSA Emergency** — Emergency out-of-network billing violations
8. **Preventive vs Diagnostic** — Incorrect billing of preventive services
9. **Global Surgery** — E/M codes within surgical global periods
10. **Drug/Infusion J-codes** — Implausible drug units or pricing
11. **Therapy Time Units** — Excessive therapy time units
12. **Timely Filing** — Late filing causing patient responsibility
13. **COB Not Applied** — Missing coordination of benefits
14. **EOB $0 but Billed** — Billing errors when EOB shows $0 responsibility
15. **Math Errors** — Arithmetic inconsistencies in billing
16. **Observation vs Inpatient** — Status mismatches affecting cost-sharing
17. **Non-provider Fees** — Contestable administrative fees
18. **Missing Itemized Bill** — Summary-only bills requiring detailed breakdown

## Usage

### API Endpoint

**POST** `/api/analyzer/enhanced`

#### Request Format

The endpoint accepts multipart form data with:

- `image0`, `image1`, etc.: Bill image files (JPEG, PNG, WebP, HEIC)
- `context` (optional): JSON string with analysis context
- `provider` (optional): `"anthropic"`, `"openai"`, or `"both"` (default: `"both"`)

#### Context Object

```json
{
  "ncci_ptp_rows": [],           // NCCI PTP edit data (optional)
  "ncci_mue_rows": [],           // NCCI MUE data (optional)
  "payer": "Insurance Company",   // Payer name
  "planType": "PPO",             // HMO|PPO|POS|HDHP|Medicare|Medicaid|Other
  "state": "FL",                 // Two-letter state code
  "network": {                   // Network status for different services
    "facility": "INN",           // INN|OON|UNK
    "anesthesia": "OON",
    "pathology": "INN",
    "radiology": "INN"
  },
  "pos": "22",                   // Place of service code
  "eob": {},                     // EOB data (optional)
  "totals": {}                   // Bill totals (optional)
}
```

#### Response Format

```json
{
  "success": true,
  "metadata": {
    "analysisTime": 15000,
    "imageCount": 2,
    "providersUsed": ["anthropic", "openai"],
    "availability": {
      "anthropic": true,
      "openai": true
    },
    "timestamp": "2024-10-09T15:30:00Z"
  },
  "results": {
    "anthropic": {
      "header": { /* Bill header data */ },
      "items": [ /* Line items */ ],
      "codesIndex": { /* Aggregated code data */ },
      "findings": [ /* Detector findings */ ],
      "math": { /* Mathematical checks */ },
      "report_md": "# Analysis Report\\n..."
    },
    "openai": {
      // Same structure as anthropic
    }
  }
}
```

### Command Line Script

Use the provided shell script for command-line analysis:

```bash
# Set API keys
export ANTHROPIC_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"

# Run analysis
./scripts/run-bill-analyzer.sh '{}' bill-page1.jpg bill-page2.jpg

# With context
./scripts/run-bill-analyzer.sh '{"state":"FL","planType":"PPO"}' hospital-bill.png

# With context file
./scripts/run-bill-analyzer.sh context.json bill-images/*.jpg
```

### Health Check

**GET** `/api/analyzer/enhanced`

Returns system status and configuration.

## Environment Configuration

Add these variables to your environment:

```bash
# Required: At least one API key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Optional: Model configuration
MODEL_ANTHROPIC=claude-3-5-sonnet-20241022
MODEL_OPENAI=gpt-4o
MAX_TOKENS=8000
TEMPERATURE=0.1
```

## Output Structure

### BillHeader
- `facility`: Healthcare facility name
- `patientName`: Patient name
- `patientRef`: Patient reference/ID
- `serviceDateStart`/`serviceDateEnd`: Service date range
- `mrn`: Medical record number
- `accountNumber`: Account/claim number
- `pageInfo`: Page information if multi-page

### BillLineItem
- `page`: Page number
- `dos`: Date of service (YYYY-MM-DD)
- `code`: Procedure/service code
- `codeSystem`: Code classification (CPT, HCPCS, REV, etc.)
- `description`: Service description
- `modifiers`: Procedure modifiers
- `units`: Number of units
- `charge`: Line item charge
- `department`: Hospital department
- `notes`: Additional notes

### DetectorFinding
- `detectorId`: Detector number (1-18)
- `detectorName`: Human-readable detector name
- `severity`: `"info"`, `"warn"`, or `"high"`
- `affectedLines`: Array of line item indices
- `rationale`: Explanation of the finding
- `suggestedDocs`: Documents to request for verification
- `policyCitations`: Relevant policy citations

## Error Handling

The analyzer handles various error conditions:

- **No API Keys**: Returns 500 error if no providers are configured
- **Invalid Images**: Returns 400 error for unsupported formats
- **Analysis Failures**: Returns partial results if one provider fails
- **Invalid JSON**: Returns 500 error for malformed responses

## Security Considerations

- Images are processed in memory and not stored permanently
- API keys are required for external AI providers
- All analysis happens server-side to protect sensitive medical data
- HIPAA considerations apply to all bill data processing

## Performance

- **Analysis Time**: Typically 10-30 seconds per page
- **Timeout**: 5-minute maximum per request
- **Concurrency**: Multiple requests can be processed simultaneously
- **Image Limits**: No hard limit on images per request (limited by timeout)

## Integration Examples

### Frontend Integration

```typescript
const analyzeImages = async (images: File[], context: any) => {
  const formData = new FormData();

  // Add context
  formData.append('context', JSON.stringify(context));

  // Add images
  images.forEach((image, index) => {
    formData.append(`image${index}`, image);
  });

  const response = await fetch('/api/analyzer/enhanced', {
    method: 'POST',
    body: formData
  });

  return response.json();
};
```

### Node.js Integration

```typescript
import { enhancedBillAnalyzer } from '@/lib/enhanced-bill-analyzer';

const images = [
  { data: base64Data, mimeType: 'image/jpeg' }
];

const context = {
  state: 'FL',
  planType: 'PPO'
};

const results = await enhancedBillAnalyzer.analyze(images, context);
```

## Troubleshooting

### Common Issues

1. **"No AI providers available"**: Check that ANTHROPIC_API_KEY or OPENAI_API_KEY is set
2. **"Analysis failed"**: Check image quality and format (JPEG/PNG preferred)
3. **Timeout errors**: Reduce image size or number of images per request
4. **Invalid JSON response**: Check API key validity and model availability

### Debugging

- Check `/api/analyzer/enhanced` endpoint for health status
- Review server logs for detailed error messages
- Test with single, high-quality images first
- Verify environment variables are properly set

## Support

For issues related to the Enhanced Bill Analyzer:

1. Check the health endpoint first
2. Review environment configuration
3. Test with sample images
4. Check server logs for errors
5. Verify API key permissions and quotas