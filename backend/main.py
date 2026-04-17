"""
Medical-Scribe Backend — FastAPI Application
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import json
import time
import logging
import asyncio
from typing import Optional
from datetime import datetime
import jwt

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, File, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from nlp_pipeline import MedicalPipeline, PipelineResult
from insights_engine import InsightsEngine

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger(__name__)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}

# ─────────────────────────────────────────────
# App
# ─────────────────────────────────────────────
app = FastAPI(
    title="Medical-Scribe API",
    version="2.0.0",
    description="AI-powered clinical documentation backend"
)

# Merge default local origins with comma-separated CORS_ORIGIN env values.
default_allowed_origins = [
    "http://localhost:5173",  # React dev server
    "http://localhost:5174",  # React dev server (alt)
    "http://localhost:5000",  # Node.js API
]

env_allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGIN", "").split(",")
    if origin.strip()
]

allowed_origins = list(dict.fromkeys(default_allowed_origins + env_allowed_origins))

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Global pipeline instances
# ─────────────────────────────────────────────
pipeline: Optional[MedicalPipeline] = None
insights_engine: Optional[InsightsEngine] = None

@app.on_event("startup")
async def startup():
    global pipeline, insights_engine
    logger.info("🚀 Starting Medical-Scribe backend...")

    render_runtime = any(
        os.getenv(key)
        for key in ("RENDER", "RENDER_SERVICE_ID", "RENDER_EXTERNAL_URL")
    )
    low_memory_mode = env_bool("LOW_MEMORY_MODE", default=render_runtime)

    whisper_model = os.getenv("WHISPER_MODEL", "tiny")
    pipeline = MedicalPipeline(
        whisper_model_size=whisper_model,
        low_memory_mode=low_memory_mode,
    )
    insights_engine = InsightsEngine()
    logger.info(
        "✅ Backend runtime profile: low_memory_mode=%s, WHISPER_MODEL=%s",
        low_memory_mode,
        whisper_model,
    )
    logger.info("✅ Backend ready")

# ─────────────────────────────────────────────
# REST Endpoints
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
# JWT Authentication (Optional - for protected endpoints)
# ─────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-matching-nodejs")

async def verify_token(authorization: str = Header(None)):
    """Optional JWT verification - uncomment Depends(verify_token) to enable"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/api/health")
async def health_check():
    translation_ready = bool(
        pipeline and getattr(getattr(pipeline, "translator", None), "translator", None)
    )

    return {
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "whisper": bool(pipeline and getattr(pipeline, "whisper", None)),
        "translation": translation_ready,
        "ner": bool(pipeline and getattr(pipeline, "ner", None)),
        "insights_groq": insights_engine is not None
    }


class TextRequest(BaseModel):
    text: str
    speaker: str = "Unknown"
    language: str = "en"


class AnalyzeRequest(BaseModel):
    notes: Optional[dict] = None
    transcript: str = ""
    text: str = ""


def infer_recommended_surgery(payload: AnalyzeRequest) -> str:
    notes = payload.notes or {}
    chunks = [
        payload.text or "",
        payload.transcript or "",
        str(notes.get("assessment", "")),
        str(notes.get("plan", "")),
        str(notes.get("chiefComplaint", "")),
        str(notes.get("historyOfPresentIllness", "")),
    ]
    all_text = " ".join(chunks).lower()

    cardiac_signals = [
        "heart", "cardiac", "coronary", "cabg", "bypass", "valve", "stent", "angioplasty",
        "pci", "pacemaker", "arrhythmia", "bradycardia", "heart block", "aortic", "mitral",
        "lad", "rca", "lcx",
    ]

    if not any(k in all_text for k in cardiac_signals):
        return "NONE"

    if any(k in all_text for k in ["pacemaker", "bradycardia", "heart block", "arrhythmia"]):
        return "PACEMAKER"
    if any(k in all_text for k in ["stent", "angioplasty", "pci"]):
        return "STENT"
    if any(k in all_text for k in ["valve", "aortic stenosis", "mitral regurgitation", "valvular"]):
        return "VALVE"
    if any(k in all_text for k in ["cabg", "bypass", "coronary graft"]):
        return "CABG"
    return "CABG"


@app.post("/api/process-text")
async def process_text(req: TextRequest):
    """Process text input and generate SOAP notes"""
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not ready")
    try:
        result = await pipeline.process_text(req.text, req.speaker, req.language)
        
        # Generate AI insights
        insights = await insights_engine.generate_insights(
            entities=result.entities,
            soap_note={
                "subjective": result.soap_note.subjective,
                "objective": result.soap_note.objective,
                "assessment": result.soap_note.assessment,
                "plan": result.soap_note.plan,
            },
            transcript=result.translated_text
        )
        
        return {
            "success": True,
            "transcript": result.translated_text,
            "original_text": result.original_text,
            "source_language": result.source_language,
            "speaker": result.speaker,
            "entities": result.entities,
            "soap_notes": {
                "chief_complaint": result.soap_note.subjective,
                "history": result.soap_note.objective,
                "assessment": result.soap_note.assessment,
                "plan": result.soap_note.plan,
            },
            "insights": insights.to_dict(),
            "processing_time_ms": result.processing_time_ms,
        }
    except Exception as e:
        logger.error(f"process-text error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze")
