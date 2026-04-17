from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PatientCreateRequest(BaseModel):
    symptoms: str = Field(min_length=1, max_length=4000)
    diagnosis: str = Field(min_length=1, max_length=4000)
    notes: str = Field(min_length=1, max_length=4000)
    conversation: str = Field(min_length=1, max_length=20000)


class PatientResponse(BaseModel):
    patient_id: int
    doctor_id: int
    symptoms: str
    diagnosis: str
    notes: str
    conversation: str


class MessageResponse(BaseModel):
    message: str
