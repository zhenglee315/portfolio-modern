import { Buffer } from 'node:buffer';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  tableCsv,
  tablePrintHtml,
  tableTsv,
  tableXlsx,
  type TableExportMatrix,
} from '@/shared/lib/table-export';

/** Verify both ZIP directories and independently validate every stored payload. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const archive = Buffer.from(bytes);
  const endOffset = archive.length - 22;
  expect(archive.readUInt32LE(endOffset)).toBe(0x06054b50);
  expect(archive.readUInt16LE(endOffset + 4)).toBe(0);
  expect(archive.readUInt16LE(endOffset + 6)).toBe(0);
  expect(archive.readUInt16LE(endOffset + 20)).toBe(0);
  const count = archive.readUInt16LE(endOffset + 10);
  expect(archive.readUInt16LE(endOffset + 8)).toBe(count);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  expect(centralOffset + centralSize).toBe(endOffset);
  const files = new Map<string, string>();
  let centralCursor = centralOffset;
  let localCursor = 0;
  for (let index = 0; index < count; index++) {
    expect(archive.readUInt32LE(centralCursor)).toBe(0x02014b50);
    expect(archive.readUInt16LE(centralCursor + 6)).toBe(20);
    expect(archive.readUInt16LE(centralCursor + 8)).toBe(0x0800);
    expect(archive.readUInt16LE(centralCursor + 10)).toBe(0);
    const checksum = archive.readUInt32LE(centralCursor + 16);
    const length = archive.readUInt32LE(centralCursor + 20);
    expect(archive.readUInt32LE(centralCursor + 24)).toBe(length);
    const filenameLength = archive.readUInt16LE(centralCursor + 28);
    expect(archive.readUInt16LE(centralCursor + 30)).toBe(0);
    expect(archive.readUInt16LE(centralCursor + 32)).toBe(0);
    const localOffset = archive.readUInt32LE(centralCursor + 42);
    expect(localOffset).toBe(localCursor);
    const filename = archive
      .subarray(centralCursor + 46, centralCursor + 46 + filenameLength)
      .toString('utf8');
    expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
    expect(archive.readUInt16LE(localOffset + 4)).toBe(20);
    expect(archive.readUInt16LE(localOffset + 6)).toBe(0x0800);
    expect(archive.readUInt16LE(localOffset + 8)).toBe(0);
    expect(archive.readUInt16LE(localOffset + 10)).toBe(0);
    expect(archive.readUInt16LE(localOffset + 12)).toBe(33);
    expect(archive.readUInt32LE(localOffset + 14)).toBe(checksum);
    expect(archive.readUInt32LE(localOffset + 18)).toBe(length);
    expect(archive.readUInt32LE(localOffset + 22)).toBe(length);
    expect(archive.readUInt16LE(localOffset + 26)).toBe(filenameLength);
    expect(archive.readUInt16LE(localOffset + 28)).toBe(0);
    expect(
      archive.subarray(localOffset + 30, localOffset + 30 + filenameLength).toString('utf8'),
    ).toBe(filename);
    const payloadStart = localOffset + 30 + filenameLength;
    const payload = archive.subarray(payloadStart, payloadStart + length);
    expect(crc32(payload)).toBe(checksum);
    expect(files.has(filename)).toBe(false);
    files.set(filename, payload.toString('utf8'));
    localCursor = payloadStart + length;
    centralCursor += 46 + filenameLength;
  }
  expect(localCursor).toBe(centralOffset);
  expect(centralCursor).toBe(endOffset);
  return files;
}

function parseXml(content: string): Document {
  const document = new DOMParser().parseFromString(content, 'application/xml');
  expect(document.querySelector('parsererror')).toBeNull();
  return document;
}

describe('delimited table exports', () => {
  it('preserves CSV quotes, delimiters, newlines and literal scalar values', () => {
    expect(
      tableCsv([
        ['Name', 'Count', 'Active', 'Missing'],
        ['comma,"quoted"\r\nnext', -2.5, false, null],
        ['中文 🧪', 0, true, ''],
      ]),
    ).toBe(
      'Name,Count,Active,Missing\r\n"comma,""quoted""\r\nnext",-2.5,false,\r\n中文 🧪,0,true,',
    );
  });

  it('quotes tabs, quotes and newlines in clipboard TSV without changing numeric negatives', () => {
    expect(
      tableTsv([
        ['Header', 'Count'],
        ['a\tb"c\nnext', -3],
        [null, true],
      ]),
    ).toBe('Header\tCount\r\n"a\tb""c\nnext"\t-3\r\n\ttrue');
  });

  it.each([
    ['=1+1', "'=1+1"],
    [' +SUM(A1:A2)', "' +SUM(A1:A2)"],
    ['-42', "'-42"],
    ['  @SUM(A1:A2)', "'  @SUM(A1:A2)"],
    ['\tplain', "'\tplain"],
    [' \tplain', "' \tplain"],
    ['\rplain', '"\'\rplain"'],
  ])('guards spreadsheet formula or control prefixes in %j', (cell, expected) => {
    expect(tableCsv([[cell]])).toBe(expected);
    expect(tableTsv([[cell]])).toBe(cell.includes('\t') ? `"${expected}"` : expected);
  });

  it('preserves ordinary text and an empty matrix', () => {
    const matrix: TableExportMatrix = [[' user-name@example.test ', 'one+two', '0012']];
    expect(tableCsv(matrix)).toBe(' user-name@example.test ,one+two,0012');
    expect(tableTsv(matrix)).toBe(' user-name@example.test \tone+two\t0012');
    expect(tableCsv([])).toBe('');
    expect(tableTsv([])).toBe('');
  });
});

describe('XLSX table exports', () => {
  it('writes a valid deterministic OOXML package with complete ZIP offsets and CRCs', () => {
    const matrix: TableExportMatrix = [
      ['Name', 'Enabled'],
      ['中文 🧪', true],
    ];
    const archive = tableXlsx(matrix);
    expect(tableXlsx(matrix)).toEqual(archive);
    const files = readStoredZip(archive);
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]);
    for (const content of files.values()) parseXml(content);
    const types = parseXml(files.get('[Content_Types].xml')!);
    expect(
      types.querySelector('Override[PartName="/xl/workbook.xml"]')?.getAttribute('ContentType'),
    ).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
    expect(types.querySelector('Override[PartName="/xl/worksheets/sheet1.xml"]')).not.toBeNull();
    const rootRelationships = parseXml(files.get('_rels/.rels')!);
    expect(rootRelationships.querySelector('Relationship')?.getAttribute('Target')).toBe(
      'xl/workbook.xml',
    );
    const workbook = parseXml(files.get('xl/workbook.xml')!);
    expect(workbook.querySelector('sheet')?.getAttribute('r:id')).toBe('rId1');
    const workbookRelationships = parseXml(files.get('xl/_rels/workbook.xml.rels')!);
    expect(
      workbookRelationships.querySelector('Relationship[Id="rId1"]')?.getAttribute('Target'),
    ).toBe('worksheets/sheet1.xml');
  });

  it('preserves numeric, boolean and empty cells while treating dangerous text as inline strings', () => {
    const originalText = '<tag>&"\'\r\n中文🧪\u0000\uD800';
    const matrix: TableExportMatrix = [
      ['Text', 'Number', 'Bool', 'Empty', 'Special'],
      [' =SUM(A1:A2)', -42.75, true, null, originalText],
      [null, 0, false, null, ''],
    ];
    const files = readStoredZip(tableXlsx(matrix));
    const content = files.get('xl/worksheets/sheet1.xml')!;
    const sheet = parseXml(content);
    expect(sheet.querySelector('dimension')?.getAttribute('ref')).toBe('A1:E3');
    expect([...sheet.querySelectorAll('row')].map((row) => row.getAttribute('r'))).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(sheet.querySelector('c[r="A2"]')?.getAttribute('t')).toBe('inlineStr');
    expect(sheet.querySelector('c[r="A2"] t')?.textContent).toBe(' =SUM(A1:A2)');
    expect(sheet.querySelector('c[r="A2"] t')?.getAttribute('xml:space')).toBe('preserve');
    expect(sheet.querySelector('c[r="B2"]')?.getAttribute('t')).toBe('n');
    expect(sheet.querySelector('c[r="B2"] v')?.textContent).toBe('-42.75');
    expect(sheet.querySelector('c[r="B3"] v')?.textContent).toBe('0');
    expect(sheet.querySelector('c[r="C2"]')?.getAttribute('t')).toBe('b');
    expect(sheet.querySelector('c[r="C2"] v')?.textContent).toBe('1');
    expect(sheet.querySelector('c[r="C3"] v')?.textContent).toBe('0');
    expect(sheet.querySelector('c[r="D2"]')?.childNodes).toHaveLength(0);
    expect(sheet.querySelector('c[r="E3"]')?.getAttribute('t')).toBe('inlineStr');
    expect(sheet.querySelector('c[r="E3"] t')?.textContent).toBe('');
    expect(sheet.querySelector('c[r="E2"] t')?.textContent).toBe('<tag>&"\'\r\n中文🧪\uFFFD\uFFFD');
    expect(content).toContain('&lt;tag&gt;&amp;&quot;&apos;');
    expect(sheet.querySelector('f')).toBeNull();
  });

  it('writes correct multi-letter cell references and an empty worksheet', () => {
    const header = Array.from({ length: 28 }, (_, index) => `Column ${index}`);
    const sheet = parseXml(readStoredZip(tableXlsx([header])).get('xl/worksheets/sheet1.xml')!);
    expect(sheet.querySelector('dimension')?.getAttribute('ref')).toBe('A1:AB1');
    expect(sheet.querySelector('c[r="Z1"] t')?.textContent).toBe('Column 25');
    expect(sheet.querySelector('c[r="AA1"] t')?.textContent).toBe('Column 26');
    expect(sheet.querySelector('c[r="AB1"] t')?.textContent).toBe('Column 27');
    const empty = parseXml(readStoredZip(tableXlsx([])).get('xl/worksheets/sheet1.xml')!);
    expect(empty.querySelector('dimension')?.getAttribute('ref')).toBe('A1');
    expect(empty.querySelector('sheetData')?.childNodes).toHaveLength(0);
  });

  it('rejects data beyond the XLSX worksheet column limit', () => {
    expect(() => tableXlsx([Array.from({ length: 16_385 }, () => null)])).toThrow(RangeError);
  });
});

describe('print table exports', () => {
  it('escapes title and cell HTML in a complete local printable document', () => {
    const html = tablePrintHtml('<script>title & "quoted"</script>', [
      ['Account', '<img src="https://example.test/pixel">'],
      ['<script>alert(1)</script> 中文 🧪', true],
      [null, -8],
    ]);
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.title).toBe('<script>title & "quoted"</script>');
    expect(document.querySelector('meta[charset]')?.getAttribute('charset')).toBe('UTF-8');
    expect(document.querySelector('h1')?.textContent).toBe(document.title);
    expect([...document.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
      'Account',
      '<img src="https://example.test/pixel">',
    ]);
    expect([...document.querySelectorAll('tbody td')].map((cell) => cell.textContent)).toEqual([
      '<script>alert(1)</script> 中文 🧪',
      'true',
      '',
      '-8',
    ]);
    expect(document.querySelector('script,img,link,iframe')).toBeNull();
    expect(document.querySelector('style')?.textContent).toContain('text-align:center');
    expect(document.querySelector('style')?.textContent).toContain('@media print');
    expect(document.querySelector('style')?.textContent).toContain('overflow-wrap:anywhere');
  });

  it('supports an empty table and replaces illegal text characters', () => {
    const document = new DOMParser().parseFromString(
      tablePrintHtml('Title\u0000', []),
      'text/html',
    );
    expect(document.title).toBe('Title\uFFFD');
    expect(document.querySelector('thead')).toBeNull();
    expect(document.querySelector('tbody')?.children).toHaveLength(0);
  });
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  'rejects non-finite numeric cells consistently (%s)',
  (value) => {
    expect(() => tableCsv([[value]])).toThrow(RangeError);
    expect(() => tableTsv([[value]])).toThrow(RangeError);
    expect(() => tableXlsx([[value]])).toThrow(RangeError);
    expect(() => tablePrintHtml('Title', [[value]])).toThrow(RangeError);
  },
);
