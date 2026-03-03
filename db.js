const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', 
    database: 'db_sekolah' 
});

db.connect((err) => {
    if (err) {
        console.error('❌ Koneksi Gagal:', err.message);
        return;
    }
    console.log('✅ Terhubung ke database: db_sekolah');
});

module.exports = db;