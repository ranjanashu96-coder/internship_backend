# RKNexora PDF Generator

This service generates branded internship documents using HTML/CSS and `puppeteer-core`.

## Install

```bash
npm install puppeteer-core qrcode archiver
```

## Environment

Chrome is detected automatically on Windows and Linux. You can also set:

```env
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
APP_BASE_URL=http://localhost:5000
```

## Required assets

Place these files in `src/assets/pdf`:

- `eduintern-logo.png`
- `director-signature.png`
- `company-stamp.png`

## Usage

```js
import { pdfGenerator } from "../services/pdfGenerator/index.js";

const documents = await pdfGenerator.generateAll({
  student,
  college,
  domain,
  mentor,
  internship,
  attendanceRecords,
  logbookEntries,
  attendanceSummary,
  assessment,
  result,
  certificate,
});
```
