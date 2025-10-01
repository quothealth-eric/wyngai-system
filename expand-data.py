#!/usr/bin/env python3
"""
WyngAI Data Expansion Script
Expands the healthcare regulation dataset with state DOI regulations,
payer policies, and appeal decisions.
"""

import sys
import logging
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from wyngai.data_sources.state_doi_fetcher import StateDOIFetcher
from wyngai.data_sources.payer_policy_fetcher import PayerPolicyFetcher
from wyngai.data_sources.appeals_history_fetcher import AppealsHistoryFetcher

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_data_expansion():
    """Test data expansion with a small sample"""

    print("\n" + "="*60)
    print("WyngAI Data Expansion System")
    print("="*60 + "\n")

    # Test State DOI Fetcher
    print("1. Testing State DOI Fetcher...")
    print("-" * 40)
    doi_fetcher = StateDOIFetcher()

    # Just fetch from California as a test
    print("Fetching California DOI regulations...")
    ca_results = []
    try:
        # Create output directory for test
        import os
        test_output = "warehouse/test_output"
        os.makedirs(test_output, exist_ok=True)

        for doc in doi_fetcher.fetch_state_regulations("CA", test_output):
            print(f"  ✓ Found: {doc.title[:50]}...")
            ca_results.append(doc)
            if len(ca_results) >= 3:  # Just get 3 for testing
                break
        print(f"  Total: {len(ca_results)} regulations found\n")
    except Exception as e:
        print(f"  Error testing DOI fetcher: {e}")
        print(f"  Skipping DOI test for now\n")

    # Test Payer Policy Fetcher
    print("2. Testing Payer Policy Fetcher...")
    print("-" * 40)
    payer_fetcher = PayerPolicyFetcher()

    # Just fetch from Aetna as a test
    print("Fetching Aetna policies...")
    aetna_results = []
    try:
        for doc in payer_fetcher.fetch_aetna_policies(test_output):
            print(f"  ✓ Found: {doc.title[:50]}...")
            aetna_results.append(doc)
            if len(aetna_results) >= 3:  # Just get 3 for testing
                break
        print(f"  Total: {len(aetna_results)} policies found\n")
    except Exception as e:
        print(f"  Error testing payer fetcher: {e}")
        print(f"  Skipping payer test for now\n")

    # Test Appeals History Fetcher
    print("3. Testing Appeals History Fetcher...")
    print("-" * 40)
    appeals_fetcher = AppealsHistoryFetcher()

    print("Fetching recent appeal decisions...")
    appeal_results = []
    try:
        for doc in appeals_fetcher.fetch_courtlistener_decisions(
            query="health insurance appeal denied coverage",
            output_dir=test_output
        ):
            print(f"  ✓ Found: {doc.title[:50]}...")
            appeal_results.append(doc)
            if len(appeal_results) >= 3:  # Just get 3 for testing
                break
        print(f"  Total: {len(appeal_results)} decisions found\n")
    except Exception as e:
        print(f"  Error testing appeals fetcher: {e}")
        print(f"  Skipping appeals test for now\n")

    print("="*60)
    print("Summary:")
    print(f"  • State regulations: {len(ca_results)}")
    print(f"  • Payer policies: {len(aetna_results)}")
    print(f"  • Appeal decisions: {len(appeal_results)}")
    print(f"  • Total documents: {len(ca_results) + len(aetna_results) + len(appeal_results)}")
    print("="*60 + "\n")

    return ca_results, aetna_results, appeal_results

def full_data_expansion():
    """Run full data expansion (warning: this will take hours)"""

    print("\n" + "="*60)
    print("WyngAI FULL Data Expansion")
    print("WARNING: This will fetch thousands of documents")
    print("="*60 + "\n")

    response = input("Do you want to proceed with FULL data collection? (yes/no): ")
    if response.lower() != 'yes':
        print("Cancelled.")
        return

    from wyngai.data_sources.data_expansion_pipeline import DataExpansionPipeline

    pipeline = DataExpansionPipeline(
        warehouse_dir="warehouse/expanded",
        index_dir="rag/expanded_index"
    )

    # Run full pipeline
    pipeline.run_full_pipeline()

    print("\nData expansion complete!")
    print("New index created at: rag/expanded_index/")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="WyngAI Data Expansion")
    parser.add_argument(
        "--mode",
        choices=["test", "full"],
        default="test",
        help="Run in test mode (small sample) or full mode (complete dataset)"
    )

    args = parser.parse_args()

    if args.mode == "test":
        test_data_expansion()
    else:
        full_data_expansion()