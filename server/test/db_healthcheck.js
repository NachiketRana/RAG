import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL || 'postgres://admin:securepassword@localhost:5434/fintech_mock';

console.log(`🔍 Checking PostgreSQL database connection at: ${dbUrl}`);

const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });

try {
  const res = await pool.query('SELECT current_database(), current_user, version();');
  console.log('✅ Connected to database successfully!');
  console.log(`   Database: ${res.rows[0].current_database}`);
  console.log(`   User:     ${res.rows[0].current_user}`);
  
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log(`✅ Available tables: ${tables.rows.map(r => r.table_name).join(', ')}`);

  const userCount = await pool.query('SELECT COUNT(*) FROM users;');
  const txCount = await pool.query('SELECT COUNT(*) FROM transactions;');
  console.log(`✅ Seed data found: ${userCount.rows[0].count} users, ${txCount.rows[0].count} transactions.`);
  
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error('❌ Could not connect to PostgreSQL database:');
  console.error(`   ${err.message}`);
  console.error('\n💡 Tip: Ensure Docker Desktop is running and you executed:');
  console.error('   cd database && docker compose up -d\n');
  await pool.end().catch(() => {});
  process.exit(1);
}