@app.post("/api/analyze")
async def analyze_surgery(req: AnalyzeRequest):
    """Return recommended cardiac surgery type for heart visualization overlays."""
    try:
        recommended = infer_recommended_surgery(req)
        return {
            "recommended_surgery": recommended,
            "source": "rule-based",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error(f"analyze error: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze surgery recommendation")


@app.post("/api/transcribe-and-generate")
async def transcribe_and_generate(audio: UploadFile = File(...)):
    """Transcribe audio and generate AI-powered SOAP notes"""
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not ready")
    
    try:
        # Read audio file
        audio_bytes = await audio.read()
        logger.info(f"Received audio file: {audio.filename}, size: {len(audio_bytes)} bytes")
        
        # Process audio through pipeline
        result = await pipeline.process_audio(audio_bytes)
        
        # Generate AI insights
        insights = await insights_engine.generate_insights(
            entities=result.entities,
            soap_note={
                "subjective": result.soap_note.subjective,
                "objective": result.soap_note.objective,
                "assessment": result.soap_note.assessment,
                "plan": result.soap_note.plan,
            },
            transcript=result.translated_text
        )
        
        return {
            "success": True,
            "transcript": result.translated_text,
            "speaker": result.speaker,
            "source_language": result.source_language,
            "medical_specialty": result.medical_specialty,
            "specialty_confidence": result.specialty_confidence,
            "soap_notes": {
                "chief_complaint": result.soap_note.subjective,
                "history": result.soap_note.objective,
                "assessment": result.soap_note.assessment,
                "plan": result.soap_note.plan,
            },
            "entities": result.entities,
            "insights": insights.to_dict(),
            "processing_time_ms": result.processing_time_ms,
        }
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {str(e)}")


# ─────────────────────────────────────────────
# WebSocket
# ─────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"WS connected: {session_id}")

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data:
                chunk = data["bytes"]
                if not chunk:
                    continue

                try:
                    result = await pipeline.process_audio(chunk)
                    if result.translated_text.strip():
                        insights = await insights_engine.generate_insights(
                            entities=result.entities,
                            soap_note={
                                "subjective": result.soap_note.subjective,
                                "objective": result.soap_note.objective,
                                "assessment": result.soap_note.assessment,
                                "plan": result.soap_note.plan,
                            },
                            transcript=result.translated_text,
                        )
                        await websocket.send_text(json.dumps({
                            "type": "pipeline_result",
                            "original_text": result.original_text,
                            "translated_text": result.translated_text,
                            "source_language": result.source_language,
                            "speaker": result.speaker,
                            "medical_specialty": result.medical_specialty,
                            "specialty_confidence": result.specialty_confidence,
                            "entities": result.entities,
                            "body_part_updates": result.body_part_updates,
                            "soap_note": {
                                "subjective": result.soap_note.subjective,
                                "objective": result.soap_note.objective,
                                "assessment": result.soap_note.assessment,
                                "plan": result.soap_note.plan,
                                "icd10_codes": result.soap_note.icd10_codes,
                            },
                            "insights": insights.to_dict(),
                            "processing_time_ms": result.processing_time_ms,
                        }))
                except Exception as e:
                    logger.error(f"Pipeline error: {e}")
                    await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))

            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                elif msg.get("type") == "text_input":
                    text = msg.get("text", "")
                    speaker = msg.get("speaker", "Unknown")
                    lang = msg.get("language", "en")
                    if text.strip():
                        result = await pipeline.process_text(text, speaker, lang)
                        insights = await insights_engine.generate_insights(
                            entities=result.entities,
                            soap_note={
                                "subjective": result.soap_note.subjective,
                                "objective": result.soap_note.objective,
                                "assessment": result.soap_note.assessment,
                                "plan": result.soap_note.plan,
                            },
                            transcript=result.translated_text,
                        )
                        await websocket.send_text(json.dumps({
                            "type": "pipeline_result",
                            "original_text": result.original_text,
                            "translated_text": result.translated_text,
                            "source_language": result.source_language,
                            "speaker": result.speaker,
                            "entities": result.entities,
                            "body_part_updates": result.body_part_updates,
                            "soap_note": {
                                "subjective": result.soap_note.subjective,
                                "objective": result.soap_note.objective,
                                "assessment": result.soap_note.assessment,
                                "plan": result.soap_note.plan,
                                "icd10_codes": result.soap_note.icd10_codes,
                            },
                            "insights": insights.to_dict(),
                            "processing_time_ms": result.processing_time_ms,
                        }))

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WS error: {e}")
