# McEasy Timesheet

Automates an authorized Timesheet login and adds an 8-hour Monitoring log. It previews by default and only submits with `--submit`.

## Requirements

Node.js 22.18 or later.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Fill `TIMESHEET_EMAIL` and `TIMESHEET_PASSWORD` in `.env`. `TIMESHEET_URL` is optional and defaults to the production Timesheet URL. The file is ignored by Git.

`FEATURE` is required example fill `FEATURE="SaaS Modules - Monitoring (Fleet Management System)"` and defaults to an empty string. `PUBLIC_HOLIDAY` is optional example fill `PUBLIC_HOLIDAY="2025-01-01,..."` and defaults to an empty string.

## Options

```bash
npm run start -- --help
```

`--` tells npm to pass the following arguments to the Timesheet script.

| Option                              | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `--date YYYY-MM-DD`                 | Process one date. Defaults to today.          |
| `--month YYYY-MM`                   | Process every weekday in a month.             |
| `--from YYYY-MM-DD --to YYYY-MM-DD` | Process an inclusive date range.              |
| `--submit`                          | Save prepared logs. Omit it for preview mode. |
| `--headed`                          | Display the browser while the script runs.    |
| `--record`                          | Save a WebM recording under `artifacts/`.     |
| `--help`, `-h`                      | Display the available options.                |

Value options support both `--date 2026-10-14` and `--date=2026-10-14` syntax.

## Demo

[Watch the Timesheet automation recording](docs/timesheet-preview.webm)

The recording uses preview mode, so it fills the form without saving a log.

## Preview

```powershell
npm run start -- --date 2026-08-05 --headed
```

Preview prepares the log without saving it. `--headed` displays the browser while the script runs, and the script prints a JSON summary when it finishes.

## Weekdays in a month

```powershell
npm run start -- --month 2026-08
```

This mode processes Monday through Friday and excludes 17 August 2026, Indonesia's Independence Day.

## Date range

```powershell
npm run start -- --from 2026-08-01 --to 2026-08-31
```

`--from` and `--to` are inclusive and must be used together. Weekends and listed national holidays are skipped.

## Submit

The script adds `SaaS Modules - Monitoring (Fleet Management System)` for 8 hours.
It skips the date when that exact log already exists.

```powershell
npm run start -- --date 2026-08-05 --submit --headed
```

Use `--month` with `--submit` to save every weekday in that month.

## Type Check

```powershell
npm run typecheck
```

`npm run start` runs the TypeScript source directly without a build step.

Never store credentials in the repository.
