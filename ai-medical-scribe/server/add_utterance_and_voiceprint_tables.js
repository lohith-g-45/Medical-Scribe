require('dotenv').config();
const db = require('./config/database');

async function tableExists(tableName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function run() {
  try {
    if (!(await tableExists('consultation_utterances'))) {
      await db.query(`
        CREATE TABLE consultation_utterances (
          id INT PRIMARY KEY AUTO_INCREMENT,
          consultation_id INT NOT NULL,
          sequence_no INT NOT NULL,
          speaker_role ENUM('doctor','patient','unknown') NOT NULL,
          raw_speaker_label VARCHAR(16),
          start_ms INT,
          end_ms INT,
          source_language_code VARCHAR(8) NOT NULL,
          source_language_confidence FLOAT,
          original_text LONGTEXT,
          english_text LONGTEXT,
          speaker_match_confidence FLOAT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
          INDEX idx_consultation_id (consultation_id)
        )
      `);
      console.log('Created consultation_utterances table.');
    }

    if (!(await tableExists('doctor_voiceprints'))) {
      await db.query(`
        CREATE TABLE doctor_voiceprints (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL UNIQUE,
          embedding LONGTEXT NOT NULL,
          sample_duration_ms INT,
          enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log('Created doctor_voiceprints table.');
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create utterance/voiceprint tables:', err.message);
    process.exit(1);
  }
}

run();
