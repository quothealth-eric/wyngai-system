"""
Medicare Coverage Database (MCD) parser.

Converts CMS MCD data (NCDs, LCDs) to normalized DOC format.
"""

import csv
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from uuid import uuid4

from ..schemas import DOC, DocType, Jurisdiction


class MCDParser:
    """Parses Medicare Coverage Database files into normalized DOC format."""

    def __init__(self):
        self.authority_rank = 0.8  # High authority for CMS coverage policies

    def parse_ncd_csv(self, file_path: Path) -> List[DOC]:
        """
        Parse NCD (National Coverage Determination) CSV file.

        Args:
            file_path: Path to NCD CSV file

        Returns:
            List of normalized DOC objects
        """
        docs = []

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)

                for row in reader:
                    doc = self._parse_ncd_row(row)
                    if doc:
                        docs.append(doc)

        except Exception as e:
            print(f"Error parsing NCD CSV {file_path}: {e}")

        return docs

    def parse_lcd_csv(self, file_path: Path) -> List[DOC]:
        """
        Parse LCD (Local Coverage Determination) CSV file.

        Args:
            file_path: Path to LCD CSV file

        Returns:
            List of normalized DOC objects
        """
        docs = []

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)

                for row in reader:
                    doc = self._parse_lcd_row(row)
                    if doc:
                        docs.append(doc)

        except Exception as e:
            print(f"Error parsing LCD CSV {file_path}: {e}")

        return docs

    def _parse_ncd_row(self, row: Dict[str, str]) -> Optional[DOC]:
        """Parse a single NCD row into DOC format."""
        try:
            ncd_id = row.get('NCD_ID', '').strip()
            title = row.get('NCD_Title', '').strip()

            if not ncd_id or not title:
                return None

            # Build content from available fields
            content_parts = [f"NCD Title: {title}"]

            if row.get('Benefit_Category'):
                content_parts.append(f"Benefit Category: {row['Benefit_Category']}")

            if row.get('Coverage_Description'):
                content_parts.append(f"Coverage Description: {row['Coverage_Description']}")

            if row.get('Indications_and_Limitations'):
                content_parts.append(f"Indications and Limitations: {row['Indications_and_Limitations']}")

            if row.get('Coverage_Guidance'):
                content_parts.append(f"Coverage Guidance: {row['Coverage_Guidance']}")

            content = "\n\n".join(content_parts)

            # Parse dates
            effective_date = self._parse_date(row.get('Effective_Date'))

            # Generate citation
            citation = f"NCD {ncd_id}"

            doc = DOC(
                doc_id=uuid4(),
                source_id=f"ncd_{ncd_id}",
                category="Medicare Coverage & Policy",
                title=f"{citation} - {title}",
                doc_type=DocType.MANUAL,
                jurisdiction=Jurisdiction.MEDICARE,
                citation=citation,
                effective_date=effective_date,
                published_date=None,
                revised_date=None,
                version=datetime.now().strftime("%Y%m%d"),
                url=f"https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid={ncd_id}",
                license="Public Domain",
                text=content,
                retrieval_priority=self.authority_rank,
                tags=self._extract_ncd_tags(row),
                metadata={
                    'ncd_id': ncd_id,
                    'benefit_category': row.get('Benefit_Category', ''),
                    'contractor': row.get('Contractor', ''),
                    'jurisdiction': row.get('Jurisdiction', ''),
                    'coverage_type': 'NCD'
                }
            )

            return doc

        except Exception as e:
            print(f"Error parsing NCD row: {e}")
            return None

    def _parse_lcd_row(self, row: Dict[str, str]) -> Optional[DOC]:
        """Parse a single LCD row into DOC format."""
        try:
            lcd_id = row.get('LCD_ID', '').strip()
            title = row.get('LCD_Title', '').strip()

            if not lcd_id or not title:
                return None

            # Build content from available fields
            content_parts = [f"LCD Title: {title}"]

            if row.get('Contractor_Name'):
                content_parts.append(f"Contractor: {row['Contractor_Name']}")

            if row.get('Coverage_Description'):
                content_parts.append(f"Coverage Description: {row['Coverage_Description']}")

            if row.get('Indications_and_Limitations'):
                content_parts.append(f"Indications and Limitations: {row['Indications_and_Limitations']}")

            if row.get('Coverage_Guidance'):
                content_parts.append(f"Coverage Guidance: {row['Coverage_Guidance']}")

            content = "\n\n".join(content_parts)

            # Parse dates
            effective_date = self._parse_date(row.get('Effective_Date'))

            # Generate citation
            citation = f"LCD {lcd_id}"
            contractor = row.get('Contractor_Name', 'Unknown')

            doc = DOC(
                doc_id=uuid4(),
                source_id=f"lcd_{lcd_id}_{contractor.lower().replace(' ', '_')}",
                category="Medicare Coverage & Policy",
                title=f"{citation} - {title} ({contractor})",
                doc_type=DocType.MANUAL,
                jurisdiction=Jurisdiction.MEDICARE,
                citation=citation,
                effective_date=effective_date,
                published_date=None,
                revised_date=None,
                version=datetime.now().strftime("%Y%m%d"),
                url=f"https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid={lcd_id}",
                license="Public Domain",
                text=content,
                retrieval_priority=self.authority_rank * 0.9,  # Slightly lower than NCDs
                tags=self._extract_lcd_tags(row),
                metadata={
                    'lcd_id': lcd_id,
                    'contractor_name': contractor,
                    'jurisdiction_states': row.get('Jurisdiction_States', ''),
                    'coverage_type': 'LCD'
                }
            )

            return doc

        except Exception as e:
            print(f"Error parsing LCD row: {e}")
            return None

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date string to datetime object."""
        if not date_str or date_str.strip() == '':
            return None

        # Try common date formats
        date_formats = [
            "%m/%d/%Y",
            "%Y-%m-%d",
            "%m-%d-%Y",
            "%Y/%m/%d"
        ]

        for fmt in date_formats:
            try:
                return datetime.strptime(date_str.strip(), fmt)
            except ValueError:
                continue

        return None

    def _extract_ncd_tags(self, row: Dict[str, str]) -> List[str]:
        """Extract relevant tags from NCD data."""
        tags = ['medicare', 'ncd', 'coverage_determination']

        # Add benefit category tags
        benefit_cat = row.get('Benefit_Category', '').lower()
        if 'durable medical equipment' in benefit_cat:
            tags.append('dme')
        if 'diagnostic' in benefit_cat:
            tags.append('diagnostic')
        if 'therapeutic' in benefit_cat:
            tags.append('therapeutic')
        if 'procedure' in benefit_cat:
            tags.append('procedure')

        # Add coverage-specific tags
        title_lower = row.get('NCD_Title', '').lower()
        if 'prior authorization' in title_lower:
            tags.append('prior_authorization')
        if 'medical necessity' in title_lower:
            tags.append('medical_necessity')

        return list(set(tags))

    def _extract_lcd_tags(self, row: Dict[str, str]) -> List[str]:
        """Extract relevant tags from LCD data."""
        tags = ['medicare', 'lcd', 'local_coverage']

        # Add contractor-based tags
        contractor = row.get('Contractor_Name', '').lower()
        if 'novitas' in contractor:
            tags.append('novitas')
        elif 'palmetto' in contractor:
            tags.append('palmetto')
        elif 'cgsmedicare' in contractor:
            tags.append('cgs')

        # Add coverage-specific tags
        title_lower = row.get('LCD_Title', '').lower()
        if 'prior authorization' in title_lower:
            tags.append('prior_authorization')
        if 'medical necessity' in title_lower:
            tags.append('medical_necessity')

        return list(set(tags))

    def parse_directory(self, input_dir: Path) -> List[DOC]:
        """
        Parse all MCD CSV files in a directory.

        Args:
            input_dir: Directory containing MCD CSV files

        Returns:
            List of normalized DOC objects
        """
        docs = []
        csv_files = list(input_dir.glob("*.csv"))

        print(f"Parsing {len(csv_files)} MCD files from {input_dir}")

        for file_path in csv_files:
            filename = file_path.name.lower()

            if 'ncd' in filename:
                file_docs = self.parse_ncd_csv(file_path)
                docs.extend(file_docs)
                print(f"✓ Parsed {len(file_docs)} NCDs from {file_path.name}")
            elif 'lcd' in filename:
                file_docs = self.parse_lcd_csv(file_path)
                docs.extend(file_docs)
                print(f"✓ Parsed {len(file_docs)} LCDs from {file_path.name}")
            else:
                print(f"? Skipped unknown MCD file: {file_path.name}")

        print(f"Successfully parsed {len(docs)} total MCD documents")
        return docs