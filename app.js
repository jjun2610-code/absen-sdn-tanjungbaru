const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs'); 
const db = require('./config/db'); 

const app = express();

// --- PENGAMAN FOLDER UPLOAD ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'sdn_tanjung_baru_2026',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// RUTE UTAMA DASHBOARD & REKAP GURU
// ==========================================

app.get('/admin/dashboard', (req, res) => {
    const view = req.query.view || 'Dashboard';
    
    // Query Dasar untuk Statistik
    db.query("SELECT COUNT(*) as jml FROM pengguna WHERE kelas != 'Guru'", (err, s1) => {
        db.query("SELECT COUNT(*) as jml FROM pengguna WHERE kelas = 'Guru'", (err, s2) => {
            db.query("SELECT * FROM absensi WHERE tanggal = CURDATE()", (err, lap) => {
                db.query("SELECT * FROM profil_sekolah LIMIT 1", (err, sek) => {
                    
                    // JIKA VIEW ADALAH REKAP GURU
                    if (view === 'RekapGuru') {
                        db.query("SELECT * FROM absensi WHERE foto_selfie IS NOT NULL ORDER BY tanggal DESC", (err, guru) => {
                            res.render('dashboard', {
                                view: 'RekapGuru',
                                stats: { siswa: s1[0].jml, guru: s2[0].jml, absen: lap.length },
                                laporan: guru, 
                                sekolah: sek[0] || {},
                                pengguna: [],
                                grafik: [] // <-- TAMBAHAN: Agar Chart tidak error
                            });
                        });
                    } else {
                        // VIEW DASHBOARD BIASA
                        res.render('dashboard', {
                            view: view,
                            stats: { siswa: s1[0].jml, guru: s2[0].jml, absen: lap.length },
                            laporan: lap,
                            sekolah: sek[0] || {},
                            pengguna: [],
                            grafik: [] // <-- TAMBAHAN: Agar Chart tidak error
                        });
                    }
                });
            });
        });
    });
});

// RUTE KHUSUS REKAP GURU (Agar Link Sidebar Berhasil)
app.get('/admin/rekap-guru', (req, res) => {
    res.redirect('/admin/dashboard?view=RekapGuru');
});

// --- RUTE SCANNER ---
app.get('/scanner', (req, res) => {
    db.query("SELECT * FROM profil_sekolah LIMIT 1", (err, result) => {
        const sekolah = (result && result.length > 0) ? result[0] : { nama_sekolah: 'SDN TANJUNG BARU' };
        res.render('scanner', { sekolah: sekolah });
    });
});

// Route lainnya (Auth & Admin)
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
app.use('/', authRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server Aktif di Port ${PORT}`);
});