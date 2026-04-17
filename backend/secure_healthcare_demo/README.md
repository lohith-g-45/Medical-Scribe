# Secure Healthcare Demo (FastAPI)

This module is a hackathon-friendly secure healthcare backend with:
- doctor registration/login
- JWT authentication
- doctor-based patient ownership checks
- AES-256 encryption at rest for medical fields, including full conversation text

## Setup

1. Create and activate a Python environment.
2. Install dependencies:

   pip install -r requirements.txt

3. Create `.env` from `.env.sample` and set values.
4. Run:

   uvicorn app:app --reload

5. Open docs:

   http://127.0.0.1:8000/docs

## Security notes

- Never commit `.env` to source control.
- Use HTTPS in deployment (reverse proxy TLS termination).
- Do not log decrypted patient data.
