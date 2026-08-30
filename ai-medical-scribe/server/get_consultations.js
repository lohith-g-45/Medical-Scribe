const db = require('./config/database');

(async () => {
  try {
    const [rows] = await db.query(
      'SELECT c.id, c.patient_id, p.patient_name, c.visit_date FROM consultations c JOIN patients p ON c.patient_id = p.id WHERE c.patient_id IN (22, 23, 24) ORDER BY c.patient_id, c.id DESC'
    );
    
    console.log('\nCurrent consultations for patients 22, 23, 24:');
    console.log('─'.repeat(60));
    rows.forEach(r => {
      const d = new Date(r.visit_date);
      console.log(`Patient ${r.patient_id} (${r.patient_name}): Consultation ${r.id}`);
      console.log(`  Date/Time: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`);
    });
    console.log('─'.repeat(60));
    
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
