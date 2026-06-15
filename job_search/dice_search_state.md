# Dice Job Search State — Manish Man Shrestha
**Last search:** 2026-06-12 | **Total results:** 40 | **Eligible after filtering:** 8
**Location preference:** Open to relocation (US-wide) | **Employment types:** Full-time, Contract, Contract-to-Hire

## Workflow Commands
- Start full workflow (login + all saved Dice searches + export easy links):
	`.\dice_workflow.ps1 -Action Start`
- List current Easy Apply links:
	`.\dice_workflow.ps1 -Action ListEasyApply`
- During `ListEasyApply`, workflow asks per job: `Need cover letter for this job? (Y/N)`.
- If Yes, it creates a tailored draft in `cover_letters`.
- Job description text files are saved in `job_search/job_descriptions`.
- Mark one job as applied and update tracker:
	`.\dice_workflow.ps1 -Action MarkApplied -Company "Magicforce" -Role "Lead Firmware Engineer (Embedded, C++)" -Location "Dallas, TX" -Link "https://www.dice.com/job-detail/b5986610-c022-42f9-b38d-7f19ba4c08d3" -Notes "Submitted via Easy Apply"`
- Applied flow also prompts: "Create tailored cover letter now?" and saves draft in `cover_letters`.
- You can pass a job description file to auto-tailor the letter:
	`.\dice_workflow.ps1 -Action UpdateStatus -Status Applied -Company "Magicforce" -Role "Lead Firmware Engineer (Embedded, C++)" -Location "Dallas, TX" -Link "https://www.dice.com/job-detail/b5986610-c022-42f9-b38d-7f19ba4c08d3" -JobDescriptionPath "C:\path\job_description.txt"`
- To skip the prompt for a run:
	`.\dice_workflow.ps1 -Action UpdateStatus -Status Applied -Company "..." -Role "..." -NoCoverLetterPrompt`
- Mark one job as skipped and update tracker:
	`.\dice_workflow.ps1 -Action UpdateStatus -Status Skipped -Company "Magicforce" -Role "Lead Firmware Engineer (Embedded, C++)" -Location "Dallas, TX" -Link "https://www.dice.com/job-detail/b5986610-c022-42f9-b38d-7f19ba4c08d3" -Notes "Skipped - compensation mismatch"`
- List jobs that need manual apply (outside Dice Easy Apply):
	`.\dice_workflow.ps1 -Action ListManualApply`

---

## 🔗 Reusable Dice Search URLs

### Full-time
| Search Type | URL |
|-------------|-----|
| Firmware + Embedded Engineer | https://www.dice.com/jobs?q=firmware+embedded+engineer&filters.easyApply=true&filters.employmentType=FULLTIME |
| Firmware Engineer | https://www.dice.com/jobs?q=firmware+engineer&filters.easyApply=true&filters.employmentType=FULLTIME |
| IoT Developer | https://www.dice.com/jobs?q=IoT+developer&filters.easyApply=true&filters.employmentType=FULLTIME |
| IoT Embedded Engineer | https://www.dice.com/jobs?q=embedded+IoT+engineer&filters.easyApply=true&filters.employmentType=FULLTIME |
| Embedded Systems Engineer | https://www.dice.com/jobs?q=embedded+systems+engineer&filters.easyApply=true&filters.employmentType=FULLTIME |
| Embedded Systems C RTOS | https://www.dice.com/jobs?q=embedded+systems+engineer+RTOS+C&filters.easyApply=true&filters.employmentType=FULLTIME |

### Contract / Contract-to-Hire
| Search Type | URL |
|-------------|-----|
| Firmware + Embedded Engineer (Contract) | https://www.dice.com/jobs?q=firmware+embedded+engineer&filters.easyApply=true&filters.employmentType=CONTRACT |
| Firmware Engineer (Contract) | https://www.dice.com/jobs?q=firmware+engineer&filters.easyApply=true&filters.employmentType=CONTRACT |
| IoT Developer (Contract) | https://www.dice.com/jobs?q=IoT+developer&filters.easyApply=true&filters.employmentType=CONTRACT |
| IoT Embedded Engineer (Contract) | https://www.dice.com/jobs?q=embedded+IoT+engineer&filters.easyApply=true&filters.employmentType=CONTRACT |
| Embedded Systems Engineer (Contract) | https://www.dice.com/jobs?q=embedded+systems+engineer&filters.easyApply=true&filters.employmentType=CONTRACT |
| Embedded Systems C RTOS (Contract) | https://www.dice.com/jobs?q=embedded+systems+engineer+RTOS+C&filters.easyApply=true&filters.employmentType=CONTRACT |
| Firmware Engineer (Third Party / C2H) | https://www.dice.com/jobs?q=firmware+engineer&filters.easyApply=true&filters.employmentType=THIRD_PARTY |
| Embedded Systems Engineer (Third Party / C2H) | https://www.dice.com/jobs?q=embedded+systems+engineer&filters.easyApply=true&filters.employmentType=THIRD_PARTY |
| IoT Developer (Third Party / C2H) | https://www.dice.com/jobs?q=IoT+developer&filters.easyApply=true&filters.employmentType=THIRD_PARTY |

---

## 🚫 Filters Applied (Always Exclude)
- ❌ Security clearance required (Secret / TS / TS-SCI)
- ❌ "US Citizens only" or explicitly no visa sponsorship
- ✅ Keep: Easy Apply + Full-time, Contract, Contract-to-Hire, Third Party
- ✅ Prefer: Willing to sponsor / OPT/F1/GC-pending friendly
- ✅ Location: Open to relocation anywhere in the US (currently Brookings, SD)

## 📋 Next Session Checklist
- [ ] Re-run ALL search URLs above (full-time + contract + third party) to find new postings
- [ ] Move relevant results into `job_search/job_leads.md` only
- [ ] List Easy Apply links via `.\dice_workflow.ps1 -Action ListEasyApply`
- [ ] Update statuses in `job_search/job_leads.md` and `job_search/job_application_tracker.xlsx` using `.\dice_workflow.ps1 -Action UpdateStatus`
- [ ] Check for responses / messages on Dice dashboard: https://www.dice.com/message-center

> 💡 **Contract tip:** On OPT/F1 — W2 contracts are fine; Corp-to-Corp (C2C) requires your own LLC/S-Corp. Stick to W2 or direct contract roles.
