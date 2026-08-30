
# MediScribe AI - Intelligent Medical Scribe Platform

> Transforming healthcare documentation through AI-powered real-time transcription, intelligent note generation, and voice-based patient identification

[![Node.js](https://img.shields.io/badge/Node.js-20.x+-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.3-blue)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.9+-blue)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 📋 Overview

MediScribe AI is a comprehensive AI-driven medical scribe platform that revolutionizes healthcare documentation. It combines real-time speech recognition, advanced NLP, doctor-patient voice identification, and intelligent medical note generation to streamline clinical workflows and improve patient outcomes.

### Key Innovation

Unlike traditional medical scribes, MediScribe AI uses **speaker diarization and voice fingerprinting** to automatically identify whether it's the doctor or patient speaking, enabling truly hands-free documentation without manual speaker labeling.

## ✨ Core Features

### 🎤 Smart Audio Processing
- **Real-Time Transcription** - Automatic speech-to-text conversion using industry-leading ASR technology
- **Speaker Diarization** - Automatic identification of doctor vs. patient using voice fingerprinting
- **Multilingual Support** - Handles mixed-language consultations (English, Hindi, Kannada, Telugu, etc.)
- **Audio Enhancement** - Noise reduction and audio normalization for clarity

### 📝 Intelligent Documentation
- **SOAP Format Generation** - Structured clinical notes (Subjective, Objective, Assessment, Plan)
- **AI-Powered Extraction** - Automatically extracts conditions, medications, diagnoses, and follow-ups
- **Medical Entity Recognition** - Identifies diseases, symptoms, medications, and procedures
- **Editable Notes** - Review, edit, and refine AI-generated documentation

### 🔐 Healthcare-Grade Security
- **End-to-End Encryption** - AES-256-GCM encryption for patient data at rest
- **HIPAA-Compliant Architecture** - Protected health information (PHI) handling
- **Access Control** - Role-based permission system (doctor/admin)
- **Audit Logging** - Complete audit trail of all data access

### 👤 Voice Identification System
- **Doctor Voice Enrollment** - One-time voice fingerprinting for each doctor
- **Automatic Speaker Detection** - Accurately identifies who's speaking without interruption
- **Confidence Scoring** - Provides confidence metrics for speaker identification
- **Multi-Doctor Support** - Handles consultations with multiple speakers

### 📊 Patient & Consultation Management
- **Electronic Health Records (EHR)** - Comprehensive patient history and consultation records
- **Consultation Tracking** - Complete tracking of all consultations with timestamps
- **Patient Demographics** - Secure storage of patient information with encryption
- **Consultation History** - Full audit trail of consultation details

### 🔍 Advanced Analytics
- **Consultation Insights** - Summary statistics and consultation trends
- **Patient Records Dashboard** - Centralized view of all patient records
- **Search & Filter** - Advanced search capabilities across consultations
- **Export Capabilities** - Generate PDF reports and summaries

## 🏗️ Architecture

### System Components

```
MediScribe AI Platform
├── Frontend (React + Vite)
│   ├── Dashboard & Analytics
│   ├── Consultation Interface
│   ├── Patient Management
│   └── Voice Enrollment
│
├── Node.js Backend (Express)
│   ├── Authentication & Authorization
│   ├── API Server
│   ├── Database Management
│   ├── Encryption Layer
│   └── Voice Processing Routes
│
├── Python AI Engine (FastAPI)
│   ├── Speech Recognition (Groq Whisper)
│   ├── Speaker Diarization
│   ├── Voice Fingerprinting
│   ├── Medical NLP
│   ├── Entity Extraction
│   └── Insights Generation
│
└── Database (MariaDB/MySQL)
    ├── Users & Authentication
    ├── Patients (Encrypted)
    ├── Consultations (Encrypted)
    ├── Utterances & Transcripts
    └── Doctor Voiceprints
```

### Data Flow

1. **Audio Input** → Speech Recognition (Whisper)
2. **Diarization** → Speaker Identification (voice fingerprint matching)
3. **Transcription** → Per-speaker structured utterances
4. **NLP Processing** → Medical entity extraction
5. **Note Generation** → Structured SOAP notes
6. **Encryption** → Secure storage in database
7. **Dashboard Display** → User-facing presentation

## 🛠️ Technology Stack

### Frontend
- **React 18.3** - Modern UI framework with hooks
- **Vite 7.3** - Lightning-fast build tool
- **TailwindCSS 3.4** - Utility-first styling
- **React Router v7** - Client-side routing
- **Framer Motion** - Smooth animations and transitions
- **Lucide Icons** - Professional icon library
- **Axios** - HTTP client for API calls

### Backend (Node.js)
- **Express.js** - RESTful API server
- **MySQL2/Promise** - Database connectivity with async support
- **Bcryptjs** - Password hashing and security
- **JWT (jsonwebtoken)** - Token-based authentication
- **dotenv** - Environment configuration
- **Express Rate Limiting** - API protection

### AI/ML Engine (Python)
- **FastAPI** - High-performance API framework
- **Uvicorn** - ASGI server
- **Groq Whisper API** - Cloud-based speech recognition
- **SciPy/NumPy** - Scientific computing
- **spaCy** - NLP and entity recognition
- **Python-Socketio** - Real-time WebSocket communication

### Database
- **MariaDB/MySQL** - Relational database
- **InnoDB** - Transaction support
- **Full-Text Search** - Advanced search capabilities

### Security
- **AES-256-GCM** - Encryption algorithm
- **PBKDF2** - Key derivation
- **Express Helmet** - HTTP security headers
- **CORS** - Cross-origin protection

## 📁 Project Structure

```
Medical-Scribe/
│
├── ai-medical-scribe/                 # Main application
│   ├── src/                          # React frontend
│   │   ├── components/               # Reusable UI components
│   │   ├── pages/                    # Route pages
│   │   ├── services/                 # API service layer
│   │   ├── context/                  # React Context state
│   │   ├── utils/                    # Helper functions
│   │   └── App.jsx                   # Main app component
│   │
│   ├── server/                       # Node.js backend
│   │   ├── routes/                   # API endpoints
│   │   ├── middleware/               # Auth, encryption middleware
│   │   ├── config/                   # Database configuration
│   │   ├── database/                 # Schema and migrations
│   │   ├── utils/                    # Utilities
│   │   └── server.js                 # Express app entry
│   │
│   └── public/                       # Static assets
│
├── backend/                          # Python AI engine
│   ├── main.py                       # FastAPI application
│   ├── nlp_pipeline.py              # NLP processing
│   ├── voice_id.py                  # Speaker identification
│   ├── insights_engine.py           # Medical insights
│   ├── datasets/                     # Data and models
│   └── requirements.txt              # Python dependencies
│
└── README.md                         # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x or higher
- Python 3.9 or higher
- MariaDB/MySQL 10.5+
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/Medical-Scribe.git
cd Medical-Scribe
```

2. **Frontend Setup**
```bash
cd ai-medical-scribe
npm install
cp .env.example .env
# Update .env with your API endpoints
```

3. **Backend Setup**
```bash
cd ai-medical-scribe/server
npm install
cp .env.example .env
# Update .env with database credentials
npm run migrate  # Run database migrations
```

4. **Python AI Engine Setup**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Running the Application

**Development Mode (Terminal 1 - Frontend)**
```bash
cd ai-medical-scribe
npm run dev
# Runs at http://localhost:5173
```

**Development Mode (Terminal 2 - Backend)**
```bash
cd ai-medical-scribe/server
npm run dev
# Runs at http://localhost:5000
```

**Development Mode (Terminal 3 - AI Engine)**
```bash
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
# Runs at http://localhost:8000
```

## 📖 Usage Guide

### For Doctors

1. **Login** with your credentials
2. **Start Consultation** - Click "New Consultation" button
3. **Record Audio** - Begin recording doctor-patient conversation
4. **Auto-Transcription** - Real-time transcription appears
5. **Review Notes** - AI-generated SOAP notes appear automatically
6. **Edit & Confirm** - Make any necessary edits
7. **Save** - Click save to store in patient record

### For Patients

1. **Access Your Records** - View from patient portal
2. **Consultation History** - See all past consultations
3. **Download Records** - Export consultation summaries as PDF
4. **Track Health** - Monitor ongoing treatment plans

## 🔐 Security & Compliance

### Encryption
- All sensitive patient data encrypted with AES-256-GCM
- Encryption keys managed securely via environment variables
- Deterministic hashing for searchable fields (phone, email)

### Authentication
- JWT-based token authentication
- Secure password hashing with bcryptjs
- Role-based access control (RBAC)
- Session management

### Compliance
- HIPAA-compliant data handling
- PII protection in all forms
- Audit logging of all data access
- Secure deletion policies

## 📊 Database Schema

### Key Tables
- **users** - Doctor/admin accounts
- **patients** - Patient records (encrypted)
- **consultations** - Consultation details with SOAP notes
- **consultation_utterances** - Per-speaker transcribed text
- **doctor_voiceprints** - Voice embeddings for speaker ID

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Support

For questions, issues, or suggestions:
- Create an issue on GitHub
- Contact the development team
- Review the [documentation](docs/)

## 🎯 Roadmap

- [ ] Mobile app (iOS/Android)
- [ ] Advanced 3D visualizations
- [ ] Predictive health analytics
- [ ] Integration with major EHR systems
- [ ] Telemedicine support
- [ ] Multi-language UI localization

---

**MediScribe AI** - Transforming Healthcare Documentation | Made with ❤️ for Better Healthcare
