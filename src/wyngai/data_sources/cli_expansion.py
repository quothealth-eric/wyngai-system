#!/usr/bin/env python3
"""
CLI for WyngAI data expansion system.

Simple command-line interface to run the comprehensive data expansion pipeline
for healthcare regulations, payer policies, and appeal decisions.
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import List, Optional

from .data_expansion_pipeline import DataExpansionPipeline
from .state_doi_fetcher import StateDOIFetcher
from .payer_policy_fetcher import PayerPolicyFetcher
from .appeals_history_fetcher import AppealsHistoryFetcher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description='WyngAI Healthcare Data Expansion System',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run full expansion pipeline
  python cli_expansion.py --mode full --output-dir ./data_expansion

  # Fetch only state DOI regulations
  python cli_expansion.py --mode state-doi --states CA NY TX --output-dir ./state_data

  # Fetch payer policies
  python cli_expansion.py --mode payer-policies --payers AETNA UHC BCBS --output-dir ./payer_data

  # Fetch appeal decisions
  python cli_expansion.py --mode appeals --sources IRO_DECISIONS CMS_APPEALS --output-dir ./appeals_data

  # Get expansion status
  python cli_expansion.py --mode status --output-dir ./data_expansion
        """
    )

    parser.add_argument(
        '--mode',
        choices=['full', 'state-doi', 'payer-policies', 'appeals', 'status'],
        required=True,
        help='Operation mode'
    )

    parser.add_argument(
        '--output-dir',
        type=Path,
        required=True,
        help='Output directory for data and indexes'
    )

    parser.add_argument(
        '--states',
        nargs='*',
        help='State codes for DOI fetching (e.g., CA NY TX)'
    )

    parser.add_argument(
        '--payers',
        nargs='*',
        help='Payer codes for policy fetching (e.g., AETNA UHC BCBS)'
    )

    parser.add_argument(
        '--sources',
        nargs='*',
        help='Appeal sources for legal decision fetching'
    )

    parser.add_argument(
        '--policy-types',
        nargs='*',
        default=['medical', 'appeals'],
        help='Types of payer policies to fetch'
    )

    parser.add_argument(
        '--max-docs',
        type=int,
        default=50,
        help='Maximum documents per source (default: 50)'
    )

    parser.add_argument(
        '--update-index',
        action='store_true',
        help='Update RAG index after fetching'
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without actually doing it'
    )

    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Create output directory
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.mode == 'full':
        run_full_expansion(args)
    elif args.mode == 'state-doi':
        run_state_doi_fetching(args)
    elif args.mode == 'payer-policies':
        run_payer_policy_fetching(args)
    elif args.mode == 'appeals':
        run_appeals_fetching(args)
    elif args.mode == 'status':
        show_expansion_status(args)


def run_full_expansion(args):
    """Run the complete data expansion pipeline."""
    logger.info("Starting full data expansion pipeline")

    if args.dry_run:
        logger.info("DRY RUN: Would run full expansion with:")
        logger.info(f"  Output directory: {args.output_dir}")
        logger.info(f"  Max docs per source: {args.max_docs}")
        logger.info(f"  Update index: {args.update_index}")
        return

    # Initialize pipeline
    pipeline = DataExpansionPipeline(
        base_output_dir=args.output_dir,
        index_dir=args.output_dir / "hybrid_index"
    )

    # Configure expansion
    expansion_config = {
        "fetch_state_doi": True,
        "state_codes": args.states or ["CA", "NY", "TX", "FL", "IL"],
        "fetch_payer_policies": True,
        "payer_codes": args.payers or ["AETNA", "UHC", "BCBS", "CIGNA"],
        "policy_types": args.policy_types,
        "fetch_appeals": True,
        "appeal_sources": args.sources or ["IRO_DECISIONS", "CMS_APPEALS"],
        "process_documents": True,
        "update_index": args.update_index,
        "max_documents_per_source": args.max_docs
    }

    # Run pipeline
    results = pipeline.run_full_expansion(expansion_config)

    # Print summary
    print("\n" + "="*60)
    print("DATA EXPANSION SUMMARY")
    print("="*60)
    print(f"Duration: {results['duration_minutes']:.1f} minutes")
    print(f"Documents fetched: {results['documents_fetched']}")
    print(f"Chunks created: {results['chunks_created']}")
    print(f"Index updated: {results['index_updated']}")

    if results.get('errors'):
        print(f"Errors: {len(results['errors'])}")
        for error in results['errors'][:3]:  # Show first 3 errors
            print(f"  - {error}")

    print(f"\nResults saved to: {args.output_dir}")


