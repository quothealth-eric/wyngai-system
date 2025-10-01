"""
Enhanced RAG Service with Citation Discipline
Healthcare billing/appeals LLM with authoritative source grounding
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import asyncio
import json
from pathlib import Path
import pandas as pd
from datetime import datetime
import hashlib

# Vector and search imports
try:
    from sentence_transformers import SentenceTransformer
    from rank_bm25 import BM25Okapi
    import numpy as np
    DEPENDENCIES_AVAILABLE = True
except ImportError:
    DEPENDENCIES_AVAILABLE = False
    logging.warning("⚠️ Some dependencies not available. Install: sentence-transformers, rank-bm25")

logger = logging.getLogger(__name__)

# API Models
class QueryRequest(BaseModel):
    question: str
    context: Optional[str] = None
    max_sources: int = 5
    authority_threshold: float = 0.5

class Citation(BaseModel):
    source_id: str
    title: str
    url: str
    authority_rank: float
    excerpt: str
    section_path: List[str] = []

class GroundedResponse(BaseModel):
    answer: str
    confidence: float
    citations: List[Citation]
    authority_sources: List[str]
    legal_basis: List[str]
    guidance_summary: str
    requires_professional_review: bool = False

# Enhanced RAG Service
app = FastAPI(title="WyngAI Enhanced RAG", version="1.0.0")

class EnhancedRAGService:
    """Enhanced RAG service with citation discipline and authority ranking"""

    def __init__(self):
        self.embedder = None
        self.bm25_index = None
        self.document_store = {}
        self.chunk_store = {}
        self.authority_rankings = {}
        self.index_built = False

        # Authority hierarchy (higher = more authoritative)
        self.authority_weights = {
            'federal_statute': 1.0,
            'federal_regulation': 0.95,
            'cms_manual': 0.9,
            'state_statute': 0.85,
            'state_regulation': 0.8,
            'state_doi_guidance': 0.75,
            'court_decision': 0.7,
            'payer_policy': 0.6,
            'industry_guidance': 0.4
        }

    async def initialize(self):
        """Initialize the RAG service"""
        if not DEPENDENCIES_AVAILABLE:
            logger.error("❌ Required dependencies not available")
            return False

        try:
            logger.info("🔧 Initializing Enhanced RAG Service...")

            # Load sentence transformer for semantic search
            self.embedder = SentenceTransformer('BAAI/bge-base-en-v1.5')

            # Load existing index if available
            await self._load_existing_index()

            logger.info("✅ Enhanced RAG Service initialized")
            return True

        except Exception as e:
            logger.error(f"❌ Error initializing RAG service: {e}")
            return False

    async def build_index(self, rebuild: bool = False):
        """Build hybrid BM25 + vector index from warehouse data"""
        if self.index_built and not rebuild:
            logger.info("📚 Index already built")
            return

        logger.info("🏗️ Building hybrid RAG index...")

        try:
            # Load documents from warehouse
            documents = await self._load_warehouse_documents()
            chunks = await self._load_warehouse_chunks()

            if not chunks:
                logger.warning("⚠️ No chunks found - using placeholder data")
                chunks = self._create_placeholder_chunks()

            # Build BM25 index
            chunk_texts = [chunk['text'] for chunk in chunks]
            tokenized_chunks = [text.split() for text in chunk_texts]
            self.bm25_index = BM25Okapi(tokenized_chunks)

            # Build vector embeddings
            chunk_embeddings = self.embedder.encode(chunk_texts)

            # Store chunks with embeddings and metadata
            for i, chunk in enumerate(chunks):
                chunk_id = chunk.get('chunk_id', f'chunk_{i}')
                self.chunk_store[chunk_id] = {
                    **chunk,
                    'embedding': chunk_embeddings[i],
                    'authority_rank': self._calculate_authority_rank(chunk)
                }

            # Store documents
            for doc in documents:
                doc_id = doc.get('doc_id', f'doc_{len(self.document_store)}')
                self.document_store[doc_id] = doc

            self.index_built = True
            logger.info(f"✅ Index built: {len(self.chunk_store)} chunks, {len(self.document_store)} documents")

        except Exception as e:
            logger.error(f"❌ Error building index: {e}")
            raise

    async def ask(self, request: QueryRequest) -> GroundedResponse:
        """Process query and return grounded response with citations"""
        if not self.index_built:
            await self.build_index()

        logger.info(f"🔍 Processing query: {request.question[:100]}...")

        try:
            # Retrieve relevant chunks
            relevant_chunks = await self._hybrid_retrieve(
                request.question,
                max_results=request.max_sources * 3  # Over-retrieve for reranking
            )

            # Rerank by authority and relevance
            ranked_chunks = self._rerank_by_authority(relevant_chunks, request.authority_threshold)

            # Generate grounded response
            response = await self._generate_grounded_response(
                request.question,
                ranked_chunks[:request.max_sources],
                request.context
            )

            return response

        except Exception as e:
            logger.error(f"❌ Error processing query: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def _hybrid_retrieve(self, query: str, max_results: int = 15) -> List[Dict]:
        """Hybrid BM25 + semantic retrieval"""
        results = []

        try:
            # BM25 retrieval
            query_tokens = query.split()
            bm25_scores = self.bm25_index.get_scores(query_tokens)
            bm25_results = [(i, score) for i, score in enumerate(bm25_scores)]
            bm25_results.sort(key=lambda x: x[1], reverse=True)

            # Semantic retrieval
            query_embedding = self.embedder.encode([query])[0]
            semantic_scores = []

            for chunk_id, chunk_data in self.chunk_store.items():
                similarity = np.dot(query_embedding, chunk_data['embedding'])
                semantic_scores.append((chunk_id, similarity))

            semantic_scores.sort(key=lambda x: x[1], reverse=True)

            # Combine results with weighted scoring
            combined_scores = {}

            # Add BM25 scores (lexical matching)
            for i, (chunk_idx, bm25_score) in enumerate(bm25_results[:max_results]):
                chunk_id = list(self.chunk_store.keys())[chunk_idx]
                combined_scores[chunk_id] = combined_scores.get(chunk_id, 0) + bm25_score * 0.4

            # Add semantic scores
            for chunk_id, sem_score in semantic_scores[:max_results]:
                combined_scores[chunk_id] = combined_scores.get(chunk_id, 0) + sem_score * 0.6

            # Sort by combined score
            ranked_chunks = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)

            # Return chunk data with scores
            for chunk_id, score in ranked_chunks[:max_results]:
                chunk_data = self.chunk_store[chunk_id].copy()
                chunk_data['retrieval_score'] = score
                results.append(chunk_data)

            return results

        except Exception as e:
            logger.error(f"❌ Error in hybrid retrieval: {e}")
            return []

    def _rerank_by_authority(self, chunks: List[Dict], threshold: float = 0.5) -> List[Dict]:
        """Rerank chunks by authority and relevance"""
        try:
            # Calculate final ranking score
            for chunk in chunks:
                authority_rank = chunk.get('authority_rank', 0.5)
                retrieval_score = chunk.get('retrieval_score', 0.0)

                # Combined score: authority weight + retrieval relevance
                chunk['final_score'] = (authority_rank * 0.4) + (retrieval_score * 0.6)

            # Sort by final score and filter by threshold
            ranked_chunks = [c for c in chunks if c.get('authority_rank', 0) >= threshold]
            ranked_chunks.sort(key=lambda x: x['final_score'], reverse=True)

            return ranked_chunks

        except Exception as e:
            logger.error(f"❌ Error in authority reranking: {e}")
            return chunks

    async def _generate_grounded_response(
        self,
        question: str,
        relevant_chunks: List[Dict],
        context: Optional[str] = None
    ) -> GroundedResponse:
        """Generate response grounded in authoritative sources"""

        if not relevant_chunks:
            # Never answer without authoritative citations
            return GroundedResponse(
                answer="I cannot provide guidance without access to authoritative healthcare regulations and policies. Please consult with a healthcare professional or your insurance provider directly.",
                confidence=0.0,
                citations=[],
                authority_sources=[],
                legal_basis=[],
                guidance_summary="No authoritative sources available for this query.",
                requires_professional_review=True
            )

        try:
            # Extract citations
            citations = []
            authority_sources = []
            legal_basis = []

            for chunk in relevant_chunks:
                doc_id = chunk.get('doc_id', '')
                doc = self.document_store.get(doc_id, {})

                citation = Citation(
                    source_id=doc_id,
                    title=doc.get('title', 'Unknown Source'),
                    url=doc.get('url', ''),
                    authority_rank=chunk.get('authority_rank', 0.0),
                    excerpt=chunk.get('text', '')[:200] + "...",
                    section_path=chunk.get('section_path', [])
                )
                citations.append(citation)

                # Categorize sources
                source_category = doc.get('category', '').lower()
                if any(term in source_category for term in ['federal', 'cfr', 'cms']):
                    authority_sources.append(doc.get('title', ''))
                    legal_basis.append(f"{doc.get('citation', '')}: {chunk.get('text', '')[:100]}...")

            # Generate comprehensive answer
            answer = self._construct_authoritative_answer(question, relevant_chunks, context)

            # Calculate confidence based on source authority
            avg_authority = sum(c.authority_rank for c in citations) / len(citations) if citations else 0
            confidence = min(0.95, avg_authority + 0.1)

            # Determine if professional review needed
            requires_review = (
                avg_authority < 0.7 or
                len(citations) < 2 or
                any(term in question.lower() for term in ['appeal', 'deny', 'lawsuit', 'legal'])
            )

            guidance_summary = f"Based on {len(citations)} authoritative sources including {', '.join(authority_sources[:3])}"

            return GroundedResponse(
                answer=answer,
                confidence=confidence,
                citations=citations,
                authority_sources=authority_sources,
                legal_basis=legal_basis,
                guidance_summary=guidance_summary,
                requires_professional_review=requires_review
            )

        except Exception as e:
            logger.error(f"❌ Error generating grounded response: {e}")
            raise

    def _construct_authoritative_answer(
        self,
        question: str,
        chunks: List[Dict],
        context: Optional[str] = None
    ) -> str:
        """Construct authoritative answer with proper citations"""

        try:
            # Categorize guidance by type
            federal_guidance = []
            state_guidance = []
            clinical_guidance = []
            procedural_guidance = []

            for chunk in chunks:
                doc_id = chunk.get('doc_id', '')
                doc = self.document_store.get(doc_id, {})
                category = doc.get('category', '').lower()
                text = chunk.get('text', '')

                if any(term in category for term in ['federal', 'cfr', 'cms']):
                    federal_guidance.append(text)
                elif 'state' in category:
                    state_guidance.append(text)
                elif any(term in category for term in ['medical', 'clinical']):
                    clinical_guidance.append(text)
                else:
                    procedural_guidance.append(text)

            # Construct structured answer
            answer_parts = []

            # Always start with disclaimer
            answer_parts.append(
                "Based on available healthcare regulations and policies, here is guidance for your situation:"
            )

            # Add federal guidance first (highest authority)
            if federal_guidance:
                answer_parts.append(
                    f"\n**Federal Regulations and CMS Guidance:**\n"
                    f"{self._summarize_guidance(federal_guidance)}"
                )

            # Add state-specific guidance
            if state_guidance:
                answer_parts.append(
                    f"\n**State-Specific Requirements:**\n"
                    f"{self._summarize_guidance(state_guidance)}"
                )

            # Add procedural guidance
            if procedural_guidance:
                answer_parts.append(
                    f"\n**Procedural Steps:**\n"
                    f"{self._summarize_guidance(procedural_guidance)}"
                )

            # Add context if provided
            if context:
                answer_parts.append(f"\n**Additional Context:** {context}")

            # Always end with professional consultation recommendation
            answer_parts.append(
                "\n**Important:** This guidance is based on general regulations and policies. "
                "For your specific situation, consider consulting with a healthcare advocate, "
                "insurance specialist, or attorney specializing in healthcare law."
            )

            return "\n".join(answer_parts)

        except Exception as e:
            logger.error(f"❌ Error constructing answer: {e}")
            return "Unable to construct authoritative response due to technical error."

    def _summarize_guidance(self, guidance_texts: List[str]) -> str:
        """Summarize guidance from multiple sources"""
        if not guidance_texts:
            return "No specific guidance available."

        # Simple extractive summary - take most relevant sentences
        combined_text = " ".join(guidance_texts)
        sentences = combined_text.split('.')

        # Filter and rank sentences by relevance
        relevant_sentences = [s.strip() for s in sentences if len(s.strip()) > 20][:3]

        return ". ".join(relevant_sentences) + "."

    def _calculate_authority_rank(self, chunk: Dict) -> float:
        """Calculate authority ranking for a chunk"""
        doc_id = chunk.get('doc_id', '')
        doc = self.document_store.get(doc_id, {})

        category = doc.get('category', '').lower()
        source = doc.get('source', '').lower()

        # Base authority from source type
        base_authority = 0.5

        if 'federal' in category or 'cfr' in source:
            base_authority = self.authority_weights.get('federal_regulation', 0.95)
        elif 'cms' in source:
            base_authority = self.authority_weights.get('cms_manual', 0.9)
        elif 'state' in category and 'statute' in category:
            base_authority = self.authority_weights.get('state_statute', 0.85)
        elif 'state' in category:
            base_authority = self.authority_weights.get('state_doi_guidance', 0.75)
        elif 'court' in category:
            base_authority = self.authority_weights.get('court_decision', 0.7)
        elif 'payer' in category:
            base_authority = self.authority_weights.get('payer_policy', 0.6)

        # Adjust for recency (newer is slightly better)
        published_date = doc.get('published_date')
        if published_date:
            try:
                pub_datetime = datetime.fromisoformat(published_date.replace('Z', '+00:00'))
                days_old = (datetime.now() - pub_datetime.replace(tzinfo=None)).days
                recency_factor = max(0.9, 1.0 - (days_old / 3650))  # Decay over 10 years
                base_authority *= recency_factor
            except:
                pass

        return min(1.0, base_authority)

    async def _load_warehouse_documents(self) -> List[Dict]:
        """Load documents from warehouse/gold"""
        documents = []

        try:
            gold_dir = Path("warehouse/gold")
            if gold_dir.exists():
                for doc_file in gold_dir.glob("**/*.json"):
                    with open(doc_file) as f:
                        doc_data = json.load(f)
                        if isinstance(doc_data, list):
                            documents.extend(doc_data)
                        else:
                            documents.append(doc_data)

            logger.info(f"📚 Loaded {len(documents)} documents from warehouse")

        except Exception as e:
            logger.warning(f"⚠️ Error loading warehouse documents: {e}")

        return documents

    async def _load_warehouse_chunks(self) -> List[Dict]:
        """Load chunks from warehouse/gold"""
        chunks = []

        try:
            gold_dir = Path("warehouse/gold")
            if gold_dir.exists():
                for chunk_file in gold_dir.glob("**/*chunks*.json"):
                    with open(chunk_file) as f:
                        chunk_data = json.load(f)
                        if isinstance(chunk_data, list):
                            chunks.extend(chunk_data)
                        else:
                            chunks.append(chunk_data)

            logger.info(f"📚 Loaded {len(chunks)} chunks from warehouse")

        except Exception as e:
            logger.warning(f"⚠️ Error loading warehouse chunks: {e}")

        return chunks

    def _create_placeholder_chunks(self) -> List[Dict]:
        """Create placeholder chunks for demonstration"""
        return [
            {
                'chunk_id': 'demo_1',
                'doc_id': 'cfr_45_147',
                'text': 'External review processes must be conducted by independent review organizations that meet specific accreditation standards and have no conflicts of interest with the health plan.',
                'section_path': ['45 CFR 147.136', 'External Review'],
                'authority_rank': 0.95
            },
            {
                'chunk_id': 'demo_2',
                'doc_id': 'erisa_502',
                'text': 'ERISA section 502(a)(1)(B) provides participants the right to recover benefits due under the terms of the plan and to enforce rights under the plan.',
                'section_path': ['ERISA', 'Section 502(a)(1)(B)'],
                'authority_rank': 1.0
            },
            {
                'chunk_id': 'demo_3',
                'doc_id': 'nsa_idr',
                'text': 'The No Surprises Act independent dispute resolution process allows out-of-network providers and health plans to resolve payment disputes for emergency services and certain non-emergency services.',
                'section_path': ['No Surprises Act', 'IDR Process'],
                'authority_rank': 0.95
            }
        ]

    async def _load_existing_index(self):
        """Load existing index from storage"""
        # Implementation would load previously built index
        # For now, we'll build fresh each time
        pass

# Initialize service
rag_service = EnhancedRAGService()

@app.on_event("startup")
async def startup_event():
    """Initialize RAG service on startup"""
    success = await rag_service.initialize()
    if not success:
        logger.error("❌ Failed to initialize RAG service")

@app.post("/ask", response_model=GroundedResponse)
async def ask_question(request: QueryRequest):
    """Ask a question and get grounded response with citations"""
    return await rag_service.ask(request)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "index_built": rag_service.index_built,
        "chunks": len(rag_service.chunk_store),
        "documents": len(rag_service.document_store)
    }

@app.post("/rebuild-index")
async def rebuild_index():
    """Rebuild the RAG index"""
    await rag_service.build_index(rebuild=True)
    return {"status": "index_rebuilt", "chunks": len(rag_service.chunk_store)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)