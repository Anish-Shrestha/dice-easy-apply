# Dice Easy Apply Angular Application

An Angular TypeScript application that replicates the Dice Easy Apply PowerShell workflow with a modern web UI.

## Features

✨ **Core Functionality**
- 🔍 Search and load Dice job postings with Easy Apply filter
- 🎯 Intelligent job scoring and filtering based on resume match
- 🤖 AI-powered cover letter generation using Google Gemini API
- 📄 Template-based cover letter generation as fallback
- 📊 Application tracking (Applied, Skipped, Pending)
- 💾 Local storage persistence for jobs and decisions
- ⚙️ Configurable Gemini API key

## Project Structure

```
src/
├── app/
│   ├── models/
│   │   └── job.model.ts          # Data models (Job, Decision, CoverLetter)
│   ├── services/
│   │   ├── job.service.ts        # Job management and state
│   │   ├── dice-api.service.ts   # Dice API integration
│   │   └── cover-letter.service.ts # AI and template cover letter generation
│   ├── components/
│   │   └── easy-apply-workflow/  # Main workflow component
│   └── app.module.ts             # Angular module configuration
├── main.ts                        # Application entry point
├── index.html                     # HTML template
└── styles.css                     # Global styles
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Angular CLI 17+
- Google Gemini API key (for AI cover letter generation)

### Installation

1. Navigate to the project directory:
```bash
cd dice-easy-apply-angular
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:4200`

### Configuration

1. **Add Gemini API Key:**
   - Click the ⚙️ Settings button in the top-right
   - Enter your Google Gemini API key
   - Click "Save Key"

2. **Load Jobs:**
   - Jobs will load automatically on startup
   - Or click "Load New Jobs" to refresh

## Workflow

### Step 1: Cover Letter Generation
- Choose between AI-generated or template-based cover letters
- Or skip to move directly to review

### Step 2: Review
- Review the job details and generated cover letter
- Job description is fetched automatically from Dice

### Step 3: Make Decision
- **Apply:** Record as applied (cover letter and job description are saved)
- **Skip:** Mark as skipped with optional reason
- **Pending:** Keep for later review

## Services

### JobService
Manages job queue and application tracking with RxJS observables

**Key Methods:**
- `getPendingJobs()` - Get list of unprocessed jobs
- `nextPendingJob()` - Get next job to process
- `recordDecision()` - Record application decision
- `getJobStats()` - Get application statistics

### DiceApiService
Handles Dice API integration and job search

**Key Methods:**
- `searchEasyApplyJobs()` - Search jobs on Dice
- `getJobDescription()` - Fetch full job description

### CoverLetterService
Generates cover letters using AI or templates

**Key Methods:**
- `generateAICoverLetter()` - Generate using Google Gemini
- `generateTemplateCoverLetter()` - Generate template
- `setGeminiApiKey()` - Store API key locally

## Data Persistence

All data is stored in browser localStorage:
- **dice_jobs** - Job list and statuses
- **dice_tracker** - Application decisions and statistics
- **gemini_api_key** - Gemini API key (securely stored)

## Comparison with PowerShell Workflow

| Feature | PowerShell | Angular App |
|---------|-----------|------------|
| Job Search | Dice web scraping | API integration |
| Cover Letter AI | Gemini API | Gemini API |
| UI | Command-line | Modern web UI |
| Data Storage | Files/Excel | Browser localStorage |
| Workflow | Sequential CLI prompts | Interactive web steps |
| Job Deduplication | CSV tracking | In-memory + storage |
| Status Persistence | Immediate CSV writes | localStorage + UI |

## API Integration

### Google Gemini API
The application uses `gemini-2.5-flash` model with fallback support:

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

**Features:**
- Automatic fallback to alternative models if primary fails
- Context-aware prompts based on job description
- Professional tone matching resume profile

## Development

### Build for Production
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### Lint Code
```bash
npm run lint
```

## Future Enhancements

- 🔐 Backend integration for Dice API (avoid CORS issues)
- 📧 Email integration for application confirmations
- 📈 Advanced analytics and reporting
- 🌐 Multi-language support
- 🔔 Push notifications for application updates
- 🔗 LinkedIn profile integration
- 📱 Mobile app version (React Native)

## Known Limitations

- **CORS Restrictions:** Dice API calls require a backend proxy
- **Mock Data:** Default mock jobs for demonstration
- **Local Storage:** 5-10MB limit per browser
- **No Real Dice Integration:** Currently uses mock data

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT

## Author

Created as a TypeScript port of the Dice Easy Apply PowerShell workflow.
