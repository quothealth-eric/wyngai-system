#!/usr/bin/env python3
"""
Update WyngAI API with comprehensive healthcare regulation data
Merges existing data with new comprehensive state and payer policies
"""

import json
import sys
from pathlib import Path

def load_existing_data():
    """Load the existing healthcare regulations data"""
    with open('warehouse/healthcare_regulations_expanded.json', 'r') as f:
        existing_data = json.load(f)
    return existing_data['documents']

def load_comprehensive_data():
    """Load the comprehensive healthcare regulations data"""
    with open('warehouse/healthcare_regulations_comprehensive.json', 'r') as f:
        comprehensive_data = json.load(f)
    return comprehensive_data['documents']

def merge_datasets(existing_docs, comprehensive_docs):
    """Merge existing and comprehensive datasets, removing duplicates"""
    print("🔄 Merging existing and comprehensive datasets...")

    # Create a set of existing titles to avoid duplicates
    existing_titles = set(doc['title'] for doc in existing_docs)

    merged_docs = existing_docs.copy()
    added_count = 0

    for doc in comprehensive_docs:
        if doc['title'] not in existing_titles:
            # Update chunk_id to maintain sequence
            doc['chunk_id'] = f"merged_reg_{len(merged_docs)+1:03d}"
            merged_docs.append(doc)
            added_count += 1

    print(f"✅ Merged datasets: {len(existing_docs)} existing + {added_count} new = {len(merged_docs)} total")
    return merged_docs

def convert_to_api_format(documents):
    """Convert documents to WyngAI API format"""
    api_chunks = []

    for doc in documents:
        chunk = {
            "chunk_id": doc["chunk_id"],
            "text": doc["content"][:1000],  # Increased limit for comprehensive data
            "authority_rank": doc["authority_rank"],
            "section_path": doc["section_path"],
            "citations": doc["citations"],
            "topics": doc["topics"],
            "keywords": generate_enhanced_keywords(doc["content"], doc["topics"])
        }
        api_chunks.append(chunk)

    return api_chunks

def generate_enhanced_keywords(content, topics):
    """Generate enhanced keywords from content and topics"""
    import re

    # Extract key terms
    words = re.findall(r'\b[a-zA-Z]{4,}\b', content.lower())

    # Comprehensive healthcare keywords
    healthcare_terms = [
        "appeal", "coverage", "determination", "medicare", "erisa", "medicaid",
        "authorization", "review", "claim", "denial", "medical", "necessity",
        "external", "internal", "timeline", "deadline", "benefits", "policy",
        "regulation", "code", "section", "emergency", "urgent", "expedited",
        "prior", "network", "provider", "facility", "formulary", "prescription",
        "mental", "health", "substance", "abuse", "parity", "billing",
        "surprise", "balance", "federal", "state", "department", "insurance",
        "grievance", "dispute", "fiduciary", "managed", "care", "utilization",
        "clinical", "experimental", "investigational", "technology", "drug"
    ]

    # Combine topics and relevant terms
    keywords = topics + [word for word in healthcare_terms if word in content.lower()]

    return list(set(keywords))  # Remove duplicates

