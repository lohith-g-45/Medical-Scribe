-- Create Database
CREATE DATABASE IF NOT EXISTS medicalscribe;
USE medicalscribe;

-- Users Table (Doctors)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('doctor', 'admin') DEFAULT 'doctor',
    specialization VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_name VARCHAR(255) NOT NULL,
    age TEXT NOT NULL,
    gender TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    medical_history TEXT,
    allergies TEXT,
    blood_group TEXT,
    phone_hash VARCHAR(64),
    email_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patient_name (patient_name),
    INDEX idx_phone_hash (phone_hash),
    INDEX idx_email_hash (email_hash)
);

-- Consultations Table
CREATE TABLE IF NOT EXISTS consultations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    visit_date DATE NOT NULL,
    transcript LONGTEXT,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    diagnosis TEXT,
    medications TEXT,
    follow_up TEXT,
    status ENUM('in-progress', 'completed', 'cancelled') DEFAULT 'completed',
    duration INT COMMENT 'Duration in minutes',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_patient_id (patient_id),
    INDEX idx_doctor_id (doctor_id),
    INDEX idx_visit_date (visit_date)
);

-- Prescriptions Table
CREATE TABLE IF NOT EXISTS prescriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    consultation_id INT NOT NULL,
    medication_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    duration VARCHAR(100),
    instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    INDEX idx_consultation_id (consultation_id)
);

-- Insert seeded doctor user for sample consultation ownership.
-- This account is not intended for interactive login.
INSERT INTO users (name, email, password, role, specialization)
VALUES (
    'Dr. Sarah Johnson',
    'seeded-doctor@medicalscribe.invalid',
    '$2a$10$p8DW8KO5Yi2//CNh8OcCFuAEdiXrqO1JmBhmBFznb/WXP49fxoLxC',
    'doctor',
    'Internal Medicine'
);

-- Insert Demo Patients
INSERT INTO patients (patient_name, age, gender, phone, email, address, allergies, blood_group)
VALUES 
    ('John Smith', 45, 'Male', '555-0101', 'john.smith@email.com', '123 Main St, City', 'Penicillin', 'O+'),
    ('Emily Davis', 32, 'Female', '555-0102', 'emily.davis@email.com', '456 Oak Ave, City', 'None', 'A+'),
    ('Michael Brown', 58, 'Male', '555-0103', 'michael.brown@email.com', '789 Pine Rd, City', 'Aspirin', 'B+'),
    ('Sarah Wilson', 28, 'Female', '555-0104', 'sarah.wilson@email.com', '321 Elm St, City', 'Peanuts', 'AB+'),
    ('David Lee', 67, 'Male', '555-0105', 'david.lee@email.com', '654 Maple Dr, City', 'Latex', 'O-');

-- Insert Demo Consultations
INSERT INTO consultations (patient_id, doctor_id, visit_date, transcript, subjective, objective, assessment, plan, diagnosis, medications, follow_up, status, duration)
VALUES 
    (
        1, 
        1, 
        '2026-03-01',
        'Doctor: Good morning, how are you feeling today?\nPatient: I have been having chest pain for the last three days.\nDoctor: Can you describe the pain?\nPatient: It is a sharp pain on the left side.',
        'Patient reports chest pain on left side for 3 days. Describes pain as sharp in nature.',
        'Patient: John Smith, Age: 45, Gender: Male. Blood pressure 130/85, Heart rate 78 bpm. General appearance good.',
        'Suspected musculoskeletal chest pain. Rule out cardiac causes. ECG ordered.',
        'Prescribed pain medication. ECG scheduled. Follow-up in 1 week. Patient advised to seek emergency care if pain worsens.',
        'Chest Pain - likely musculoskeletal',
        'Ibuprofen 400mg TID, Acetaminophen PRN',
        '1 week',
        'completed',
        25
    ),
    (
        2,
        1,
        '2026-02-28',
        'Doctor: What brings you in today?\nPatient: I have had a persistent cough and fever.\nDoctor: How long has this been going on?\nPatient: About 5 days now.',
        'Patient presents with persistent cough and fever for 5 days. No difficulty breathing reported.',
        'Patient: Emily Davis, Age: 32, Gender: Female. Temperature 38.2°C, Oxygen saturation 98%. Lungs clear on auscultation.',
        'Upper respiratory tract infection. Viral etiology most likely.',
        'Symptomatic treatment advised. Rest, hydration, and OTC medications. Return if symptoms worsen or persist beyond 7 days.',
        'Upper Respiratory Tract Infection',
        'Cough syrup, Paracetamol 500mg PRN',
        'PRN or if worsens',
        'completed',
        20
    );
