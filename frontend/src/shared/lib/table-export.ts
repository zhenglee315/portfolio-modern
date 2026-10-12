export type TableExportCell = string | number | boolean | null;
export type TableExportMatrix = TableExportCell[][];

const encoder = new TextEncoder();
const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const spreadsheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationshipNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const maximumSheetRows = 1_048_576;
const maximumSheetColumns = 16_384;

function cellText(cell: TableExportCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number' && !Number.isFinite(cell)) {
    throw new RangeError('Table exports require finite numeric values.');
  }
  return String(cell);
}

function delimitedText(matrix: TableExportMatrix, delimiter: ',' | '\t'): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          let value = cellText(cell);
          // Spreadsheet applications can interpret imported text as a formula.
          if (
            typeof cell === 'string' &&
            (/^\s*[\t\r]/u.test(value) || /^[=+\-@]/u.test(value.trimStart()))
          ) {
            value = `'${value}`;
          }
          if (value.includes(delimiter) || /["\r\n]/u.test(value)) {
            return `"${value.replaceAll('"', '""')}"`;
          }
          return value;
        })
        .join(delimiter),
    )
    .join('\r\n');
}

/** Serialize table text without turning string values into spreadsheet formulas. */
export function tableCsv(matrix: TableExportMatrix): string {
  return delimitedText(matrix, ',');
}

/** Quoted TSV preserves tabs and multiline cells when pasted into a spreadsheet. */
export function tableTsv(matrix: TableExportMatrix): string {
  return delimitedText(matrix, '\t');
}

function escapedMarkup(value: string): string {
  let legalText = '';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    const legal =
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    legalText += legal ? character : '\uFFFD';
  }
  return legalText
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('\r', '&#13;');
}

function columnName(index: number): string {
  let name = '';
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
    name = String.fromCharCode(65 + ((number - 1) % 26)) + name;
  }
  return name;
}

function worksheetXml(matrix: TableExportMatrix): string {
  let columns = 0;
  for (const row of matrix) columns = Math.max(columns, row.length);
  if (matrix.length > maximumSheetRows || columns > maximumSheetColumns) {
    throw new RangeError('Table exceeds the XLSX worksheet row or column limit.');
  }
  const dimension =
    matrix.length && columns ? `A1:${columnName(columns - 1)}${matrix.length}` : 'A1';
  const rows = matrix.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (cell === null) return `<c r="${reference}"/>`;
      if (typeof cell === 'string') {
        return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapedMarkup(cell)}</t></is></c>`;
      }
      if (typeof cell === 'boolean') {
        return `<c r="${reference}" t="b"><v>${cell ? 1 : 0}</v></c>`;
      }
      return `<c r="${reference}" t="n"><v>${cellText(cell)}</v></c>`;
    });
    return `<row r="${rowIndex + 1}">${cells.join('')}</row>`;
  });
  return `${xmlDeclaration}<worksheet xmlns="${spreadsheetNamespace}"><dimension ref="${dimension}"/><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

/** Store the small OOXML package directly; no ZIP dependency or runtime download is needed. */
function storedZip(files: { name: string; content: string }[]): Uint8Array {
  const entries = files.map(({ name, content }) => {
    const filename = encoder.encode(name);
    const bytes = encoder.encode(content);
    return { filename, bytes, crc: crc32(bytes), offset: 0 };
  });
  let localLength = 0;
  let centralLength = 0;
  for (const entry of entries) {
    entry.offset = localLength;
    localLength += 30 + entry.filename.length + entry.bytes.length;
    centralLength += 46 + entry.filename.length;
  }
  const size = localLength + centralLength + 22;
  if (size > 0xffffffff) throw new RangeError('Table exceeds the supported ZIP archive size.');
  const archive = new Uint8Array(size);
  const view = new DataView(archive.buffer);
  let offset = 0;
  for (const entry of entries) {
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 33, true); // 1980-01-01 keeps exports deterministic.
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.bytes.length, true);
    view.setUint32(offset + 22, entry.bytes.length, true);
    view.setUint16(offset + 26, entry.filename.length, true);
    view.setUint16(offset + 28, 0, true);
    archive.set(entry.filename, offset + 30);
    archive.set(entry.bytes, offset + 30 + entry.filename.length);
    offset += 30 + entry.filename.length + entry.bytes.length;
  }
  for (const entry of entries) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 33, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.bytes.length, true);
    view.setUint32(offset + 24, entry.bytes.length, true);
    view.setUint16(offset + 28, entry.filename.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, entry.offset, true);
    archive.set(entry.filename, offset + 46);
    offset += 46 + entry.filename.length;
  }
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralLength, true);
  view.setUint32(offset + 16, localLength, true);
  view.setUint16(offset + 20, 0, true);
  return archive;
}

/** Build a real XLSX workbook, preserving numeric and boolean cell types. */
export function tableXlsx(matrix: TableExportMatrix): Uint8Array {
  return storedZip([
    {
      name: '[Content_Types].xml',
      content: `${xmlDeclaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `${xmlDeclaration}<Relationships xmlns="${packageRelationshipNamespace}"><Relationship Id="rId1" Type="${relationshipNamespace}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `${xmlDeclaration}<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `${xmlDeclaration}<Relationships xmlns="${packageRelationshipNamespace}"><Relationship Id="rId1" Type="${relationshipNamespace}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(matrix) },
  ]);
}

/** Return a standalone print document; opening it and invoking print belong to the caller. */
export function tablePrintHtml(title: string, matrix: TableExportMatrix): string {
  const heading = escapedMarkup(title);
  const [header, ...rows] = matrix;
  const tableHeader = header
    ? `<thead><tr>${header.map((cell) => `<th scope="col">${escapedMarkup(cellText(cell))}</th>`).join('')}</tr></thead>`
    : '';
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapedMarkup(cellText(cell))}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title><style>
body{margin:1rem;color:#111;background:#fff;font:14px system-ui,sans-serif}
h1{font-size:1.35rem;margin:0 0 1rem}
table{width:100%;border-collapse:collapse;table-layout:auto}
th,td{padding:.5rem;border:1px solid #ccc;text-align:center;vertical-align:middle;white-space:pre-wrap;overflow-wrap:anywhere}
th{background:#eee;font-weight:600}
thead{display:table-header-group}tr{break-inside:avoid}
@page{margin:12mm}@media print{body{margin:0;font-size:10pt}th{background:#eee;print-color-adjust:exact}}
</style></head><body><main><h1>${heading}</h1><table>${tableHeader}<tbody>${body}</tbody></table></main></body></html>`;
}
