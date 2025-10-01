"""
Hybrid RAG index with BM25 + vector embeddings.

Combines lexical and semantic search with authority-based reranking.
"""

import pickle
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from ..schemas import CHUNK


class HybridIndex:
    """Hybrid search index combining BM25 and vector embeddings."""

    def __init__(self,
                 embedding_model: str = "BAAI/bge-base-en-v1.5",
                 bm25_weight: float = 0.3,
                 vector_weight: float = 0.4,
                 authority_weight: float = 0.3):
        self.embedding_model_name = embedding_model
        self.bm25_weight = bm25_weight
        self.vector_weight = vector_weight
        self.authority_weight = authority_weight

        # Initialize components
        self.chunks: List[CHUNK] = []
        self.bm25_index: Optional[BM25Okapi] = None
        self.embeddings: Optional[np.ndarray] = None
        self.embedding_model: Optional[SentenceTransformer] = None

    def build_index(self, chunks: List[CHUNK]) -> None:
        """
        Build hybrid index from chunks.

        Args:
            chunks: List of CHUNK objects to index
        """
        print(f"Building hybrid index for {len(chunks)} chunks...")

        self.chunks = chunks
        texts = [chunk.text for chunk in chunks]

        # Build BM25 index
        print("Building BM25 index...")
        tokenized_docs = [text.lower().split() for text in texts]
        self.bm25_index = BM25Okapi(tokenized_docs)

        # Build vector index
        print("Loading embedding model...")
        self.embedding_model = SentenceTransformer(self.embedding_model_name)

        print("Generating embeddings...")
        self.embeddings = self.embedding_model.encode(
            texts,
            batch_size=32,
            show_progress_bar=True,
            convert_to_numpy=True
        )

        print(f"✅ Index built: {len(chunks)} chunks, {self.embeddings.shape[1]}D embeddings")

    def search(self,
               query: str,
               top_k: int = 10,
               min_score: float = 0.1) -> List[Tuple[CHUNK, float]]:
        """
        Hybrid search combining BM25 and vector similarity.

        Args:
            query: Search query
            top_k: Number of results to return
            min_score: Minimum combined score threshold

        Returns:
            List of (chunk, score) tuples sorted by relevance
        """
        if not self.bm25_index or self.embeddings is None or not self.embedding_model:
            raise ValueError("Index not built. Call build_index() first.")

        # BM25 search
        bm25_scores = self._bm25_search(query)

        # Vector search
        vector_scores = self._vector_search(query)

        # Authority scores
        authority_scores = self._get_authority_scores()

        # Combine scores
        combined_scores = self._combine_scores(bm25_scores, vector_scores, authority_scores)

        # Get top results
        results = []
        for i, score in enumerate(combined_scores):
            if score >= min_score:
                results.append((self.chunks[i], score))

        # Sort by score and return top_k
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def _bm25_search(self, query: str) -> np.ndarray:
        """Perform BM25 search and return normalized scores."""
        query_tokens = query.lower().split()
        scores = self.bm25_index.get_scores(query_tokens)

        # Normalize scores to [0, 1]
        if len(scores) > 0:
            max_score = max(scores)
            if max_score > 0:
                scores = scores / max_score

        return np.array(scores)

    def _vector_search(self, query: str) -> np.ndarray:
        """Perform vector similarity search and return normalized scores."""
        query_embedding = self.embedding_model.encode([query])

        # Calculate cosine similarity
        similarities = cosine_similarity(query_embedding, self.embeddings)[0]

        # Normalize to [0, 1] (cosine similarity is already in [-1, 1])
        normalized_scores = (similarities + 1) / 2

        return normalized_scores

    def _get_authority_scores(self) -> np.ndarray:
        """Get authority scores for all chunks."""
        return np.array([chunk.authority_rank for chunk in self.chunks])

    def _combine_scores(self,
                       bm25_scores: np.ndarray,
                       vector_scores: np.ndarray,
                       authority_scores: np.ndarray) -> np.ndarray:
        """Combine BM25, vector, and authority scores."""
        combined = (
            self.bm25_weight * bm25_scores +
            self.vector_weight * vector_scores +
            self.authority_weight * authority_scores
        )
        return combined

    def save_index(self, index_path: Path) -> None:
        """Save index to disk."""
        index_path.mkdir(parents=True, exist_ok=True)

        # Save chunks
        chunks_path = index_path / "chunks.json"
        with open(chunks_path, 'w') as f:
            chunk_data = [chunk.model_dump() for chunk in self.chunks]
            json.dump(chunk_data, f, indent=2, default=str)

        # Save BM25 index
        bm25_path = index_path / "bm25_index.pkl"
        with open(bm25_path, 'wb') as f:
            pickle.dump(self.bm25_index, f)

        # Save embeddings
        embeddings_path = index_path / "embeddings.npy"
        np.save(embeddings_path, self.embeddings)

        # Save metadata
        metadata = {
            'embedding_model': self.embedding_model_name,
            'num_chunks': len(self.chunks),
            'embedding_dim': self.embeddings.shape[1],
            'weights': {
                'bm25': self.bm25_weight,
                'vector': self.vector_weight,
                'authority': self.authority_weight
            }
        }

        metadata_path = index_path / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        print(f"✅ Index saved to {index_path}")

    def load_index(self, index_path: Path) -> None:
        """Load index from disk."""
        if not index_path.exists():
            raise ValueError(f"Index path does not exist: {index_path}")

        # Load metadata
        metadata_path = index_path / "metadata.json"
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Load chunks
        chunks_path = index_path / "chunks.json"
        with open(chunks_path, 'r') as f:
            chunk_data = json.load(f)
            self.chunks = [CHUNK(**data) for data in chunk_data]

        # Load BM25 index
        bm25_path = index_path / "bm25_index.pkl"
        with open(bm25_path, 'rb') as f:
            self.bm25_index = pickle.load(f)

        # Load embeddings
        embeddings_path = index_path / "embeddings.npy"
        self.embeddings = np.load(embeddings_path)

        # Load embedding model
        self.embedding_model_name = metadata['embedding_model']
        self.embedding_model = SentenceTransformer(self.embedding_model_name)

        print(f"✅ Index loaded: {len(self.chunks)} chunks, {self.embeddings.shape[1]}D embeddings")

    def get_chunk_by_id(self, chunk_id: str) -> Optional[CHUNK]:
        """Get chunk by ID."""
        for chunk in self.chunks:
            if str(chunk.chunk_id) == chunk_id:
                return chunk
        return None

    def get_statistics(self) -> Dict[str, Any]:
        """Get index statistics."""
        if not self.chunks:
            return {"status": "empty"}

        # Calculate topic distribution
        all_topics = []
        for chunk in self.chunks:
            all_topics.extend(chunk.topics)

        topic_counts = {}
        for topic in all_topics:
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

        # Calculate authority distribution
        authority_scores = [chunk.authority_rank for chunk in self.chunks]

        return {
            "status": "ready",
            "total_chunks": len(self.chunks),
            "embedding_model": self.embedding_model_name,
            "embedding_dimension": self.embeddings.shape[1] if self.embeddings is not None else 0,
            "authority_stats": {
                "mean": np.mean(authority_scores),
                "min": np.min(authority_scores),
                "max": np.max(authority_scores)
            },
            "top_topics": sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:10],
            "weights": {
                "bm25": self.bm25_weight,
                "vector": self.vector_weight,
                "authority": self.authority_weight
            }
        }


class CitationExtractor:
    """Extracts and formats citations from search results."""

    def extract_citations(self, chunks: List[CHUNK]) -> List[Dict[str, Any]]:
        """
        Extract structured citations from chunks.

        Args:
            chunks: List of CHUNK objects

        Returns:
            List of citation dictionaries
        """
        citations = []

        for chunk in chunks:
            # Get parent document info from chunk metadata
            citation_info = {
                'chunk_id': str(chunk.chunk_id),
                'source_citations': chunk.citations,
                'section_path': chunk.section_path,
                'headings': chunk.headings,
                'authority_rank': chunk.authority_rank,
                'topics': chunk.topics
            }

            citations.append(citation_info)

        return citations

    def format_citation_text(self, chunks: List[CHUNK]) -> str:
        """Format citations as text for inclusion in responses."""
        citations = []

        for i, chunk in enumerate(chunks, 1):
            # Build citation string
            citation_parts = []

            if chunk.citations:
                citation_parts.extend(chunk.citations)

            if chunk.section_path:
                citation_parts.append(" -> ".join(chunk.section_path))

            citation_text = f"[{i}] {'; '.join(citation_parts)}" if citation_parts else f"[{i}] Internal Reference"
            citations.append(citation_text)

        return "\n".join(citations)