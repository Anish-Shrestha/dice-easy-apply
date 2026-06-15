# Job Search Workflow Guide

This folder is the operating center for the Dice-driven job application process.

It is designed to support this loop:
1. Open Dice + run saved searches.
2. Review jobs and decide Apply/Skip.
3. Optionally generate a tailored cover letter.
4. Track every decision (Applied/Skipped) in the tracker.
5. Continue with manual-apply jobs after Easy Apply jobs.

---

## Folder Structure

```
job_search/
├── README.md
├── config/
│   └── dice_search_state.md
├── leads/
│   └── job_leads.md
├── tracker/
│   ├── job_application_tracker.xlsx
│   └── job_application_tracker_log.csv   (fallback, created only if needed)
├── generated/
│   ├── easy_apply_links.txt
│   ├── manual_apply_links.txt
│   └── dice_jobs_snapshot.md
└── job_descriptions/
    └── *.txt  (saved job description snapshots)
```

### What each folder does

- `config/`
  - Search configuration only.
  - Stores reusable Dice search URLs, filters, and workflow command reference.

- `leads/`
  - Human-curated job list.
  - Holds Easy Apply and Manual Apply sections and status tables.

- `tracker/`
  - Source of truth for application outcomes.
  - Primary file is `job_application_tracker.xlsx`.
  - If Excel COM is unavailable, workflow appends to `job_application_tracker_log.csv`.

- `generated/`
  - Auto-generated outputs from workflow commands.
  - Safe to regenerate anytime.

- `job_descriptions/`
  - Stores `.txt` snapshots of job descriptions used for cover-letter tailoring.

---

## Main Workflow Script

Script location:
- `final/dice_workflow.ps1`

Run from project root (`final/`):

```powershell
Set-Location "C:\Users\ashrestha\OneDrive - Alliant Insurance Services, Inc\Documents\Manish\final"
```

---

## Command Reference

### 1) Start full search session

```powershell
.\dice_workflow.ps1 -Action Start
```

What it does:
- Opens Dice login page.
- Opens all saved search URLs from `config/dice_search_state.md`.
- Uses `resume/resume.pdf` as matching context reminder.
- Exports current Easy Apply links to `generated/easy_apply_links.txt`.

---

### 2) List Easy Apply jobs (auto-generates cover letter)

```powershell
.\dice_workflow.ps1 -Action ListEasyApply
```

What it does:
- Reads Easy Apply jobs from `leads/job_leads.md`.
- Prints each job with role/company/location/link.
- For each Easy Apply job, automatically:
  - auto-fetches job description from the job link,
  - saves JD snapshot as `.txt` in `job_descriptions/`,
  - creates tailored cover letter files in `cover_letters/` (`.pdf` + `.md`),
  - prints Job Link + Job Description file path + Cover Letter PDF path before decision.
- Then asks decision for that same job:
  - `Applied / Skipped / Pending (A/S/P)`
- For Applied/Skipped, tracker is updated immediately before moving to the next job.

With a predefined job description file:

```powershell
.\dice_workflow.ps1 -Action ListEasyApply -JobDescriptionPath "C:\path\job_description.txt"
```

---

### 3) List manual-apply links

```powershell
.\dice_workflow.ps1 -Action ListManualApply
```

What it does:
- Collects non-Dice-Easy-Apply links from `leads/job_leads.md`.
- Saves list to `generated/manual_apply_links.txt`.

---

### 4) Mark a job as Applied or Skipped

Preferred unified command:

```powershell
.\dice_workflow.ps1 -Action UpdateStatus -Status Applied -Company "Magicforce" -Role "Lead Firmware Engineer (Embedded, C++)" -Location "Dallas, TX" -Link "https://www.dice.com/job-detail/b5986610-c022-42f9-b38d-7f19ba4c08d3" -Notes "Submitted via Easy Apply"
```

```powershell
.\dice_workflow.ps1 -Action UpdateStatus -Status Skipped -Company "Magicforce" -Role "Lead Firmware Engineer (Embedded, C++)" -Location "Dallas, TX" -Link "https://www.dice.com/job-detail/b5986610-c022-42f9-b38d-7f19ba4c08d3" -Notes "Skipped - compensation mismatch"
```

Legacy supported command:

```powershell
.\dice_workflow.ps1 -Action MarkApplied -Company "..." -Role "..."
```

What status update does:
- Updates status in `leads/job_leads.md`.
- Updates status in `config/dice_search_state.md` (when matching entries exist).
- Appends event to `tracker/job_application_tracker.xlsx`.
- Also records file references when available:
  - `CoverLetterPdf`
  - `CoverLetterMd`
  - `JobDescriptionFile`
- Falls back to `tracker/job_application_tracker_log.csv` if Excel COM fails.

---

## Cover Letter + Job Description Flow

When cover letter generation is triggered:

1. Job description source:
- By default, script auto-fetches job description from the job link.
- Optional override: if `-JobDescriptionPath` is provided and exists, it is used instead.

2. JD archival:
- JD text is saved to `job_search/job_descriptions/job_description_<company>_<role>_<timestamp>.txt`.

3. Cover letter creation:
- Tailored PDF and Markdown are generated in `cover_letters/`.
- File naming format:
  - `cover_letter_YYYYMMDD_HHMM.pdf`
  - `cover_letter_YYYYMMDD_HHMM.md`
- Tailoring uses:
  - resume profile highlights,
  - detected JD keywords,
  - role/company/location context.

---

## Recommended Daily Usage

```powershell
# 1) Start session
.\dice_workflow.ps1 -Action Start

# 2) Work Easy Apply queue (interactive CL prompts)
.\dice_workflow.ps1 -Action ListEasyApply

# 3) After each job decision, record it
.\dice_workflow.ps1 -Action UpdateStatus -Status Applied -Company "..." -Role "..." -Location "..." -Link "..." -Notes "..."
# or
.\dice_workflow.ps1 -Action UpdateStatus -Status Skipped -Company "..." -Role "..." -Location "..." -Link "..." -Notes "..."

# 4) Then process manual apply links
.\dice_workflow.ps1 -Action ListManualApply
```

---

## File Ownership Rules

- Keep search settings only in: `config/dice_search_state.md`
- Keep job lists only in: `leads/job_leads.md`
- Keep outcome history in: `tracker/job_application_tracker.xlsx`
- Treat `generated/` as disposable outputs
- Keep JD text artifacts in: `job_descriptions/`

---

## Troubleshooting

### Script says required file not found
- Confirm root folder is `final/`.
- Confirm expected files exist in subfolders shown above.

### Tracker update fails
- Excel COM may be unavailable/locked.
- Check fallback log: `tracker/job_application_tracker_log.csv`.

### No Easy Apply jobs listed
- Verify `leads/job_leads.md` has Dice entries with `[Apply](https://www.dice.com/job-detail/...)` links.

### Cover letter not generated
- If prompt skipped or answered `N`, no file is created.
- If JD could not be fetched, script falls back to generic profile highlights.

---

## Notes

- Work authorization filters are already reflected in search/state setup:
  - Exclude clearance-required roles.
  - Exclude US-citizen-only roles.
  - Prefer OPT/F1/GC-pending friendly postings.
- Location preference includes relocation across the US.
