# Progress — Goal Driven Day Planner

Progress is a static personal day planner designed for people who are easily overwhelmed by planning. It uses Google Sheets as storage through a Google Apps Script web app.

## Features

- Quick Capture inbox
- Daily tasks with priority, timing and scoring
- Top 3 daily priorities
- Weekly, monthly and yearly measurable goals
- Planning-time budget for goals so auto-scheduling does not fake count-based progress
- Automatic goal-based time filling: **weekly → monthly → yearly**
- Goal progress and pace tracking
- Habit tracker with streaks and weekly history
- Ideas / creativity vault
- Daily review
- Calendar history
- Daily task score + habit score + overall score
- Local storage fallback when Sheets is not connected
- GitHub Pages compatible

## Architecture

GitHub Pages frontend → Google Apps Script web app → Google Sheets

## 1. Create the Google Sheet

Create a new Google Sheet.

Open **Extensions → Apps Script** and replace the default code with `Code.gs` from this project.

Run the `setup()` function once. Approve the requested spreadsheet permissions.

## 2. Deploy Apps Script

In Apps Script:

1. Click **Deploy → New deployment**.
2. Select **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone** (or the access level appropriate to your account).
5. Deploy and copy the Web App URL.

Keep the URL private enough for your personal use. This MVP does not include user authentication, so anyone who can call the web app URL may potentially interact with the spreadsheet according to your deployment permissions.

## 3. Configure the web app

Open the Progress site → **Settings** → paste the Apps Script Web App URL → Save.

The app can be used without a URL first; in that mode it uses browser localStorage.

## 4. Deploy frontend on GitHub Pages

Create a GitHub repository and upload:

- `index.html`
- `styles.css`
- `app.js`

Enable **Settings → Pages → Deploy from branch** and choose the branch/folder containing the files.

## Goal setup examples

### Weekly

- Title: Finish ML course
- Target: `20`
- Unit: `hours`
- Mode: `Time-based`

### Monthly

- Title: Complete ML project
- Target: `1`
- Unit: `project`
- Mode: `Count-based`

### Yearly

- Title: Read books
- Target: `12`
- Unit: `books`
- Mode: `Manual`

## How auto-planning works

When you click **Fill free time**, Progress checks unused hourly slots in your day while preserving the configured buffer. It prioritizes active goals in this order:

1. Weekly
2. Monthly
3. Yearly

The planner creates goal tasks such as `Work on Finish ML course`. Goal tasks receive higher weighted task points than ordinary low-priority tasks. For count/manual goals such as books or projects, enter a planning-time budget so the app can schedule reading/building time without automatically pretending that a book/project is complete.

For example, a yearly goal of `Complete a book` could have target `1 book` and planning time `3600 minutes`. The scheduler uses that time budget, while the goal progress remains manually controlled.

## Scoring

Daily task score is:

`earned weighted task points / planned weighted task points × 100`

Task weighting is based on priority and whether the task is tied to a goal. Goal progress is reported separately so a high daily score cannot hide slow long-term goal progress.

## Notes

The MVP intentionally avoids authentication, push notifications, AI, shared accounts and complex recurring-task rules. These can be added later without changing the basic Sheet structure.


## UI updates

- Light, dark, and system appearance modes
- Habits visible directly on the Today dashboard
- Mobile-first Android layout with bottom navigation and touch-friendly controls
- Responsive cards, task rows, forms, and bottom-sheet modals
- Safe-area support for modern phones
