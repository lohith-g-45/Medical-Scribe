import os
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from auth import ALGORITHM, SECRET_KEY, create_access_token, hash_password, verify_password
from crypto_utils import decrypt_medical_payload, encrypt_medical_payload
from database import Base, engine, get_db
from models import Doctor, Patient
from schemas import (
    LoginRequest,
    MessageResponse,
    PatientCreateRequest,
    PatientResponse,
    RegisterRequest,
    TokenResponse,
)

load_dotenv()

# In production, run behind HTTPS and set secure headers at the reverse proxy.
app = FastAPI(title="Secure Healthcare Demo API", version="1.0.0")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

Base.metadata.create_all(bind=engine)


def get_current_doctor(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Doctor:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    doctor = db.query(Doctor).filter(Doctor.username == username).first()
    if doctor is None:
        raise credentials_exception
    return doctor


@app.get("/", response_model=MessageResponse)
def root() -> MessageResponse:
    return MessageResponse(message="Secure Healthcare Demo API is running")


@app.post("/register", response_model=MessageResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> MessageResponse:
    existing = db.query(Doctor).filter(Doctor.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered")

    doctor = Doctor(
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    db.add(doctor)
    db.commit()
    return MessageResponse(message="Doctor registered successfully")


@app.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    doctor = db.query(Doctor).filter(Doctor.username == payload.username).first()
    if not doctor or not verify_password(payload.password, doctor.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(subject=doctor.username)
    return TokenResponse(access_token=token)


@app.post("/patients", response_model=PatientResponse)
def create_patient(
    payload: PatientCreateRequest,
    db: Session = Depends(get_db),
    current_doctor: Doctor = Depends(get_current_doctor),
) -> PatientResponse:
    encrypted_data = encrypt_medical_payload(
        symptoms=payload.symptoms,
        diagnosis=payload.diagnosis,
        notes=payload.notes,
        conversation=payload.conversation,
    )

    patient = Patient(
        doctor_id=current_doctor.id,
        encrypted_data=encrypted_data,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    decrypted = decrypt_medical_payload(patient.encrypted_data)

    return PatientResponse(
        patient_id=patient.patient_id,
        doctor_id=patient.doctor_id,
        symptoms=decrypted["symptoms"],
        diagnosis=decrypted["diagnosis"],
        notes=decrypted["notes"],
        conversation=decrypted["conversation"],
    )


@app.get("/patients/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_doctor: Doctor = Depends(get_current_doctor),
) -> PatientResponse:
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    if patient.doctor_id != current_doctor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    decrypted = decrypt_medical_payload(patient.encrypted_data)

    return PatientResponse(
        patient_id=patient.patient_id,
        doctor_id=patient.doctor_id,
        symptoms=decrypted["symptoms"],
        diagnosis=decrypted["diagnosis"],
        notes=decrypted["notes"],
        conversation=decrypted["conversation"],
    )
