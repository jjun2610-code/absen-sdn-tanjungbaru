const express = require('express');
const router = express.Router();

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.redirect('/auth/login');
    });
});

// Tambahkan rute login Anda di sini...

module.exports = router;