import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run start -- [options]

Options:
  --date YYYY-MM-DD        Process one date (default: today)
  --month YYYY-MM          Process every weekday in a month
  --from YYYY-MM-DD        Start date; requires --to
  --to YYYY-MM-DD          End date; requires --from
  --submit                 Save prepared logs
  --headed                 Display the browser while running
  --record                 Save a WebM recording to artifacts/
  --help, -h               Show this help message`);
  process.exit(0);
}
const valueFor = (name: string): string | undefined => {
  const index = args.findIndex(
    (argument) => argument === name || argument.startsWith(`${name}=`),
  );
  if (index === -1) return undefined;

  const argument = args[index];
  return argument === name ? args[index + 1] : argument.slice(name.length + 1);
};
const singleDate = valueFor("--date") ?? new Date().toISOString().slice(0, 10);
const month = valueFor("--month");
const from = valueFor("--from");
const to = valueFor("--to");
const submit = args.includes("--submit");
const headed = args.includes("--headed");
const record = args.includes("--record");
const email = process.env.TIMESHEET_EMAIL;
const password = process.env.TIMESHEET_PASSWORD;
const timesheetUrl = process.env.TIMESHEET_URL ?? "";
const feature = process.env.FEATURE ?? "";
const hours = 8;

const publicHolidays = (process.env.PUBLIC_HOLIDAY ?? "")
  .split(",")
  .map((date) => date.trim())
  .filter(Boolean);

const nationalHolidays = new Set(publicHolidays);

function getDates(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("Dates must use YYYY-MM-DD format.");
  }

  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (
    start.toISOString().slice(0, 10) !== from ||
    end.toISOString().slice(0, 10) !== to ||
    start > end
  ) {
    throw new Error("--from must not be after --to.");
  }

  const dates: string[] = [];
  for (let date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function getMonthDates(month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month))
    throw new Error("--month must use YYYY-MM format.");

  const [year, monthNumber] = month.split("-").map(Number);
  return getDates(
    `${month}-01`,
    `${month}-${new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()}`,
  );
}

if (!email || !password) {
  throw new Error(
    "Set TIMESHEET_EMAIL and TIMESHEET_PASSWORD before running this script.",
  );
}

if ((from && !to) || (!from && to) || (month && (from || to))) {
  throw new Error("Use --from and --to together, or use --month.");
}

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext(
  record ? { recordVideo: { dir: "artifacts" } } : undefined,
);
const page = await context.newPage();
const video = page.video();
const requestedDates =
  from && to
    ? getDates(from, to)
    : month
      ? getMonthDates(month)
      : getDates(singleDate, singleDate);
const skippedWeekend = requestedDates.filter((date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
});
const weekdays = requestedDates.filter(
  (date) => !skippedWeekend.includes(date),
);
const skippedHoliday = weekdays.filter((date) => nationalHolidays.has(date));
const dates = weekdays.filter((date) => !nationalHolidays.has(date));
const results = {
  created: [] as string[],
  existing: [] as string[],
  preview: [] as string[],
  skippedWeekend,
  skippedHoliday,
};

try {
  await page.goto(timesheetUrl, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.locator('button:has-text("Login")').click(),
  ]);

  if (await page.locator('input[name="email"]').count()) {
    throw new Error("Login failed. Verify the credentials or account access.");
  }

  for (const date of dates) {
    const targetUrl = new URL(timesheetUrl);
    targetUrl.searchParams.set("date", date);
    await page.goto(targetUrl.toString(), { waitUntil: "networkidle" });

    const featureSelects = page.locator('select[name="master_id[]"]');
    const hoursInputs = page.locator('input[name="log_hour[]"]');
    const hasLog = await featureSelects.evaluateAll(
      (selects, expectedHours) =>
        selects.some((select) => {
          const hoursInput = select
            .closest("tr")
            ?.querySelector('input[name="log_hour[]"]');
          return (
            select instanceof HTMLSelectElement &&
            select.value === "15" &&
            hoursInput instanceof HTMLInputElement &&
            hoursInput.value === expectedHours
          );
        }),
      String(hours),
    );

    if (hasLog) {
      results.existing.push(date);
    } else {
      await page.getByRole("button", { name: "+ Add Log" }).click();
      const featureSelect = featureSelects.last();
      const hoursInput = hoursInputs.last();
      await featureSelect.selectOption({ label: feature });
      await hoursInput.fill(String(hours));

      if (
        (await featureSelect.inputValue()) !== "15" ||
        (await hoursInput.inputValue()) !== String(hours)
      ) {
        throw new Error(`Could not prepare the Monitoring log for ${date}.`);
      }

      if (submit) {
        const saved = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === new URL(timesheetUrl).pathname,
        );
        await page.locator("#saveBtn").click();
        const response = await saved;
        if (response.status() >= 400)
          throw new Error(`Timesheet save failed for ${date}.`);

        await page.goto(targetUrl.toString(), { waitUntil: "networkidle" });
        const savedLog = await featureSelects.evaluateAll(
          (selects, expectedHours) =>
            selects.some((select) => {
              const hoursInput = select
                .closest("tr")
                ?.querySelector('input[name="log_hour[]"]');
              return (
                select instanceof HTMLSelectElement &&
                select.value === "15" &&
                hoursInput instanceof HTMLInputElement &&
                hoursInput.value === expectedHours
              );
            }),
          String(hours),
        );
        if (!savedLog)
          throw new Error(`Timesheet save could not be verified for ${date}.`);

        results.created.push(date);
      } else {
        results.preview.push(date);
      }
    }
  }

  console.log(JSON.stringify(results));
} finally {
  await context.close();
  if (video) console.error(`Video saved to ${await video.path()}`);
  await browser.close();
}
