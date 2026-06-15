import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CoverLetter, Job } from '../models/job.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CoverLetterService {
  private geminiApiKey = this.getGeminiApiKey();
  private geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  private resumeContext = `Resume Summary:
- Name: MANISH MAN SHRESTHA
- Title: Firmware & Embedded Systems Engineer | IoT Developer
- Contact: mshrestha789@gmail.com | +1-605-592-4473 | Brookings, SD | Open to Relocation
- Experience: 15 years embedded firmware/IoT, ARM Cortex-M, ESP32, PIC, 8051
- Skills: C/C++, FreeRTOS, RTOS, board bring-up, device drivers, UART/SPI/I2C/RS-485/Modbus
- Security: TLS, AES, ChaCha20-Poly1305, post-quantum crypto (Kyber512, Dilithium2)
- Education: Ph.D. Agricultural & Biosystems Engineering (May 2026, SDSU)
- LinkedIn: https://www.linkedin.com/in/manish-shrestha-14502835/`;

  constructor(private http: HttpClient) { }

  private getGeminiApiKey(): string {
    return environment.geminiApiKey || '';
  }

  saveCoverLetterAsTxt(job: Job, content: string, type: 'AI' | 'Template'): Observable<string> {
    const payload = {
      company: job.company || 'unknown_company',
      role: job.role || 'unknown_role',
      link: job.link || '',
      type,
      content
    };

    return this.http
      .post<{ savedPath: string }>(`${environment.apiUrl}/cover-letter/save`, payload)
      .pipe(
        map(response => response?.savedPath || ''),
        catchError(error => {
          console.error('Error saving cover letter txt:', error);
          return of('');
        })
      );
  }

  setGeminiApiKey(key: string): void {
    this.geminiApiKey = key;
  }

  chatWithGeminiAboutJob(job: Job, jobDescription: string, userMessage: string, history: Array<{ role: 'user' | 'assistant'; text: string }>): Observable<string> {
    if (!this.geminiApiKey) {
      return of('Please add your Gemini API key in Settings first.');
    }

    const historyText = history
      .slice(-8)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n');

    const prompt = `You are a job application assistant helping MANISH MAN SHRESTHA.
Answer only about this current job and resume fit.

Current Job:
- Company: ${job.company || 'N/A'}
- Role: ${job.role || 'N/A'}
- Location: ${job.location || 'N/A'}
- Link: ${job.link || 'N/A'}

Job Description:
${jobDescription || 'Not available'}

${this.resumeContext}

Conversation so far:
${historyText || 'No prior conversation.'}

User question:
${userMessage}

Instructions:
- Keep responses concise and practical.
- Give job-specific guidance with direct references to job/resume overlap.
- Use bullet points when helpful.
- If information is missing, say what is missing and suggest next step.`;

    const body = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.geminiApiUrl}?key=${this.geminiApiKey}`,
      body,
      { headers }
    ).pipe(
      map(response => this.parseAIResponse(response) || 'I could not generate a response for that question.'),
      catchError(error => {
        console.error('Error chatting with Gemini:', error);
        return of('Gemini request failed. Please try again.');
      })
    );
  }

  /**
   * Generate AI-powered cover letter using Google Gemini API
   */
  generateAICoverLetter(job: Job, jobDescription: string): Observable<string> {
    if (!this.geminiApiKey) {
      return of('');
    }

    const todayLong = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const prompt = `You are an expert technical recruiter writing a professional cover letter. Create a compelling, concise cover letter (3-4 paragraphs, ~200 words) for the following position:

Company: ${job.company}
Position: ${job.role}
Location: ${job.location}
Job Link: ${job.link}

Job Description:
${jobDescription}

${this.resumeContext}

Requirements:
1. Start with date: ${todayLong}
2. Use professional but personable tone
3. Highlight specific technical expertise relevant to the job description
4. Mention 2-3 specific keywords/technologies from the job description
5. End with signature line: MANISH MAN SHRESTHA
6. Format as markdown-style plain text with sections separated by blank lines

Generate the cover letter:`;

    const body = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.geminiApiUrl}?key=${this.geminiApiKey}`,
      body,
      { headers }
    ).pipe(
      map(response => {
        const parsed = this.parseAIResponse(response);
        return parsed || this.getTemplateCoverLetter(job);
      }),
      catchError(error => {
        console.error('Error generating AI cover letter:', error);
        return of(this.getTemplateCoverLetter(job));
      })
    );
  }

  /**
   * Generate template-based cover letter
   */
  generateTemplateCoverLetter(job: Job): Observable<string> {
    return of(this.getTemplateCoverLetter(job));
  }

  private getTemplateCoverLetter(job: Job): string {
    const todayLong = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `${todayLong}

Dear Hiring Manager,

I am writing to express my strong interest in the ${job.role} position at ${job.company}, located in ${job.location}. With 15 years of experience in firmware and embedded systems development, including extensive expertise in ARM Cortex-M, ESP32, and real-time operating systems, I am confident in my ability to contribute meaningfully to your team.

Throughout my career, I have demonstrated proficiency in C/C++, device drivers, board bring-up, and communication protocols including UART, SPI, I2C, and Modbus/RS-485. My experience with FreeRTOS and RTOS development, combined with my background in embedded security (TLS, AES, ChaCha20-Poly1305), positions me well for this role. I have led end-to-end firmware work from architecture and implementation through validation and field deployment, ensuring reliability and performance on resource-constrained platforms.

I am particularly drawn to this opportunity because it aligns with my technical strengths and professional goals. I thrive in collaborative environments and am committed to delivering production-ready embedded solutions that meet the highest standards of quality and security.

I would welcome the opportunity to discuss how my experience and skills can contribute to your organization's success. Thank you for considering my application.

Sincerely,
MANISH MAN SHRESTHA
mshrestha789@gmail.com
+1-605-592-4473`;
  }

  /**
   * Parse AI response to extract cover letter text
   */
  parseAIResponse(response: any): string {
    if (response && response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0]?.content?.parts;
      if (Array.isArray(parts) && parts.length > 0) {
        return (parts[0]?.text || '').trim();
      }
    }
    return '';
  }
}
