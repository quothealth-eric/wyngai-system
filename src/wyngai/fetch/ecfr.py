"""
eCFR (Electronic Code of Federal Regulations) fetcher.

Fetches regulations from the eCFR API for healthcare-related sections.
"""

import json
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
import requests
from datetime import datetime

from ..utils.config import config


class eCFRFetcher:
    """Fetches regulations from the eCFR API."""

    def __init__(self):
        self.base_url = config.ecfr_api_base
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'WyngAI/1.0 (Healthcare Training Data Pipeline)'
        })

    def get_key_sections(self) -> List[str]:
        """Get list of key healthcare-related CFR sections."""
        return [
            "title-29/part-2560/section-2560.503-1",  # ERISA claims procedures
            "title-45/part-147/section-147.136",      # ACA appeals procedures
            "title-26/part-54/section-54.9815-2719",  # Internal claims/appeals
            "title-45/part-164",                      # HIPAA Privacy/Security Rules
            "title-45/part-162",                      # HIPAA Administrative Requirements
            "title-42/part-422/subpart-M",           # Medicare Advantage appeals
            "title-42/part-423/subpart-U",           # Medicare Part D appeals
        ]

    def fetch_section(self, section_path: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a specific CFR section.

        Args:
            section_path: Path like "title-45/part-147/section-147.136"

        Returns:
            Section data as dict or None if failed
        """
        url = f"{self.base_url}/render/{section_path}"

        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            data = response.json()

            # Add fetch metadata
            data['_wyngai_metadata'] = {
                'source': 'eCFR API',
                'fetched_at': datetime.utcnow().isoformat(),
                'section_path': section_path,
                'api_url': url
            }

            return data

        except requests.RequestException as e:
            print(f"Error fetching {section_path}: {e}")
            return None

    def fetch_title(self, title_number: int) -> Optional[Dict[str, Any]]:
        """
        Fetch entire title structure.

        Args:
            title_number: CFR title number (e.g., 45 for HHS)

        Returns:
            Title structure as dict
        """
        url = f"{self.base_url}/titles/{title_number}"

        try:
            response = self.session.get(url, timeout=60)
            response.raise_for_status()

            data = response.json()

            # Add fetch metadata
            data['_wyngai_metadata'] = {
                'source': 'eCFR API',
                'fetched_at': datetime.utcnow().isoformat(),
                'title_number': title_number,
                'api_url': url
            }

            return data

        except requests.RequestException as e:
            print(f"Error fetching title {title_number}: {e}")
            return None

    def save_section(self, section_data: Dict[str, Any], output_dir: Path) -> Path:
        """
        Save section data to JSON file.

        Args:
            section_data: Section data from API
            output_dir: Output directory path

        Returns:
            Path to saved file
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Create filename from section path
        metadata = section_data.get('_wyngai_metadata', {})
        section_path = metadata.get('section_path', 'unknown')
        filename = section_path.replace('/', '_') + '.json'

        output_path = output_dir / filename

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(section_data, f, indent=2, ensure_ascii=False)

        print(f"Saved {section_path} to {output_path}")
        return output_path

    def fetch_key_sections(self, output_dir: Path, delay: float = 1.0) -> List[Path]:
        """
        Fetch all key healthcare CFR sections.

        Args:
            output_dir: Directory to save fetched sections
            delay: Delay between requests in seconds

        Returns:
            List of paths to saved files
        """
        saved_paths = []
        sections = self.get_key_sections()

        print(f"Fetching {len(sections)} key CFR sections...")

        for i, section in enumerate(sections, 1):
            print(f"[{i}/{len(sections)}] Fetching {section}")

            section_data = self.fetch_section(section)
            if section_data:
                saved_path = self.save_section(section_data, output_dir)
                saved_paths.append(saved_path)

            # Rate limiting
            if i < len(sections):
                time.sleep(delay)

        print(f"Completed fetching {len(saved_paths)}/{len(sections)} sections")
        return saved_paths

    def search_sections(self, query: str) -> List[Dict[str, Any]]:
        """
        Search CFR sections (if API supports it).

        Note: This is a placeholder - actual eCFR API search capabilities
        may be limited or require different endpoints.
        """
        # This would need to be implemented based on actual eCFR API search capabilities
        # For now, return empty list
        print(f"Search functionality not yet implemented for query: {query}")
        return []