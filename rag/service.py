"""
FastAPI RAG service with /ask endpoint and citation discipline.

Provides RESTful API for healthcare regulation querying with authoritative citations.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from pathlib import Path
import logging

import sys
sys.path.append(str(Path(__file__).parent.parent / "src"))
from wyngai.rag.hybrid_index_lite import HybridIndexLite, CitationExtractor
from wyngai.schemas import CHUNK


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QueryRequest(BaseModel):
    """Request model for /ask endpoint."""
    question: str = Field(..., description="Healthcare regulation question")
    max_results: int = Field(default=5, ge=1, le=20, description="Maximum number of results")
    min_score: float = Field(default=0.2, ge=0.0, le=1.0, description="Minimum relevance score")
    include_citations: bool = Field(default=True, description="Include detailed citations")


class SourceInfo(BaseModel):
    """Source information model."""
    chunk_id: str
    authority_rank: float
    section_path: List[str]
    citations: List[str]
    topics: List[str]
    excerpt: str


class QueryResponse(BaseModel):
    """Response model for /ask endpoint."""
    question: str
    answer: str
    sources: List[SourceInfo]
    citation_text: str
    metadata: Dict[str, Any]


class HealthCheck(BaseModel):
    """Health check response model."""
    status: str
    index_stats: Dict[str, Any]


class RAGService:
    """RAG service implementation."""

    def __init__(self, index_path: Optional[Path] = None):
        self.index = HybridIndexLite()
        self.citation_extractor = CitationExtractor()
        self.index_path = index_path or Path("rag/index")

        if self.index_path.exists():
            try:
                self.index.load_index(self.index_path)
                logger.info("RAG index loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load index: {e}")

    def search(self, request: QueryRequest) -> QueryResponse:
        """
        Search for relevant healthcare regulation information.

        Args:
            request: Query request

        Returns:
            Query response with citations
        """
        if not self.index.chunks:
            raise HTTPException(
                status_code=503,
                detail="RAG index not available. Please build index first."
            )

        # Perform hybrid search
        results = self.index.search(
            query=request.question,
            top_k=request.max_results,
            min_score=request.min_score
        )

        if not results:
            return QueryResponse(
                question=request.question,
                answer="No relevant information found in the healthcare regulation database. Please refine your query or check if the topic is covered in our sources.",
                sources=[],
                citation_text="",
                metadata={"total_results": 0, "search_performed": True}
            )

        # Extract chunks and scores
        chunks, scores = zip(*results)

        # Generate answer
        answer = self._generate_answer(request.question, chunks)

        # Build source information
        sources = []
        for chunk, score in results:
            source = SourceInfo(
                chunk_id=str(chunk.chunk_id),
                authority_rank=chunk.authority_rank,
                section_path=chunk.section_path,
                citations=chunk.citations,
                topics=chunk.topics,
                excerpt=self._create_excerpt(chunk.text, request.question)
            )
            sources.append(source)

        # Generate citation text
        citation_text = ""
        if request.include_citations:
            citation_text = self.citation_extractor.format_citation_text(chunks)

        # Build metadata
        metadata = {
            "total_results": len(results),
            "avg_authority_rank": sum(scores) / len(scores),
            "search_performed": True,
            "top_topics": self._get_top_topics(chunks)
        }

        return QueryResponse(
            question=request.question,
            answer=answer,
            sources=sources,
            citation_text=citation_text,
            metadata=metadata
        )

    def _generate_answer(self, question: str, chunks: List[CHUNK]) -> str:
        """
        Generate answer from relevant chunks.

        Note: This is a rule-based approach. In production, this would
        use a language model for generation.
        """
        # For now, return a structured summary of the most relevant information
        if not chunks:
            return "No relevant information found."

        # Get the highest authority chunk
        top_chunk = max(chunks, key=lambda c: c.authority_rank)

        # Build answer from top chunks
        answer_parts = [
            f"Based on healthcare regulations and policies, here's what I found:",
            "",
            f"**Primary Source ({top_chunk.authority_rank:.2f} authority):**"
        ]

        # Add excerpt from top chunk
        excerpt = self._create_excerpt(top_chunk.text, question, max_length=300)
        answer_parts.append(excerpt)

        # Add additional context if available
        if len(chunks) > 1:
            answer_parts.extend([
                "",
                "**Additional Context:**"
            ])

            for chunk in chunks[1:3]:  # Add up to 2 more chunks
                if chunk.authority_rank >= 0.5:  # Only high-authority sources
                    short_excerpt = self._create_excerpt(chunk.text, question, max_length=150)
                    answer_parts.append(f"- {short_excerpt}")

        # Add citation reminder
        answer_parts.extend([
            "",
            "**Important:** This information is provided for reference only. Always consult official sources and qualified professionals for specific cases. See citations below for authoritative sources."
        ])

        return "\n".join(answer_parts)

    def _create_excerpt(self, text: str, question: str, max_length: int = 200) -> str:
        """Create a relevant excerpt from text based on question."""
        # Simple approach: find sentences containing question keywords
        question_words = set(question.lower().split())
        sentences = text.split('.')

        # Score sentences by keyword overlap
        scored_sentences = []
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 20:  # Skip very short sentences
                continue

            sentence_words = set(sentence.lower().split())
            overlap = len(question_words.intersection(sentence_words))
            scored_sentences.append((overlap, sentence))

        # Get best sentences
        scored_sentences.sort(key=lambda x: x[0], reverse=True)

        # Build excerpt
        excerpt_parts = []
        current_length = 0

        for score, sentence in scored_sentences:
            if score > 0 and current_length + len(sentence) <= max_length:
                excerpt_parts.append(sentence)
                current_length += len(sentence)

        if not excerpt_parts:
            # Fallback: use beginning of text
            excerpt_parts = [text[:max_length] + "..."]

        return ". ".join(excerpt_parts)

    def _get_top_topics(self, chunks: List[CHUNK]) -> List[str]:
        """Get most common topics from chunks."""
        topic_counts = {}
        for chunk in chunks:
            for topic in chunk.topics:
                topic_counts[topic] = topic_counts.get(topic, 0) + 1

        # Return top 5 topics
        return [topic for topic, _ in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:5]]

    def get_health_status(self) -> HealthCheck:
        """Get service health status."""
        return HealthCheck(
            status="healthy" if self.index.chunks else "no_index",
            index_stats=self.index.get_statistics()
        )


# Initialize FastAPI app
app = FastAPI(
    title="WyngAI RAG Service",
    description="Healthcare regulation query service with authoritative citations",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.getwyng.co", "https://getwyng.co", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Initialize RAG service
rag_service = RAGService()


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint."""
    return {
        "service": "WyngAI RAG Service",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint."""
    return rag_service.get_health_status()


@app.post("/ask", response_model=QueryResponse)
async def ask_question(request: QueryRequest):
    """
    Ask a healthcare regulation question.

    This endpoint searches the healthcare regulation database and returns
    relevant information with authoritative citations.

    **Example questions:**
    - "What are the appeal deadlines for ERISA plans?"
    - "What prior authorization requirements apply to MRI scans?"
    - "What are the medical necessity criteria for DME?"
    """
    try:
        return rag_service.search(request)
    except Exception as e:
        logger.error(f"Error processing question: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/search")
async def search_get(
    q: str = Query(..., description="Question to search"),
    max_results: int = Query(5, ge=1, le=20, description="Maximum results"),
    min_score: float = Query(0.2, ge=0.0, le=1.0, description="Minimum score")
):
    """
    GET endpoint for search (for simple integration).
    """
    request = QueryRequest(
        question=q,
        max_results=max_results,
        min_score=min_score
    )
    return await ask_question(request)


@app.get("/stats")
async def get_statistics():
    """Get RAG index statistics."""
    return rag_service.index.get_statistics()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)