def update_api_route(api_chunks):
    """Update the WyngAI API route with comprehensive data"""
    print(f"📝 Updating WyngAI API with {len(api_chunks)} comprehensive healthcare regulation chunks...")

    # Read current API route
    api_file = "src/app/api/wyngai/route.ts"
    with open(api_file, 'r') as f:
        content = f.read()

    # Find the HEALTHCARE_INDEX section
    start_marker = "const HEALTHCARE_INDEX = ["
    end_marker = "];"

    start_idx = content.find(start_marker)
    if start_idx == -1:
        print("❌ Could not find HEALTHCARE_INDEX in API route")
        return False

    # Find the end of the array
    bracket_count = 0
    end_idx = start_idx + len(start_marker)

    for i in range(start_idx + len(start_marker), len(content)):
        if content[i] == '[':
            bracket_count += 1
        elif content[i] == ']':
            if bracket_count == 0:
                end_idx = i + 1
                break
            bracket_count -= 1

    # Generate new comprehensive index content
    new_index_content = "const HEALTHCARE_INDEX = [\n"

    for i, chunk in enumerate(api_chunks):
        new_index_content += "  {\n"
        new_index_content += f'    chunk_id: "{chunk["chunk_id"]}",\n'
        new_index_content += f'    text: {json.dumps(chunk["text"])},\n'
        new_index_content += f'    authority_rank: {chunk["authority_rank"]},\n'
        new_index_content += f'    section_path: {json.dumps(chunk["section_path"])},\n'
        new_index_content += f'    citations: {json.dumps(chunk["citations"])},\n'
        new_index_content += f'    topics: {json.dumps(chunk["topics"])},\n'
        new_index_content += f'    keywords: {json.dumps(chunk["keywords"])}\n'
        new_index_content += "  }"

        if i < len(api_chunks) - 1:
            new_index_content += ","
        new_index_content += "\n"

    new_index_content += "];"

    # Replace the old index with the comprehensive one
    new_content = content[:start_idx] + new_index_content + content[end_idx:]

    # Write back to file
    with open(api_file, 'w') as f:
        f.write(new_content)

    print(f"✅ Updated WyngAI API with {len(api_chunks)} comprehensive healthcare regulation chunks")

    # Calculate and display statistics
    authority_ranks = [c['authority_rank'] for c in api_chunks]
    avg_authority = sum(authority_ranks) / len(authority_ranks)
    min_authority = min(authority_ranks)
    max_authority = max(authority_ranks)

    print(f"📊 Authority Statistics:")
    print(f"   • Average: {avg_authority:.1%}")
    print(f"   • Range: {min_authority:.1%} - {max_authority:.1%}")

    # Count coverage by jurisdiction
    jurisdictions = {}
    for chunk in api_chunks:
        # Extract jurisdiction from section_path or estimate from content
        if "Medicare" in str(chunk["section_path"]):
            jurisdiction = "Federal-Medicare"
        elif "ERISA" in str(chunk["section_path"]):
            jurisdiction = "Federal-ERISA"
        elif any(state in str(chunk["section_path"]) for state in ["California", "New York", "Texas", "Florida", "Illinois"]):
            jurisdiction = "State Regulations"
        elif any(payer in str(chunk["section_path"]) for payer in ["Aetna", "Anthem", "Cigna", "Humana", "Kaiser"]):
            jurisdiction = "Private Payers"
        else:
            jurisdiction = "Federal-Other"

        jurisdictions[jurisdiction] = jurisdictions.get(jurisdiction, 0) + 1

    print(f"📍 Coverage by Jurisdiction:")
    for jurisdiction, count in sorted(jurisdictions.items()):
        print(f"   • {jurisdiction}: {count} chunks")

    return True

def main():
    print("\n" + "="*80)
    print("🔄 Updating WyngAI with Comprehensive Healthcare Regulation Data")
    print("="*80 + "\n")

    try:
        # Load datasets
        existing_docs = load_existing_data()
        comprehensive_docs = load_comprehensive_data()

        # Merge datasets
        merged_docs = merge_datasets(existing_docs, comprehensive_docs)

        # Convert to API format
        api_chunks = convert_to_api_format(merged_docs)

        # Update API route
        if update_api_route(api_chunks):
            print("\n🎯 Comprehensive Update Complete!")
            print("✨ Your WyngAI now includes:")
            print("   • Medicare and CMS regulations")
            print("   • Multi-state insurance codes (CA, NY, TX, FL, IL, PA, MI, OH, NC, GA)")
            print("   • Major payer policies (Aetna, Anthem, Cigna, Humana, Kaiser)")
            print("   • Federal regulations (ERISA, ACA, MHPAEA, No Surprises Act)")
            print("   • Enhanced appeal and external review processes")

            print("\n🚀 Next Steps:")
            print("1. Build and deploy: npm run build && npx vercel --prod")
            print("2. Test comprehensive regulation knowledge")
            print("3. Monitor authority scores and coverage effectiveness")

        else:
            print("❌ Failed to update API route")

    except FileNotFoundError as e:
        print(f"❌ Data file not found: {e}")
        print("Please run the data collection scripts first.")
    except Exception as e:
        print(f"❌ Error during update: {e}")

if __name__ == "__main__":
    main()