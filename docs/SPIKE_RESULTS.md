# Spike results

Written by `npm run spike` from `docs/spike-raw.json`. Do not edit by hand: the next run overwrites this file.

Machine: Chromium 158.0.8127.36 (headless), Node v22.23.5, 4 vCPUs, 16 GB RAM. Each run uses a production build and a fresh browser.

Peak memory is the highest resident size of the browser renderer process (kernel `VmHWM`), which holds the page, the file bytes and DuckDB-WASM. Load time covers reading the file and creating the DuckDB table. Group-by is one query that counts, sums and averages over 200 group keys. Row counts of 1,048,576 include the header row.

## Chosen reading strategies

Chosen xlsx reading strategy: `xlsx-stream`. It finished 3 of 3 runs with a total load time of 131.5 s.

Chosen csv reading strategy: `duckdb-csv`. It finished 3 of 3 runs with a total load time of 6.9 s.

Rule: the strategy that finishes, with the right row count, at the most file sizes. A tie goes to the lower total load time.

## Six measurements

Each row shows the chosen strategy of its format.

| File | Format | Rows | File MB | Strategy | Status | Load s | Peak memory MB | Group-by ms | Tab survived |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rows-100000.xlsx | xlsx | 100,000 | 29 | `xlsx-stream` | ok | 8.5 | 796 | 45 | yes |
| rows-500000.xlsx | xlsx | 500,000 | 143 | `xlsx-stream` | ok | 40.0 | 1118 | 61 | yes |
| rows-1048576.xlsx | xlsx | 1,048,576 | 300 | `xlsx-stream` | ok | 82.9 | 1175 | 60 | yes |
| rows-100000.csv | csv | 100,000 | 36 | `duckdb-csv` | ok | 0.9 | 381 | 34 | yes |
| rows-500000.csv | csv | 500,000 | 180 | `duckdb-csv` | ok | 2.0 | 698 | 41 | yes |
| rows-1048576.csv | csv | 1,048,576 | 378 | `duckdb-csv` | ok | 4.0 | 1154 | 63 | yes |

## Targets from SPEC section 8

- A 200,000-row xlsx loads in under 30 s: not measured directly. Linear estimate between the 100,000-row (8.5 s) and 500,000-row (40.0 s) runs of `xlsx-stream`: 16.4 s. Met (estimate).
- A csv file at the full row limit loads without a crash: met (`duckdb-csv`, status ok, 4.0 s).
- xlsx at the full row limit: loaded with `xlsx-stream` in 82.9 s, peak 1175 MB. The "save as csv" warning is still needed above the measured size.
- Size guard input for T0.5: largest xlsx that loaded with `xlsx-stream`: 300 MB; smallest that failed: none.

## Strategies

- `sheetjs-whole`: SheetJS parses the whole workbook or csv text in memory (`read` with dense mode), then rows go to DuckDB as Arrow chunks of 50,000 rows.
- `xlsx-stream`: Own streaming reader (`src/engine/xlsx-stream/`): unzips one part at a time with `DecompressionStream`, parses the sheet XML in chunks, and sends Arrow chunks of 50,000 rows to DuckDB. xlsx only.
- `duckdb-csv`: DuckDB reads the csv file handle directly with `read_csv`. csv only.

## Size guard

The app refuses an xlsx file above 300.0 MB (300,002,342 bytes, the largest xlsx that loaded) before it reads a byte, and shows the "save as csv" warning instead. The benchmark runs above bypass the guard (`?guard=off`) to measure the raw strategies. Each run of `npm run spike` then loads an xlsx just above the limit with the guard on.

A 301 MB xlsx was refused in 139 ms with this message: "guard-check.xlsx is 301.0 MB, which is above the 300.0 MB this app can read safely from an .xlsx file. Open the file in Excel, save the sheet as .csv, and load the .csv file instead."

Result: passed.

## All runs

| File | Format | Rows | File MB | Strategy | Status | Load s | Peak memory MB | Group-by ms | Tab survived |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rows-100000.xlsx | xlsx | 100,000 | 29 | `sheetjs-whole` | ok | 15.8 | 2096 | 53 | yes |
| rows-100000.xlsx | xlsx | 100,000 | 29 | `xlsx-stream` | ok | 8.5 | 796 | 45 | yes |
| rows-100000.csv | csv | 100,000 | 36 | `sheetjs-whole` | ok | 11.8 | 1855 | 35 | yes |
| rows-100000.csv | csv | 100,000 | 36 | `duckdb-csv` | ok | 0.9 | 381 | 34 | yes |
| rows-500000.xlsx | xlsx | 500,000 | 143 | `sheetjs-whole` | error | - | 2157 | - | yes |
| rows-500000.xlsx | xlsx | 500,000 | 143 | `xlsx-stream` | ok | 40.0 | 1118 | 61 | yes |
| rows-500000.csv | csv | 500,000 | 180 | `sheetjs-whole` | ok | 69.1 | 9645 | 56 | yes |
| rows-500000.csv | csv | 500,000 | 180 | `duckdb-csv` | ok | 2.0 | 698 | 41 | yes |
| rows-1048576.xlsx | xlsx | 1,048,576 | 300 | `sheetjs-whole` | error | - | 3521 | - | yes |
| rows-1048576.xlsx | xlsx | 1,048,576 | 300 | `xlsx-stream` | ok | 82.9 | 1175 | 60 | yes |
| rows-1048576.csv | csv | 1,048,576 | 378 | `sheetjs-whole` | ok | 152.1 | 9491 | 98 | yes |
| rows-1048576.csv | csv | 1,048,576 | 378 | `duckdb-csv` | ok | 4.0 | 1154 | 63 | yes |

## Failures

- rows-500000.xlsx with `sheetjs-whole`: error. The file has no sheet. Check the file and try again.
- rows-1048576.xlsx with `sheetjs-whole`: error. The file has no sheet. Check the file and try again.
