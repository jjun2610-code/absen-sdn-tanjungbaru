const fs = require('fs');
const csv = require('csv-parser');
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');

// Konfigurasi Upload (Ditambah filter untuk foto selfie)
const storage = multer.diskStorage({
    destination: 'public/uploads/',
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware Data Sekolah
const getSekolah = (req, res, next) => {
    db.query("SELECT * FROM profil_sekolah LIMIT 1", (err, result) => {
        if (result && result.length > 0) {
            res.locals.sekolah = result[0];
        } else {
            res.locals.sekolah = { 
                nama_sekolah: 'SDN TANJUNG BARU', 
                nama_ks: '-', 
                nip_ks: '-', 
                logo_sekolah: '' 
            };
        }
        next();
    });
};

// 1. DASHBOARD
router.get('/dashboard', getSekolah, (req, res) => {
    const view = req.query.view || 'Dashboard';
    const qSiswa = "SELECT COUNT(*) as total FROM pengguna WHERE peran = 'Siswa'";
    const qGuru = "SELECT COUNT(*) as total FROM pengguna WHERE peran = 'Guru'";
    const qAbsenHariIni = "SELECT COUNT(*) as total FROM absensi WHERE tanggal = CURDATE()";
    // Query Laporan Absen ditambah kolom GPS dan Foto
    const qLaporanAbsen = "SELECT * FROM absensi WHERE tanggal = CURDATE() ORDER BY jam_masuk DESC";
    const qGrafik = "SELECT tanggal, COUNT(*) as jumlah FROM absensi GROUP BY tanggal ORDER BY tanggal ASC LIMIT 7";

    const qData = (view === 'Siswa' || view === 'Guru') ? "SELECT * FROM pengguna WHERE peran = ?" : "SELECT * FROM pengguna LIMIT 1";

    db.query(qSiswa, (err, rS) => {
        db.query(qGuru, (err, rG) => {
            db.query(qAbsenHariIni, (err, rA) => {
                db.query(qLaporanAbsen, (err, rLaporan) => { 
                    db.query(qGrafik, (err, rGr) => { 
                        db.query(qData, [view], (err, results) => {
                            res.render('dashboard', { 
                                view, 
                                pengguna: results || [], 
                                stats: { 
                                    siswa: rS[0]?.total || 0, 
                                    guru: rG[0]?.total || 0, 
                                    absen: rA[0]?.total || 0 
                                },
                                laporan: rLaporan || [],
                                grafik: rGr || [],
                                sekolah: res.locals.sekolah 
                            });
                        });
                    });
                });
            });
        });
    });
});

// ==========================================
// FITUR BARU: ABSENSI GURU (GPS & SELFIE)
// ==========================================

// Halaman Absen Guru
router.get('/absen-guru', getSekolah, (req, res) => {
    res.render('absen-guru', { sekolah: res.locals.sekolah });
});

// Proses Submit Absen Guru
router.post('/submit-absen-guru', upload.single('foto_selfie'), (req, res) => {
    const { nomor_induk, latitude, longitude, status } = req.body;
    const foto = req.file ? req.file.filename : null;
    const tanggal = new Date().toISOString().split('T')[0];
    const jam = new Date().toLocaleTimeString('it-IT'); // Format HH:mm:ss

    const sql = "INSERT INTO absensi (nomor_induk, tanggal, jam_masuk, status, latitude, longitude, foto_selfie) VALUES (?, ?, ?, ?, ?, ?, ?)";
    
    db.query(sql, [nomor_induk, tanggal, jam, status, latitude, longitude, foto], (err) => {
        if (err) {
            console.error(err);
            return res.send("Gagal melakukan absensi.");
        }
        res.send("<script>alert('Absen Berhasil!'); window.location.href='/admin/dashboard';</script>");
    });
});

// ==========================================
// FITUR REKAP, EXPORT, DLL (KODE LAMA ANDA)
// ==========================================

// 10. HALAMAN REKAP
router.get('/rekap', getSekolah, (req, res) => {
    const { kelas, bulan } = req.query;
    const filterBulan = bulan || new Date().toISOString().slice(0, 7); 
    const [tahun, bln] = filterBulan.split('-').map(Number);
    const hariDalamBulan = new Date(tahun, bln, 0).getDate(); 
    const daftarTanggal = Array.from({length: hariDalamBulan}, (_, i) => i + 1);

    db.query("SELECT DISTINCT kelas FROM pengguna WHERE kelas IS NOT NULL AND kelas != '' ORDER BY kelas", (err, daftarKelas) => {
        const qSiswa = "SELECT nomor_induk, nama_lengkap, kelas FROM pengguna WHERE peran = 'Siswa' AND kelas = ? ORDER BY nama_lengkap ASC";
        const qWali = "SELECT nama_lengkap, nomor_induk FROM pengguna WHERE peran = 'Guru' AND kelas = ? LIMIT 1";

        db.query(qSiswa, [kelas], (err, siswa) => {
            db.query(qWali, [kelas], (err, wali) => {
                const qAbsen = "SELECT nomor_induk, DAY(tanggal) as tgl, status FROM absensi WHERE tanggal LIKE ?";
                db.query(qAbsen, [`${filterBulan}%`], (err, dataAbsen) => {
                    let absensiMap = {};
                    let rekapTotal = {};
                    if (siswa) {
                        siswa.forEach(s => {
                            absensiMap[s.nomor_induk] = {};
                            rekapTotal[s.nomor_induk] = { H: 0, S: 0, I: 0, A: 0 };
                        });
                    }
                    if (dataAbsen) {
                        dataAbsen.forEach(row => {
                            if (absensiMap[row.nomor_induk]) {
                                const st = row.status || 'H';
                                absensiMap[row.nomor_induk][row.tgl] = st;
                                rekapTotal[row.nomor_induk][st]++;
                            }
                        });
                    }
                    res.render('rekap', { 
                        view: 'Rekap',
                        siswa: siswa || [],
                        waliKelas: wali[0] || { nama_lengkap: '( ........................ )', nomor_induk: '........................' },
                        daftarTanggal, absensiMap, rekapTotal, daftarKelas,
                        selectedKelas: kelas, selectedBulan: filterBulan,
                        sekolah: res.locals.sekolah 
                    });
                });
            });
        });
    });
});

// 11. EKSPOR REKAP KE EXCEL
router.get('/export-rekap-excel', getSekolah, async (req, res) => {
    const { kelas, bulan } = req.query;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rekap Absensi');
    sheet.mergeCells('A1', 'E1');
    sheet.getCell('A1').value = 'LAPORAN REKAPITULASI ABSENSI SISWA';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.mergeCells('A2', 'E2');
    sheet.getCell('A2').value = res.locals.sekolah.nama_sekolah;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getRow(4).values = ['No', 'NISN', 'Nama Siswa', 'Kelas', 'Total Hadir'];
    const qWali = "SELECT nama_lengkap, nomor_induk FROM pengguna WHERE peran = 'Guru' AND kelas = ? LIMIT 1";
    const qSiswa = "SELECT p.nama_lengkap, p.nomor_induk, p.kelas, COUNT(a.id) as total_hadir FROM pengguna p LEFT JOIN absensi a ON p.nomor_induk = a.nomor_induk AND a.tanggal LIKE ? WHERE p.peran = 'Siswa' AND p.kelas = ? GROUP BY p.nomor_induk ORDER BY p.nama_lengkap ASC";
    db.query(qSiswa, [`${bulan}%`, kelas], (err, results) => {
        db.query(qWali, [kelas], async (err, wali) => {
            const waliData = wali[0] || { nama_lengkap: '( ........................ )', nomor_induk: '........................' };
            if (results) {
                results.forEach((row, i) => {
                    sheet.addRow([i + 1, row.nomor_induk, row.nama_lengkap, row.kelas, row.total_hadir + ' Hari']);
                });
            }
            const rowTtd = sheet.rowCount + 3;
            sheet.getCell(`A${rowTtd}`).value = 'Mengetahui,';
            sheet.getCell(`A${rowTtd + 1}`).value = 'Kepala Sekolah';
            sheet.getCell(`D${rowTtd + 1}`).value = 'Wali Kelas';
            sheet.getCell(`A${rowTtd + 5}`).value = res.locals.sekolah.nama_ks;
            sheet.getCell(`A${rowTtd + 5}`).font = { bold: true, underline: true };
            sheet.getCell(`A${rowTtd + 6}`).value = 'NIP. ' + (res.locals.sekolah.nip_ks || '..........................');
            sheet.getCell(`D${rowTtd + 5}`).value = waliData.nama_lengkap;
            sheet.getCell(`D${rowTtd + 5}`).font = { bold: true, underline: true };
            sheet.getCell(`D${rowTtd + 6}`).value = 'NIP. ' + waliData.nomor_induk;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Rekap_${kelas}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
        });
    });
});

// 12. HARI LIBUR
router.get('/hari-libur', getSekolah, (req, res) => {
    db.query("SELECT * FROM hari_libur ORDER BY tanggal DESC", (err, libur) => {
        res.render('hari-libur', { view: 'Libur', libur: libur || [], sekolah: res.locals.sekolah });
    });
});

router.post('/tambah-libur', (req, res) => {
    const { tanggal, keterangan } = req.body;
    db.query("INSERT IGNORE INTO hari_libur (tanggal, keterangan) VALUES (?, ?)", [tanggal, keterangan], () => {
        res.redirect('/admin/hari-libur');
    });
});

router.get('/hapus-libur/:id', (req, res) => {
    db.query("DELETE FROM hari_libur WHERE id = ?", [req.params.id], () => res.redirect('back'));
});

// EXPORT EXCEL DATA SISWA
router.get('/export-excel', (req, res) => {
    const query = "SELECT nomor_induk, nama_lengkap, tanggal_lahir, kelas FROM pengguna WHERE peran = 'Siswa' ORDER BY kelas ASC";
    db.query(query, (err, results) => {
        let isi = "SEP=;\nNISN;Nama Lengkap;Tanggal Lahir;Kelas\n";
        results.forEach(s => {
            const tgl = s.tanggal_lahir ? new Date(s.tanggal_lahir).toISOString().split('T')[0] : "";
            isi += `${s.nomor_induk};${s.nama_lengkap};${tgl};${s.kelas}\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.attachment('Data_Siswa_SDN_TB.csv');
        res.send(isi);
    });
});

router.get('/download-template', (req, res) => {
    let template = "SEP=;\nNISN;Nama Lengkap;Tanggal Lahir (YYYY-MM-DD);Kelas\n12345678;Siswa Contoh;2015-01-01;1A";
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('Template_Siswa_SDN_TB.csv');
    res.send(template);
});

router.post('/update-sekolah', upload.fields([{name:'logo_sekolah'}, {name:'logo_template'}]), (req, res) => {
    const { nama_sekolah, nama_ks, nip_ks } = req.body;
    let sql = "UPDATE profil_sekolah SET nama_sekolah=?, nama_ks=?, nip_ks=?";
    let params = [nama_sekolah, nama_ks, nip_ks];
    if (req.files['logo_sekolah']) {
        params.push(req.files['logo_sekolah'][0].filename);
        sql += ", logo_sekolah=?";
    }
    if (req.files['logo_template']) {
        params.push(req.files['logo_template'][0].filename);
        sql += ", logo_template=?";
    }
    sql += " WHERE id=1";
    db.query(sql, params, (err) => {
        if (err) return res.send("Gagal mengupdate profil sekolah");
        res.redirect('/admin/dashboard?view=Sekolah');
    });
});

router.get('/hapus-pengguna/:id', (req, res) => {
    db.query("DELETE FROM pengguna WHERE id=?", [req.params.id], () => res.redirect('back'));
});

router.get('/seleksi-cetak', getSekolah, (req, res) => {
    db.query("SELECT * FROM pengguna WHERE peran = 'Siswa' ORDER BY kelas ASC, nama_lengkap ASC", (err, results) => {
        res.render('cetak-seleksi', { siswa: results, sekolah: res.locals.sekolah });
    });
});

router.post('/proses-cetak-a4', getSekolah, (req, res) => {
    const ids = req.body['ids[]'] || req.body.ids;
    if (!ids) return res.send("<script>alert('Pilih siswa dulu!'); window.history.back();</script>");
    db.query("SELECT * FROM pengguna WHERE id IN (?)", [ids], (err, results) => {
        res.render('cetak-kartu-a4', { siswa: results, sekolah: res.locals.sekolah });
    });
});

router.post('/tambah-siswa', (req, res) => {
    const { nomor_induk, nama_lengkap, kelas, tanggal_lahir } = req.body;
    db.query("INSERT INTO pengguna (nomor_induk, nama_lengkap, kelas, tanggal_lahir, peran, kata_sandi) VALUES (?, ?, ?, ?, 'Siswa', '12345')", [nomor_induk, nama_lengkap, kelas, tanggal_lahir], () => res.redirect('/admin/dashboard?view=Siswa'));
});

router.post('/upload-siswa', upload.single('file_csv'), (req, res) => {
    if (!req.file) return res.send("Pilih file dulu!");
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv({ separator: ';' })) 
        .on('data', (data) => results.push(data))
        .on('end', () => {
            results.forEach(row => {
                db.query("INSERT IGNORE INTO pengguna (nomor_induk, nama_lengkap, tanggal_lahir, kelas, peran, kata_sandi) VALUES (?, ?, ?, ?, 'Siswa', '12345')", [row.NISN, row['Nama Lengkap'], row['Tanggal Larir (YYYY-MM-DD)'], row.Kelas]);
            });
            fs.unlinkSync(req.file.path);
            res.redirect('/admin/dashboard?view=Siswa');
        });
});

module.exports = router;