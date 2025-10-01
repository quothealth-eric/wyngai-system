"""
Training Data Exporter - Generate SFT pairs and classification data
"""

import json
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime
import random

logger = logging.getLogger(__name__)

class TrainingDataExporter:
    """Exports training data for supervised fine-tuning and classification tasks"""

    def __init__(self, warehouse_dir: str = "warehouse/gold"):
        self.warehouse_dir = Path(warehouse_dir)
        self.output_dir = Path("train")
        self.output_dir.mkdir(exist_ok=True)

        # Training data categories
        self.sft_pairs = []
        self.classification_data = []
        self.appeal_templates = []

    async def export_all(self, format: str = "jsonl", output_dir: str = "train/"):
        """Export all training data formats"""
        logger.info("📚 Starting training data export...")

        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

        try:
            # Generate SFT pairs for response training
            await self._generate_sft_pairs()

            # Generate classification data for issue categorization
            await self._generate_classification_data()

            # Generate appeal letter templates
            await self._generate_appeal_templates()

            # Generate phone script templates
            await self._generate_phone_scripts()

            # Export in requested format
            if format == "jsonl":
                await self._export_jsonl()
            elif format == "parquet":
                await self._export_parquet()
            else:
                await self._export_jsonl()  # Default to JSONL

            logger.info(f"✅ Training data export completed in {format} format")

        except Exception as e:
            logger.error(f"❌ Error in training data export: {e}")
            raise

    async def _generate_sft_pairs(self):
        """Generate supervised fine-tuning pairs from authoritative sources"""
        logger.info("🏗️ Generating SFT pairs...")

        # Load chunks and documents from warehouse
        chunks = await self._load_chunks()
        documents = await self._load_documents()

        # Create document lookup
        doc_lookup = {doc['doc_id']: doc for doc in documents}

        # Generate instruction-response pairs
        instruction_templates = [
            "Explain the healthcare regulation regarding {topic}",
            "What are the requirements for {topic} under federal law?",
            "How should a patient appeal {topic}?",
            "What guidance does CMS provide for {topic}?",
            "Summarize the legal requirements for {topic}",
            "What are a patient's rights regarding {topic}?",
            "Describe the process for {topic} appeals",
            "What federal regulations govern {topic}?"
        ]

        topic_keywords = [
            "external review", "prior authorization", "network adequacy",
            "emergency services", "balance billing", "claim denials",
            "formulary restrictions", "step therapy", "medical necessity",
            "surprise billing", "out-of-network billing", "provider networks"
        ]

        for chunk in chunks[:500]:  # Limit for initial implementation
            try:
                doc = doc_lookup.get(chunk.get('doc_id', ''), {})

                # Skip if no authoritative source
                if not self._is_authoritative_source(doc):
                    continue

                # Extract topic from chunk content
                topic = self._extract_topic(chunk.get('text', ''))
                if not topic:
                    topic = random.choice(topic_keywords)

                # Generate instruction
                instruction_template = random.choice(instruction_templates)
                instruction = instruction_template.format(topic=topic)

                # Generate response with citations
                response = self._generate_response_with_citations(chunk, doc, topic)

                # Create SFT pair
                sft_pair = {
                    "instruction": instruction,
                    "input": "",
                    "output": response,
                    "source_id": doc.get('doc_id', ''),
                    "authority_rank": self._calculate_authority_rank(doc),
                    "citations": [
                        {
                            "title": doc.get('title', ''),
                            "url": doc.get('url', ''),
                            "citation": doc.get('citation', ''),
                            "section": chunk.get('section_path', [])
                        }
                    ]
                }

                self.sft_pairs.append(sft_pair)

            except Exception as e:
                logger.warning(f"Error generating SFT pair from chunk: {e}")

        logger.info(f"📊 Generated {len(self.sft_pairs)} SFT pairs")

    async def _generate_classification_data(self):
        """Generate classification data for issue categorization"""
        logger.info("🏗️ Generating classification data...")

        # Issue categories based on common healthcare billing problems
        issue_categories = {
            "claim_denial": {
                "keywords": ["denied", "rejection", "not covered", "medical necessity"],
                "examples": [
                    "My claim was denied for lack of medical necessity",
                    "Insurance rejected my procedure as experimental",
                    "Claim denied - not covered under plan"
                ]
            },
            "prior_authorization": {
                "keywords": ["prior auth", "pre-authorization", "approval required"],
                "examples": [
                    "Need prior authorization for MRI scan",
                    "Doctor says I need pre-approval for surgery",
                    "Prior auth denied for medication"
                ]
            },
            "network_issues": {
                "keywords": ["out of network", "provider not covered", "network"],
                "examples": [
                    "Provider is out of network",
                    "Can't find in-network specialist",
                    "Emergency room was out of network"
                ]
            },
            "balance_billing": {
                "keywords": ["balance bill", "extra charges", "surprise bill"],
                "examples": [
                    "Received surprise bill from emergency room",
                    "Provider balance billing after insurance payment",
                    "Extra charges not covered by insurance"
                ]
            },
            "appeal_process": {
                "keywords": ["appeal", "review", "dispute", "grievance"],
                "examples": [
                    "How do I appeal this denial?",
                    "Want to dispute claim decision",
                    "Need to file grievance with insurance"
                ]
            },
            "coverage_questions": {
                "keywords": ["covered", "benefits", "eligible", "coverage"],
                "examples": [
                    "Is this procedure covered under my plan?",
                    "What benefits do I have for mental health?",
                    "Am I eligible for this treatment?"
                ]
            }
        }

        # Generate classification examples
        for category, info in issue_categories.items():
            for example in info["examples"]:
                classification_item = {
                    "text": example,
                    "label": category,
                    "keywords": info["keywords"],
                    "confidence": 1.0  # High confidence for hand-crafted examples
                }
                self.classification_data.append(classification_item)

        # Add variations and synthetic examples
        await self._generate_synthetic_classification_data(issue_categories)

        logger.info(f"📊 Generated {len(self.classification_data)} classification examples")

    async def _generate_appeal_templates(self):
        """Generate appeal letter templates"""
        logger.info("🏗️ Generating appeal letter templates...")

        appeal_templates = [
            {
                "template_name": "claim_denial_appeal",
                "use_case": "Appeal a denied insurance claim",
                "template": """
[Date]

[Insurance Company Name]
Appeals Department
[Address]

RE: Appeal for Denied Claim
Policy Number: [Policy Number]
Claim Number: [Claim Number]
Patient: [Patient Name]

Dear Appeals Review Team,

I am writing to formally appeal the denial of my claim for [Service/Procedure] performed on [Date of Service] by [Provider Name].

GROUNDS FOR APPEAL:
1. Medical Necessity: [Explain why service was medically necessary]
2. Plan Coverage: [Reference specific plan language that covers this service]
3. Supporting Documentation: [List attached supporting documents]

SUPPORTING EVIDENCE:
- Medical records demonstrating medical necessity
- Provider notes explaining rationale for treatment
- Relevant clinical guidelines or research

FEDERAL REGULATIONS:
Under [Relevant Regulation], I have the right to:
- A fair and impartial review of this claim denial
- Access to all information used in the denial decision
- Response within required timeframes

I request that you:
1. Reverse the denial decision
2. Process payment for the covered services
3. Provide written explanation of the review outcome

Please contact me at [Phone] if you need additional information.

Sincerely,
[Name]

Attachments: [List attachments]
                """,
                "required_info": [
                    "Policy Number", "Claim Number", "Date of Service",
                    "Provider Name", "Service/Procedure", "Denial Reason"
                ],
                "citations": [
                    "45 CFR 147.136 - External Review Process",
                    "ERISA Section 503 - Claims Procedures"
                ]
            },
            {
                "template_name": "external_review_request",
                "use_case": "Request external review of denied claim",
                "template": """
[Date]

[State Insurance Department/External Review Organization]
[Address]

RE: Request for External Review
Insurance Company: [Insurance Company]
Policy Number: [Policy Number]
Claim Number: [Claim Number]

Dear External Review Team,

I hereby request an external review of the adverse benefit determination made by [Insurance Company] regarding my claim for [Service/Procedure].

CLAIM DETAILS:
- Date of Service: [Date]
- Provider: [Provider Name]
- Service: [Description]
- Denial Date: [Date]
- Internal Appeal Completed: [Date]

MEDICAL INFORMATION:
[Brief summary of medical condition and need for service]

I have completed the required internal appeal process and disagree with the final adverse determination. I believe the service is medically necessary and covered under my plan.

Enclosed please find:
- Copy of adverse determination letter
- Medical records
- Provider documentation
- Plan documents

I request an expedited review due to: [If applicable - urgent medical condition]

Thank you for your consideration.

Sincerely,
[Name]
[Contact Information]
                """,
                "required_info": [
                    "Insurance Company", "Policy Number", "Claim Number",
                    "Service/Procedure", "Provider Name", "Denial Date"
                ],
                "citations": [
                    "45 CFR 147.136(d) - External Review Standards"
                ]
            }
        ]

        self.appeal_templates = appeal_templates
        logger.info(f"📊 Generated {len(appeal_templates)} appeal templates")

    async def _generate_phone_scripts(self):
        """Generate phone call scripts for common scenarios"""
        logger.info("🏗️ Generating phone scripts...")

        phone_scripts = [
            {
                "script_name": "claim_status_inquiry",
                "scenario": "Checking status of submitted claim",
                "script": """
PREPARATION:
- Have policy number, claim number, and member ID ready
- Have dates of service and provider information
- Take notes during the call

SCRIPT:
"Hello, I'm calling to check on the status of a claim I submitted.

My information:
- Policy Number: [Policy Number]
- Member ID: [Member ID]
- Claim Number: [Claim Number] (if available)
- Date of Service: [Date]
- Provider: [Provider Name]

Can you please tell me:
1. What is the current status of this claim?
2. If denied, what was the specific reason?
3. What information or documentation is needed?
4. What are the next steps in the process?
5. What is the timeline for resolution?

[Take detailed notes of responses]

If claim is denied:
'I would like information about the appeals process. Can you:
- Send me the denial letter if I haven't received it
- Explain my appeal rights
- Provide the deadline for filing an appeal
- Tell me what documentation I need to submit'

Thank you for your assistance. Can I get a reference number for this call?"

FOLLOW-UP:
- Document all information received
- Request written confirmation of any commitments
- Set calendar reminders for important deadlines
                """,
                "preparation_items": [
                    "Policy number", "Member ID", "Claim number",
                    "Date of service", "Provider information"
                ],
                "key_questions": [
                    "What is the claim status?",
                    "What documentation is needed?",
                    "What are the appeal deadlines?"
                ]
            }
        ]

        # Add phone scripts to appeal templates for consolidated export
        for script in phone_scripts:
            self.appeal_templates.append({
                "template_name": script["script_name"],
                "use_case": script["scenario"],
                "template": script["script"],
                "template_type": "phone_script"
            })

        logger.info("📊 Generated phone scripts")

    async def _export_jsonl(self):
        """Export training data in JSONL format"""
        logger.info("💾 Exporting JSONL files...")

        # Export SFT pairs
        sft_file = self.output_dir / "sft_pairs.jsonl"
        with open(sft_file, 'w') as f:
            for pair in self.sft_pairs:
                f.write(json.dumps(pair) + '\n')

        # Export classification data
        classification_file = self.output_dir / "classification.jsonl"
        with open(classification_file, 'w') as f:
            for item in self.classification_data:
                f.write(json.dumps(item) + '\n')

        # Export appeal templates
        templates_file = self.output_dir / "appeal_templates.jsonl"
        with open(templates_file, 'w') as f:
            for template in self.appeal_templates:
                f.write(json.dumps(template) + '\n')

        logger.info(f"✅ Exported JSONL files to {self.output_dir}")

    async def _export_parquet(self):
        """Export training data in Parquet format"""
        logger.info("💾 Exporting Parquet files...")

        # Export SFT pairs
        if self.sft_pairs:
            sft_df = pd.DataFrame(self.sft_pairs)
            sft_file = self.output_dir / "sft_pairs.parquet"
            sft_df.to_parquet(sft_file, index=False)

        # Export classification data
        if self.classification_data:
            classification_df = pd.DataFrame(self.classification_data)
            classification_file = self.output_dir / "classification.parquet"
            classification_df.to_parquet(classification_file, index=False)

        # Export appeal templates
        if self.appeal_templates:
            templates_df = pd.DataFrame(self.appeal_templates)
            templates_file = self.output_dir / "appeal_templates.parquet"
            templates_df.to_parquet(templates_file, index=False)

        logger.info(f"✅ Exported Parquet files to {self.output_dir}")

    async def _load_chunks(self) -> List[Dict]:
        """Load chunks from warehouse"""
        chunks = []
        try:
            for chunk_file in self.warehouse_dir.glob("**/*chunks*.json"):
                with open(chunk_file) as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        chunks.extend(data)
                    else:
                        chunks.append(data)
        except Exception as e:
            logger.warning(f"Error loading chunks: {e}")
        return chunks

    async def _load_documents(self) -> List[Dict]:
        """Load documents from warehouse"""
        documents = []
        try:
            for doc_file in self.warehouse_dir.glob("**/*.json"):
                if "chunks" not in doc_file.name:
                    with open(doc_file) as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            documents.extend(data)
                        else:
                            documents.append(data)
        except Exception as e:
            logger.warning(f"Error loading documents: {e}")
        return documents

    def _is_authoritative_source(self, doc: Dict) -> bool:
        """Check if document is from authoritative source"""
        category = doc.get('category', '').lower()
        source = doc.get('source', '').lower()

        authoritative_indicators = [
            'federal', 'cfr', 'cms', 'cdc', 'hhs',
            'state statute', 'state regulation',
            'court decision', 'erisa'
        ]

        return any(indicator in category or indicator in source
                  for indicator in authoritative_indicators)

    def _extract_topic(self, text: str) -> Optional[str]:
        """Extract main topic from text"""
        topic_patterns = {
            "external review": ["external review", "independent review"],
            "prior authorization": ["prior authorization", "pre-authorization"],
            "claim denial": ["claim denial", "denied claim"],
            "balance billing": ["balance billing", "surprise billing"],
            "network adequacy": ["network", "provider network"],
            "emergency services": ["emergency", "urgent care"]
        }

        text_lower = text.lower()
        for topic, patterns in topic_patterns.items():
            if any(pattern in text_lower for pattern in patterns):
                return topic

        return None

    def _generate_response_with_citations(self, chunk: Dict, doc: Dict, topic: str) -> str:
        """Generate response with proper citations"""
        response_parts = []

        # Add main guidance
        main_text = chunk.get('text', '')[:500]  # Limit length
        response_parts.append(f"Based on {doc.get('title', 'federal guidance')}, {main_text}")

        # Add citation
        citation = doc.get('citation', '')
        url = doc.get('url', '')
        if citation:
            response_parts.append(f"\n**Citation:** {citation}")
        if url:
            response_parts.append(f"**Source:** {url}")

        # Add practical guidance
        response_parts.append(
            f"\n**Important:** This guidance is based on federal regulations. "
            f"For specific situations involving {topic}, consult with a healthcare "
            f"advocate or attorney specializing in healthcare law."
        )

        return "\n".join(response_parts)

    def _calculate_authority_rank(self, doc: Dict) -> float:
        """Calculate authority ranking for document"""
        category = doc.get('category', '').lower()

        if 'federal' in category:
            return 0.95
        elif 'state' in category:
            return 0.80
        elif 'court' in category:
            return 0.75
        else:
            return 0.60

    async def _generate_synthetic_classification_data(self, issue_categories: Dict):
        """Generate additional synthetic classification examples"""

        # Variation templates
        variation_templates = [
            "I'm having trouble with {issue}",
            "Can you help me understand {issue}?",
            "What should I do about {issue}?",
            "My insurance company is {issue}",
            "I received a letter about {issue}"
        ]

        issue_variations = {
            "claim_denial": ["denying my claim", "rejecting my request", "not approving my procedure"],
            "prior_authorization": ["requiring prior auth", "needing pre-approval", "asking for authorization"],
            "network_issues": ["saying provider is out of network", "not covering out-of-network care"],
            "balance_billing": ["sending surprise bills", "charging extra fees", "billing me directly"],
            "appeal_process": ["the appeal process", "how to dispute this", "filing a grievance"],
            "coverage_questions": ["what's covered", "my benefits", "plan coverage"]
        }

        for category, variations in issue_variations.items():
            for variation in variations:
                for template in variation_templates:
                    synthetic_text = template.format(issue=variation)

                    classification_item = {
                        "text": synthetic_text,
                        "label": category,
                        "confidence": 0.8,  # Lower confidence for synthetic
                        "synthetic": True
                    }
                    self.classification_data.append(classification_item)