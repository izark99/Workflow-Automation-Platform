import { describe, expect, it } from 'vitest';
import { parseSheetRows } from './sheet';

async function* chunksOf(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function collect(text: string, size: number, sst: string[] = [], dateStyles: boolean[] = []) {
  const rows = [];
  for await (const r of parseSheetRows(chunksOf(text, size), { sharedStrings: sst, dateStyles })) rows.push(r);
  return rows;
}

const XML =
  '<worksheet><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
  '<row r="2"><c r="A2"><v>1.5</v></c><c r="C2" t="b"><v>1</v></c></row>' +
  '<row r="3"/>' +
  '<row r="5"><c r="B5" t="inlineStr"><is><t>a &amp; b</t></is></c><c r="C5" s="1"><v>45000</v></c></row>' +
  '</sheetData></worksheet>';

describe('parseSheetRows', () => {
  const expected = [
    { row: 1, cells: ['name', 'a<b'] },
    { row: 2, cells: [1.5, undefined, true] },
    { row: 3, cells: [] },
    { row: 5, cells: [undefined, 'a & b', new Date('2023-03-15T00:00:00Z')] },
  ];
  const sst = ['name', 'a&lt;b'.replace('&lt;', '<')];

  it('reads rows, gaps, booleans, inline strings and dates', async () => {
    expect(await collect(XML, XML.length, sst, [false, true])).toEqual(expected);
  });
  it('gives the same rows for any chunk size, down to one character', async () => {
    for (const size of [1, 2, 3, 7, 50]) {
      expect(await collect(XML, size, sst, [false, true])).toEqual(expected);
    }
  });
  it('does not mistake other elements that start with row', async () => {
    const xml = '<worksheet><rowBreaks><brk id="1"/></rowBreaks><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>';
    expect(await collect(xml, 5)).toEqual([{ row: 1, cells: [2] }]);
  });
  it('unescapes character references in values', async () => {
    const xml = '<sheetData><row r="1"><c r="A1" t="str"><v>x&#65;&#x42;&quot;</v></c></row></sheetData>';
    expect(await collect(xml, 4)).toEqual([{ row: 1, cells: ['xAB"'] }]);
  });
  it('uses a sequential column when a cell has no reference', async () => {
    const xml = '<sheetData><row r="1"><c><v>1</v></c><c><v>2</v></c></row></sheetData>';
    expect(await collect(xml, 6)).toEqual([{ row: 1, cells: [1, 2] }]);
  });
});
