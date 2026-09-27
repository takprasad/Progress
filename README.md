# Progress — Goal Driven Day Planner

Updated to match the latest Android Progress app behavior while keeping the existing Google Sheets data model.

## Updated web features
- Today dashboard with habits above Today's Focus
- Daily task score and habit score
- Weekly → monthly → yearly goal priority
- Fill free time on any planner date
- Planner previous/next day navigation
- Edit tasks
- Edit goals
- Add incremental progress to goals
- Completed goals are visually marked
- Edit habits and frequency
- Habit streak/history
- Ideas, daily review, history, settings
- Light/dark/system appearance
- Google Sheets sync through the existing Apps Script backend

## Files
- index.html
- styles.css
- app.js
- Code.gs

The existing Apps Script `Code.gs` data model already supports the updated goal and habit operations through `saveGoal` and `saveHabit`, so no spreadsheet migration is required.
