"""
Federal Register API fetcher.

Fetches Federal Register documents related to healthcare regulations.
"""

import json
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
import requests
from datetime import datetime, date

from ..utils.config import config


class FederalRegisterFetcher:
    """Fetches documents from the Federal Register API."""

    def __init__(self):
        self.base_url = config.federal_register_api_base
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'WyngAI/1.0 (Healthcare Training Data Pipeline)'
        })

    def get_key_terms(self) -> List[str]:
        """Get key healthcare terms to search for."""
        return [
            "No Surprises Act",
            "Transparency in Coverage",
            "Price Transparency",
            "HIPAA",
            "Medicare Advantage",
            "Part D",
            "ERISA",
            "Balance billing",
            "Out-of-network",
            "Prior authorization",
            "Medical necessity"
        ]

    def search_articles(
        self,
        term: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        per_page: int = 100,
        max_pages: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Search Federal Register articles by term.

        Args:
            term: Search term
            start_date: Start date for search
            end_date: End date for search
            per_page: Results per page (max 1000)
            max_pages: Maximum pages to fetch

        Returns:
            List of article data
        """
        articles = []
        page = 1

        while page <= max_pages:
            params = {
                'conditions[term]': term,
                'per_page': per_page,
                'page': page,
                'fields[]': [
                    'title', 'abstract', 'body_html_url', 'html_url',
                    'pdf_url', 'publication_date', 'document_number',
                    'type', 'agencies', 'docket_ids', 'citation',
                    'effective_on', 'comments_close_on'
                ]
            }

            if start_date:
                params['conditions[publication_date][gte]'] = start_date.strftime('%Y-%m-%d')
            if end_date:
                params['conditions[publication_date][lte]'] = end_date.strftime('%Y-%m-%d')

            try:
                response = self.session.get(
                    f"{self.base_url}/articles.json",
                    params=params,
                    timeout=30
                )
                response.raise_for_status()

                data = response.json()
                page_articles = data.get('results', [])

                # Add fetch metadata to each article
                for article in page_articles:
                    article['_wyngai_metadata'] = {
                        'source': 'Federal Register API',
                        'fetched_at': datetime.utcnow().isoformat(),
                        'search_term': term,
                        'api_url': response.url
                    }

                articles.extend(page_articles)

                # Check if we have more pages
                total_pages = data.get('total_pages', 0)
                if page >= total_pages or len(page_articles) == 0:
                    break

                print(f"Fetched page {page}/{min(max_pages, total_pages)} for term '{term}' ({len(page_articles)} articles)")
                page += 1

                # Rate limiting
                time.sleep(0.5)

            except requests.RequestException as e:
                print(f"Error searching for '{term}' page {page}: {e}")
                break

        print(f"Found {len(articles)} total articles for term '{term}'")
        return articles

    def get_article_content(self, article: Dict[str, Any]) -> Optional[str]:
        """
        Fetch full HTML content for an article.

        Args:
            article: Article metadata from search results

        Returns:
            HTML content as string or None if failed
        """
        html_url = article.get('body_html_url')
        if not html_url:
            return None

        try:
            response = self.session.get(html_url, timeout=30)
            response.raise_for_status()
            return response.text

        except requests.RequestException as e:
            print(f"Error fetching content for article {article.get('document_number')}: {e}")
            return None

    def save_articles(
        self,
        articles: List[Dict[str, Any]],
        output_dir: Path,
        fetch_content: bool = False
    ) -> List[Path]:
        """
        Save articles to JSON files.

        Args:
            articles: List of articles to save
            output_dir: Output directory
            fetch_content: Whether to fetch full HTML content

        Returns:
            List of paths to saved files
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        saved_paths = []

        for article in articles:
            doc_number = article.get('document_number', 'unknown')

            # Fetch full content if requested
            if fetch_content:
                html_content = self.get_article_content(article)
                if html_content:
                    article['body_html_content'] = html_content
                    time.sleep(0.5)  # Rate limiting

            filename = f"fedreg_{doc_number}.json"
            output_path = output_dir / filename

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(article, f, indent=2, ensure_ascii=False)

            saved_paths.append(output_path)

        print(f"Saved {len(saved_paths)} articles to {output_dir}")
        return saved_paths

    def fetch_healthcare_documents(
        self,
        output_dir: Path,
        since_date: Optional[date] = None,
        fetch_content: bool = False
    ) -> List[Path]:
        """
        Fetch all healthcare-related Federal Register documents.

        Args:
            output_dir: Output directory
            since_date: Only fetch documents since this date
            fetch_content: Whether to fetch full HTML content

        Returns:
            List of paths to saved files
        """
        all_articles = []
        terms = self.get_key_terms()

        print(f"Fetching Federal Register documents for {len(terms)} terms...")

        for i, term in enumerate(terms, 1):
            print(f"[{i}/{len(terms)}] Searching for '{term}'")

            articles = self.search_articles(
                term=term,
                start_date=since_date,
                per_page=100,
                max_pages=5  # Limit to avoid overwhelming the API
            )

            all_articles.extend(articles)
            time.sleep(1)  # Rate limiting between terms

        # Remove duplicates based on document_number
        unique_articles = {}
        for article in all_articles:
            doc_num = article.get('document_number')
            if doc_num and doc_num not in unique_articles:
                unique_articles[doc_num] = article

        articles_list = list(unique_articles.values())
        print(f"Found {len(articles_list)} unique articles after deduplication")

        # Save articles
        return self.save_articles(articles_list, output_dir, fetch_content)