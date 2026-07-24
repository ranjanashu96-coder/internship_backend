export const baseStyles = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    color: #161b26;
    background: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { font-size: 12px; line-height: 1.45; }
  .serif { font-family: Georgia, "Times New Roman", serif; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .text-bold { font-weight: 700; }
  .muted { color: #5f6673; }
  .blue { color: #174ea6; }
  .green { color: #137333; }
  .page-break { break-before: page; page-break-before: always; }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4; margin: 14mm; }
`;
