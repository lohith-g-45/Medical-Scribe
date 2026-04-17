import base64
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _load_key() -> bytes:
    key_b64 = os.getenv("AES_256_KEY_B64", "")
    if not key_b64:
        raise RuntimeError("AES_256_KEY_B64 is not configured")

    try:
        key = base64.urlsafe_b64decode(key_b64)
    except Exception as exc:
        raise RuntimeError("AES_256_KEY_B64 must be valid base64") from exc

    if len(key) != 32:
        raise RuntimeError("AES_256_KEY_B64 must decode to exactly 32 bytes")

    return key


def encrypt_text(plain_text: str) -> str:
    key = _load_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    token = nonce + ciphertext
    return base64.urlsafe_b64encode(token).decode("utf-8")


def decrypt_text(cipher_text_b64: str) -> str:
    key = _load_key()
    aesgcm = AESGCM(key)
    raw = base64.urlsafe_b64decode(cipher_text_b64.encode("utf-8"))
    nonce = raw[:12]
    ciphertext = raw[12:]
    plain = aesgcm.decrypt(nonce, ciphertext, None)
    return plain.decode("utf-8")


def encrypt_medical_payload(symptoms: str, diagnosis: str, notes: str, conversation: str) -> str:
    payload = {
        "symptoms": encrypt_text(symptoms),
        "diagnosis": encrypt_text(diagnosis),
        "notes": encrypt_text(notes),
        "conversation": encrypt_text(conversation),
    }
    return json.dumps(payload)


def decrypt_medical_payload(encrypted_json: str) -> dict:
    payload = json.loads(encrypted_json)
    return {
        "symptoms": decrypt_text(payload["symptoms"]),
        "diagnosis": decrypt_text(payload["diagnosis"]),
        "notes": decrypt_text(payload["notes"]),
        "conversation": decrypt_text(payload["conversation"]),
    }
