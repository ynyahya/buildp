# Form Permintaan ATK - BPS

Aplikasi web untuk mengelola permintaan Alat Tulis Kantor (ATK) dengan fitur tanda tangan digital dan export Excel.

## Struktur Folder

```
form-atk-bps/
├── index.html                 # File HTML utama (ringkas)
├── assets/
│   ├── css/
│   │   ├── main.css          # Styling utama
│   │   └── print.css         # Styling untuk print/PDF
│   └── js/
│       └── app.js            # Semua logika JavaScript
└── README.md                  # Dokumentasi ini
```

## Cara Menggunakan

1. **Extract file ZIP** ke folder komputer Anda
2. **Buka file index.html** dengan browser modern (Chrome, Firefox, Edge)
3. Aplikasi siap digunakan tanpa perlu instalasi tambahan

## Fitur Utama

✅ Form permintaan ATK dengan validasi lengkap
✅ Tanda tangan digital untuk pemohon, verifikator, dan supervisor
✅ Export ke Excel dengan gambar tanda tangan
✅ Print/Save as PDF
✅ Penyimpanan data lokal (localStorage)
✅ Responsive design dengan Tailwind CSS

## Library External (CDN)

- Tailwind CSS - Framework CSS
- SignaturePad - Tanda tangan digital
- ExcelJS - Export Excel
- FileSaver.js - Download file

## Catatan

- Data disimpan di browser (localStorage)
- Tidak memerlukan server atau database
- Untuk penggunaan offline, download library CDN secara lokal

## Pengembangan Lebih Lanjut

Jika ingin memecah JavaScript menjadi modul terpisah:
- utils.js (helper functions)
- storage.js (localStorage management)  
- signature.js (SignaturePad handlers)
- export.js (Excel export)
- form.js (form handling)
- app.js (main application)

---
Dikembangkan untuk BPS (Badan Pusat Statistik)
