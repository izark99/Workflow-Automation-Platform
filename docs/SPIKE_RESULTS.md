# Spike results

Written by `npm run spike` from `docs/spike-raw.json`. Do not edit by hand: the next run overwrites this file.

Machine: Chromium 158.0.8127.36 (headless), Node v22.23.5, 4 vCPUs, 16 GB RAM. Each run uses a production build and a fresh browser.

Peak memory is the highest resident size of the browser renderer process (kernel `VmHWM`), which holds the page, the file bytes and DuckDB-WASM. Load time covers reading the file and creating the DuckDB table. Group-by is one query that counts, sums and averages over 200 group keys. Row counts of 1,048,576 include the header row.

## Chosen reading strategies

Chosen xlsx reading strategy: `xlsx-stream`. It finished 3 of 3 runs with a total load time of 165.9 s.

Chosen csv reading strategy: `duckdb-csv`. It finished 3 of 3 runs with a total load time of 8.7 s.

Rule: the strategy that finishes, with the right row count, at the most file sizes. A tie goes to the lower total load time.

## Six measurements

Each row shows the chosen strategy of its format.

| File | Format | Rows | File MB | Strategy | Status | Load s | Peak memory MB | Group-by ms | Tab survived |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rows-100000.xlsx | xlsx | 100,000 | 29 | `xlsx-stream` | ok | 9.6 | 807 | 48 | yes |
| rows-500000.xlsx | xlsx | 500,000 | 143 | `xlsx-stream` | ok | 50.4 | 1144 | 82 | yes |
| rows-1048576.xlsx | xlsx | 1,048,576 | 300 | `xlsx-stream` | ok | 105.9 | 1183 | 81 | yes |
| rows-100000.csv | csv | 100,000 | 36 | `duckdb-csv` | ok | 0.9 | 383 | 50 | yes |
| rows-500000.csv | csv | 500,000 | 180 | `duckdb-csv` | ok | 2.7 | 692 | 65 | yes |
| rows-1048576.csv | csv | 1,048,576 | 378 | `duckdb-csv` | ok | 5.0 | 1161 | 75 | yes |

## Targets from SPEC section 8

- A 200,000-row xlsx loads in under 30 s: not measured directly. Linear estimate between the 100,000-row (9.6 s) and 500,000-row (50.4 s) runs of `xlsx-stream`: 19.8 s. Met (estimate).
- A csv file at the full row limit loads without a crash: met (`duckdb-csv`, status ok, 5.0 s).
- xlsx at the full row limit: loaded with `xlsx-stream` in 105.9 s, peak 1183 MB. The "save as csv" warning is still needed above the measured size.
- Size guard input for T0.5: largest xlsx that loaded with `xlsx-stream`: 300 MB; smallest that failed: none.

## Strategies

- `sheetjs-whole`: SheetJS parses the whole workbook or csv text in memory (`read` with dense mode), then rows go to DuckDB as Arrow chunks of 50,000 rows.
- `xlsx-stream`: Own streaming reader (`src/engine/xlsx-stream/`): unzips one part at a time with `DecompressionStream`, parses the sheet XML in chunks, and sends Arrow chunks of 50,000 rows to DuckDB. xlsx only.
- `duckdb-csv`: DuckDB reads the csv file handle directly with `read_csv`. csv only.

## Size guard

The app refuses an xlsx file above 300.0 MB (300,002,342 bytes, the largest xlsx that loaded) before it reads a byte, and shows the "save as csv" warning instead. The benchmark runs above bypass the guard (`?guard=off`) to measure the raw strategies. Each run of `npm run spike` then loads an xlsx just above the limit with the guard on.

A 301 MB xlsx was refused in 155 ms with this message: "guard-check.xlsx is 301.0 MB, which is above the 300.0 MB this app can read safely from an .xlsx file. Open the file in Excel, save the sheet as .csv, and load the .csv file instead."

Result: passed.

## All runs

| File | Format | Rows | File MB | Strategy | Status | Load s | Peak memory MB | Group-by ms | Tab survived |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rows-100000.xlsx | xlsx | 100,000 | 29 | `sheetjs-whole` | ok | 18.8 | 2102 | 93 | yes |
| rows-100000.xlsx | xlsx | 100,000 | 29 | `xlsx-stream` | ok | 9.6 | 807 | 48 | yes |
| rows-100000.csv | csv | 100,000 | 36 | `sheetjs-whole` | ok | 13.3 | 1816 | 46 | yes |
| rows-100000.csv | csv | 100,000 | 36 | `duckdb-csv` | ok | 0.9 | 383 | 50 | yes |
| rows-500000.xlsx | xlsx | 500,000 | 143 | `sheetjs-whole` | error | - | 2156 | - | yes |
| rows-500000.xlsx | xlsx | 500,000 | 143 | `xlsx-stream` | ok | 50.4 | 1144 | 82 | yes |
| rows-500000.csv | csv | 500,000 | 180 | `sheetjs-whole` | ok | 79.3 | 9641 | 86 | yes |
| rows-500000.csv | csv | 500,000 | 180 | `duckdb-csv` | ok | 2.7 | 692 | 65 | yes |
| rows-1048576.xlsx | xlsx | 1,048,576 | 300 | `sheetjs-whole` | error | - | 3546 | - | yes |
| rows-1048576.xlsx | xlsx | 1,048,576 | 300 | `xlsx-stream` | ok | 105.9 | 1183 | 81 | yes |
| rows-1048576.csv | csv | 1,048,576 | 378 | `sheetjs-whole` | ok | 175.0 | 9541 | 77 | yes |
| rows-1048576.csv | csv | 1,048,576 | 378 | `duckdb-csv` | ok | 5.0 | 1161 | 75 | yes |

## Failures

- rows-500000.xlsx with `sheetjs-whole`: error. The file has no sheet. Check the file and try again.
- rows-1048576.xlsx with `sheetjs-whole`: error. The file has no sheet. Check the file and try again.
