const pool = require('./db');

async function testDatabase() {
  try {
    // Check table structure
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'companies'
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== Companies Table Structure ===');
    columns.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type}`);
    });

    // Check if there are any companies
    const companies = await pool.query('SELECT * FROM companies');
    console.log('\n=== Companies Count ===');
    console.log(`Total companies: ${companies.rows.length}`);
    
    if (companies.rows.length > 0) {
      console.log('\n=== Sample Company (first record) ===');
      const sample = companies.rows[0];
      Object.keys(sample).forEach(key => {
        console.log(`${key}: ${key === 'password' ? '***' : sample[key]}`);
      });
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

testDatabase();
