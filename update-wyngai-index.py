#!/usr/bin/env python3
"""
Update WyngAI API with expanded healthcare regulation data
"""

import json
import sys
from pathlib import Path

def load_expanded_data():
    """Load the expanded healthcare regulations data"""
    with open('warehouse/healthcare_regulations_expanded.json', 'r') as f:
        data = json.load(f)
    return data['documents']

def convert_to_api_format(documents):
    """Convert documents to WyngAI API format"""
    api_chunks = []

    for doc in documents:
        chunk = {
            "chunk_id": doc["chunk_id"],
            "text": doc["content"][:800],  # Truncate for API
            "authority_rank": doc["authority_rank"],
            "section_path": doc["section_path"],
            "citations": doc["citations"],
            "topics": doc["topics"],
            "keywords": generate_keywords(doc["content"], doc["topics"])
        }
        api_chunks.append(chunk)

    return api_chunks

def generate_keywords(content, topics):
    """Generate keywords from content and topics"""
    import re

    # Extract key terms
    words = re.findall(r'\b[a-zA-Z]{4,}\b', content.lower())

    # Healthcare-specific keywords
    healthcare_terms = [
        "appeal", "coverage", "determination", "medicare", "erisa",
        "authorization", "review", "claim", "denial", "medical",
        "necessity", "external", "internal", "timeline", "deadline",
        "benefits", "policy", "regulation", "code", "section"
    ]

    # Combine topics and relevant terms
    keywords = topics + [word for word in healthcare_terms if word in content.lower()]

    return list(set(keywords))  # Remove duplicates

def update_api_route():
    """Update the WyngAI API route with expanded data"""

    # Load expanded data
    expanded_docs = load_expanded_data()
    api_chunks = convert_to_api_format(expanded_docs)

    print(f"📝 Converting {len(expanded_docs)} documents to API format...")

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

    # Generate new index content
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

    # Replace the old index with the new one
    new_content = content[:start_idx] + new_index_content + content[end_idx:]

    # Write back to file
    with open(api_file, 'w') as f:
        f.write(new_content)

    print(f"✅ Updated WyngAI API with {len(api_chunks)} expanded healthcare regulation chunks")
    print(f"📊 Authority ranks: {min(c['authority_rank'] for c in api_chunks):.1%} - {max(c['authority_rank'] for c in api_chunks):.1%}")

    return True

def main():
    print("\n" + "="*60)
    print("🔄 Updating WyngAI API with Expanded Healthcare Data")
    print("="*60 + "\n")

    if update_api_route():
        print("\n🎯 Next Steps:")
        print("1. Test the build: npm run build")
        print("2. Deploy to Vercel: npx vercel --prod")
        print("3. Test expanded regulation knowledge")
        print("\n✨ Your WyngAI now includes:")
        print("   • CMS Medicare regulations")
        print("   • State insurance codes (CA, NY, TX)")
        print("   • Major payer policies (Aetna, BCBS, UHC)")
        print("   • Federal regulations (ERISA, ACA)")
    else:
        print("❌ Failed to update API route")

if __name__ == "__main__":
    main()