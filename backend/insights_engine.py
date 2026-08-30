"""
Medical-Scribe Insights Engine
Generates clinical insights using Groq LLM
"""

import os
import logging
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ClinicalInsights:
    urgency_level: str = "routine"
    key_findings: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    follow_up: str = ""
    risk_factors: List[str] = field(default_factory=list)
    raw_text: str = ""

    def to_dict(self):
        return {
            "urgency_level": self.urgency_level,
            "key_findings": self.key_findings,
            "recommendations": self.recommendations,
            "follow_up": self.follow_up,
            "risk_factors": self.risk_factors,
            "raw_text": self.raw_text,
        }


class InsightsEngine:
    def __init__(self):
        self.client = None
        api_key = os.getenv("GROQ_API_KEY", "")
        if api_key:
            try:
                from groq import Groq
                self.client = Groq(api_key=api_key)
                logger.info("✅ Groq insights engine ready")
            except Exception as e:
                logger.warning(f"Groq init failed: {e}. Insights will be basic.")
        else:
            logger.warning("No GROQ_API_KEY set. Using basic insights fallback.")

    async def generate_insights(
        self,
        entities: list,
        soap_note: dict,
        transcript: str,
    ) -> ClinicalInsights:
        if not entities and not transcript.strip():
            return ClinicalInsights()

        # Basic fallback if no Groq
        if self.client is None:
            return self._basic_insights(entities)

        try:
            entity_summary = ", ".join([f"{e.get('text')} ({e.get('type')})" for e in entities[:10]])
            prompt = f"""You are a clinical decision support AI. Analyze the following medical consultation data and provide concise clinical insights.

Transcript: {transcript[:500]}
Entities: {entity_summary}
SOAP Assessment: {soap_note.get('assessment', '')}

Respond in JSON format:
{{
  "urgency_level": "routine|urgent|emergency",
  "key_findings": ["finding1", "finding2"],
  "recommendations": ["rec1", "rec2"],
  "follow_up": "follow up instructions",
  "risk_factors": ["risk1", "risk2"]
}}"""

            response = self.client.chat.completions.create(
                # mixtral-8x7b-32768 was decommissioned by Groq; openai/gpt-oss-120b is a
                # current, capable model on Groq's API.
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=500,
            )
            raw = response.choices[0].message.content.strip()

            import json
            # Extract JSON
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(raw[start:end])
                return ClinicalInsights(
                    urgency_level=data.get("urgency_level", "routine"),
                    key_findings=data.get("key_findings", []),
                    recommendations=data.get("recommendations", []),
                    follow_up=data.get("follow_up", ""),
                    risk_factors=data.get("risk_factors", []),
                    raw_text=raw,
                )
        except Exception as e:
            logger.error(f"Groq insights failed: {e}")

        return self._basic_insights(entities)

    def _basic_insights(self, entities: list) -> ClinicalInsights:
        critical = [e for e in entities if e.get("severity") == "critical"]
        urgency = "urgent" if critical else "routine"
        findings = [e.get("text", "") for e in entities[:5]]
        return ClinicalInsights(
            urgency_level=urgency,
            key_findings=findings,
            recommendations=["Schedule follow-up appointment", "Review medications"],
            follow_up="Follow up within 1 week",
            risk_factors=[],
        )