def run_state_doi_fetching(args):
    """Run state DOI regulation fetching."""
    logger.info("Fetching state DOI regulations")

    if not args.states:
        logger.error("--states required for state-doi mode")
        sys.exit(1)

    if args.dry_run:
        logger.info(f"DRY RUN: Would fetch DOI regulations for states: {args.states}")
        return

    fetcher = StateDOIFetcher()

    for state_code in args.states:
        logger.info(f"Fetching regulations for {state_code}")

        state_output_dir = args.output_dir / f"state_{state_code.lower()}"
        docs = fetcher.fetch_state_regulations(state_code, state_output_dir)

        print(f"Fetched {len(docs)} documents for {state_code}")

    print(f"State DOI data saved to: {args.output_dir}")


def run_payer_policy_fetching(args):
    """Run payer policy fetching."""
    logger.info("Fetching payer policies")

    if not args.payers:
        logger.error("--payers required for payer-policies mode")
        sys.exit(1)

    if args.dry_run:
        logger.info(f"DRY RUN: Would fetch policies for payers: {args.payers}")
        logger.info(f"DRY RUN: Policy types: {args.policy_types}")
        return

    fetcher = PayerPolicyFetcher()

    for payer_code in args.payers:
        logger.info(f"Fetching policies for {payer_code}")

        payer_output_dir = args.output_dir / f"payer_{payer_code.lower()}"
        docs = fetcher.fetch_payer_policies(
            payer_code, payer_output_dir, args.policy_types
        )

        print(f"Fetched {len(docs)} policies for {payer_code}")

    print(f"Payer policy data saved to: {args.output_dir}")


def run_appeals_fetching(args):
    """Run appeals decision fetching."""
    logger.info("Fetching appeal decisions")

    if not args.sources:
        logger.error("--sources required for appeals mode")
        sys.exit(1)

    if args.dry_run:
        logger.info(f"DRY RUN: Would fetch appeals from sources: {args.sources}")
        return

    fetcher = AppealsHistoryFetcher()

    for source_code in args.sources:
        logger.info(f"Fetching appeals from {source_code}")

        source_output_dir = args.output_dir / f"appeals_{source_code.lower()}"
        docs = fetcher.fetch_appeal_decisions(source_code, source_output_dir)

        print(f"Fetched {len(docs)} decisions from {source_code}")

    print(f"Appeals data saved to: {args.output_dir}")


def show_expansion_status(args):
    """Show current expansion system status."""
    logger.info("Checking expansion system status")

    pipeline = DataExpansionPipeline(
        base_output_dir=args.output_dir,
        index_dir=args.output_dir / "hybrid_index"
    )

    status = pipeline.get_expansion_status()

    print("\n" + "="*50)
    print("DATA EXPANSION SYSTEM STATUS")
    print("="*50)
    print(f"Last full expansion: {status.get('last_full_expansion', 'Never')}")
    print(f"Total documents: {status['total_documents']}")
    print(f"Total chunks: {status['total_chunks']}")
    print(f"Index exists: {status['index_status'].get('exists', False)}")

    if status['index_status'].get('exists'):
        size_gb = status['index_status'].get('size_gb', 0)
        print(f"Index size: {size_gb:.2f} GB")

    if status.get('source_counts'):
        print("\nSource breakdown:")
        for source, count in status['source_counts'].items():
            print(f"  {source}: {count} documents")

    print(f"\nData directory: {args.output_dir}")


if __name__ == '__main__':
    main()