# Setup Instructions - Dice Easy Apply Angular App

## Quick Start (5 minutes)

### 1. Prerequisites
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm 9+** - Comes with Node.js
- **Git** (optional)

### 2. Install Dependencies
```powershell
cd dice-easy-apply-angular
npm install
```

This will install Angular 17, RxJS, and other dependencies (~300MB).

### 3. Get Your Google Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key (keep it secret!)

### 4. Start Development Server
```powershell
npm start
```

Server will be available at: `http://localhost:4200`

### 5. Configure API Key
1. Open the app in browser
2. Click ⚙️ Settings button (top-right)
3. Paste your Gemini API key
4. Click "Save Key"

**That's it!** The app is ready to use.

---

## Project Structure

```
dice-easy-apply-angular/
├── src/
│   ├── app/
│   │   ├── models/
│   │   │   └── job.model.ts              # TypeScript interfaces
│   │   ├── services/
│   │   │   ├── job.service.ts            # Job state management
│   │   │   ├── dice-api.service.ts       # Dice API calls
│   │   │   └── cover-letter.service.ts   # AI/Template generation
│   │   ├── components/
│   │   │   ├── easy-apply-workflow.component.ts
│   │   │   ├── easy-apply-workflow.component.html
│   │   │   └── easy-apply-workflow.component.css
│   │   ├── app.component.ts
│   │   └── app.module.ts
│   ├── environments/                     # Environment configs
│   ├── main.ts                           # Bootstrap
│   ├── index.html                        # HTML template
│   └── styles.css                        # Global styles
├── angular.json                          # Angular CLI config
├── tsconfig.json                         # TypeScript config
├── package.json                          # Dependencies
└── README.md                             # Full documentation
```

---

## Workflow Overview

### 3-Step Process per Job

**Step 1: Cover Letter**
- 🤖 Generate AI-powered (requires Gemini API key)
- 📄 Use template
- ⏭️ Skip

**Step 2: Review**
- Read job description
- Review generated cover letter
- Ready to apply?

**Step 3: Decision**
- ✅ **Apply** - Mark as applied
- ❌ **Skip** - Skip with reason
- ⏸️ **Pending** - Revisit later

All data saved to browser storage automatically.

---

## Development Commands

```powershell
# Development server (with hot reload)
npm start

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

---

## Features & Capabilities

### ✅ Implemented
- [x] Job workflow management (3-step process)
- [x] Job data persistence (localStorage)
- [x] Application tracking (Applied/Skipped/Pending)
- [x] AI cover letter generation (Gemini API)
- [x] Template cover letter fallback
- [x] Job statistics dashboard
- [x] Settings/API key management
- [x] Responsive web UI
- [x] Mock job data for demo
- [x] Decision history

### 📋 TODO / Future Work
- [ ] Real Dice API integration (requires backend proxy)
- [ ] Export decisions to CSV
- [ ] Email reminders for pending jobs
- [ ] Job alerts/notifications
- [ ] LinkedIn integration
- [ ] Advanced filtering & search
- [ ] Multiple profile support
- [ ] Dark mode theme

---

## Backend Setup (Optional but Recommended)

The Angular app currently works standalone but **cannot fetch real Dice jobs directly** due to CORS restrictions. To integrate with Dice, you need a backend proxy.

### Simple Node.js Backend Example

Create a new folder `dice-api-backend`:

```powershell
mkdir dice-api-backend
cd dice-api-backend
npm init -y
npm install express cors node-fetch dotenv
```

Create `server.js`:

```javascript
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(cors());

// Proxy endpoint for Dice
app.get('/api/jobs/search', async (req, res) => {
  try {
    const query = req.query.q || 'firmware embedded engineer';
    const url = `https://www.dice.com/jobs?q=${encodeURIComponent(query)}&isEasyApply=true`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    const html = await response.text();
    // Parse HTML and extract jobs (implement parsing logic)
    
    res.json({ jobs: [] }); // Return parsed jobs
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Backend running on port 3000'));
```

Run with: `node server.js`

Then update `environment.ts`:
```typescript
apiUrl: 'http://localhost:3000/api'
```

---

## Troubleshooting

### 1. "Cannot find module 'angular'"
```powershell
npm install
```

### 2. Port 4200 already in use
```powershell
ng serve --port 4201
```

### 3. API key not working
- Verify key is valid at [Google AI Studio](https://aistudio.google.com/apikey)
- Make sure "Generative Language API" is enabled in Google Cloud
- Check browser console for error details

### 4. Cover letter generation fails
- Check Gemini API key is valid
- Verify your API key has quota remaining
- Try template generation instead

### 5. Jobs won't load
- Currently using mock data
- To use real jobs, implement backend proxy (see above)
- Check browser console for errors

---

## Configuration Files

### `.env` (Create for sensitive data)
```
GOOGLE_API_KEY=your_key_here
```

### `environment.ts` (Development)
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  geminiApiUrl: 'https://generativelanguage.googleapis.com/v1beta'
};
```

### `environment.prod.ts` (Production)
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://your-domain.com/api'
};
```

---

## Browser Storage

The app uses **localStorage** to persist data:

| Key | Purpose | Size |
|-----|---------|------|
| `dice_jobs` | Job list & statuses | ~1MB |
| `dice_tracker` | Application history | ~100KB |
| `gemini_api_key` | API key (local only) | <1KB |

**Total typical usage: 1-5MB** (well within 5-10MB limit)

---

## Performance Tips

1. **Clear old data periodically**
   - Click ⚙️ → "Clear All Data" 
   - Keeps storage optimized

2. **Use template cover letters for speed**
   - AI generation takes 5-10 seconds
   - Template generation is instant

3. **Browser storage limits**
   - ~5-10MB per site/browser
   - 1000+ jobs will exceed limit
   - Archive/export old decisions periodically

---

## Support & Resources

- **Angular Docs**: https://angular.io/docs
- **RxJS Guide**: https://rxjs.dev/
- **Google Gemini API**: https://aistudio.google.com/
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/

---

## Next Steps

1. ✅ Install and run: `npm start`
2. ✅ Get Gemini API key from Google
3. ✅ Configure API key in settings
4. ✅ Load jobs and start applying!
5. 🔄 (Optional) Set up backend for real Dice integration

Happy job hunting! 🚀
