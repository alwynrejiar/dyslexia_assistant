from pydantic import BaseModel, Field


class AnalyzeResponse(BaseModel):
    raw: str = Field(default="", description="Raw transcription preserving original mistakes")
    analysis: str = Field(default="", description="Categorized writing error analysis")
    corrected: str = Field(default="", description="Corrected final text")


class HealthResponse(BaseModel):
    status: str
    client_ready: bool
    model: str = "gemini-2.5-flash"
