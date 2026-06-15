# Backend API Server for Dice Easy Apply

Simple Express.js backend to proxy Dice API requests and avoid CORS restrictions.

## Quick Setup

```powershell
# 1. Create backend folder
mkdir dice-api-backend
cd dice-api-backend

# 2. Initialize Node project
npm init -y

# 3. Install dependencies
npm install express cors node-fetch dotenv

# 4. Copy this server.js and .env files

# 5. Run server
node server.js
```

Server will run on `http://localhost:3000`

## Files

### `server.js`
```javascript
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Proxy Dice job search
app.get('/api/jobs/search', async (req, res) => {
  try {
    const { query = 'firmware embedded engineer', limit = 20 } = req.query;
    
    // This is a placeholder - actual Dice scraping would go here
    // For now, return mock data
    const mockJobs = [
      {
        link: 'https://www.dice.com/job-detail/768c95f4-c29d-4dad-8818-cb76e674e20a',
        role: 'Embedded/Firmware Engineer',
        company: 'Motion Recruitment Partners, LLC',
        location: 'San Francisco, California',
        salary: 'USD 160,000.00 - 220,000.00 per year',
        workType: 'Onsite',
        score: 58
      }
    ];
    
    res.json({ jobs: mockJobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate cover letter via Gemini
app.post('/api/cover-letter', async (req, res) => {
  try {
    const { job, jobDescription } = req.body;
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key not configured' });
    }
    
    // Call Gemini API
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a professional cover letter for ${job.role} at ${job.company}`
            }]
          }]
        })
      }
    );
    
    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

### `.env`
```
PORT=3000
GOOGLE_GEMINI_API_KEY=your_key_here
```

### `package.json` (after npm init)
```json
{
  "name": "dice-api-backend",
  "version": "1.0.0",
  "description": "Backend proxy for Dice Easy Apply",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "npm install -g nodemon && nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "node-fetch": "^2.7.0",
    "dotenv": "^16.0.0"
  }
}
```

## Integration with Angular

Update `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  geminiApiUrl: 'https://generativelanguage.googleapis.com/v1beta',
  diceBaseUrl: 'https://www.dice.com'
};
```

Update `dice-api.service.ts` to use the backend:

```typescript
searchEasyApplyJobs(query: string = 'firmware embedded engineer'): Observable<Job[]> {
  return this.http.get<any>(`${environment.apiUrl}/jobs/search?query=${query}`)
    .pipe(
      map(response => response.jobs),
      catchError(() => of([]))
    );
}
```

## Running Both Services

### Terminal 1: Angular Frontend
```powershell
cd dice-easy-apply-angular
npm start
# Opens http://localhost:4200
```

### Terminal 2: Express Backend
```powershell
cd dice-api-backend
node server.js
# Running on http://localhost:3000
```

Both services now communicate!

## Notes

- Backend handles CORS so Angular can make cross-origin requests
- API key stored securely on backend (not exposed to frontend)
- Can scale with additional routes for job search, descriptions, etc.
- Mock data currently returned - implement real Dice scraping as needed
