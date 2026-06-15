import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Job } from '../models/job.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DiceApiService {
  private readonly diceSearchTermsStorageKey = 'dice_search_terms';

  constructor(private http: HttpClient) { }

  /**
   * Search for jobs on Dice with Easy Apply filter
   * Note: This would require a backend proxy due to CORS restrictions
   */
  searchEasyApplyJobs(query: string = 'firmware embedded engineer'): Observable<Job[]> {
    const encodedQuery = encodeURIComponent(query);
    return this.http
      .get<{ jobs: Job[] }>(`${environment.apiUrl}/tracker/jobs?query=${encodedQuery}`)
      .pipe(
        map(response => response.jobs || []),
        catchError(() => {
          console.warn('Could not load tracker jobs from backend. Falling back to mock jobs.');
          return of(this.getMockJobs());
        })
      );
  }

  /**
   * Fetch job description from Dice job link
   */
  getJobDescription(job: Job): Observable<{ description: string; role: string }> {
    const encodedLink = encodeURIComponent(job.link || '');
    const encodedCompany = encodeURIComponent(job.company || '');
    const encodedRole = encodeURIComponent(job.role || '');
    return this.http
      .get<{ description: string; role?: string }>(
        `${environment.apiUrl}/tracker/description?link=${encodedLink}&company=${encodedCompany}&role=${encodedRole}`
      )
      .pipe(
        map(response => ({ description: response.description || '', role: response.role || '' })),
        catchError(() => {
          console.warn(`Could not fetch job description for ${job.link}`);
          return of({ description: '', role: '' });
        })
      );
  }

  refreshTrackerFromDice(maxSearchPages?: number, searchTexts?: string[]): Observable<{ refreshed: boolean; newLeads: number; total: number; logTail: string[] }> {
    const payload: { maxSearchPages?: number; searchTexts?: string[] } = {};
    if (Number.isFinite(maxSearchPages as number)) {
      payload.maxSearchPages = maxSearchPages;
    }

    const normalizedSearches = (searchTexts || [])
      .map(text => (text || '').trim())
      .filter(text => !!text);

    if (normalizedSearches.length) {
      payload.searchTexts = Array.from(new Set(normalizedSearches));
    }

    return this.http
      .post<{ refreshed: boolean; newLeads: number; total: number; logTail: string[] }>(
        `${environment.apiUrl}/tracker/refresh`,
        payload
      )
      .pipe(
        catchError(err => {
          console.error('Failed to refresh tracker from Dice:', err);
          throw err;
        })
      );
  }

  getDiceSearchTerms(): string[] {
    const raw = localStorage.getItem(this.diceSearchTermsStorageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const normalized = parsed
        .map(item => String(item || '').trim())
        .filter(item => !!item);

      return normalized.length ? Array.from(new Set(normalized)) : [];
    } catch {
      return [];
    }
  }

  setDiceSearchTerms(searchTerms: string[]): void {
    const normalized = (searchTerms || [])
      .map(item => (item || '').trim())
      .filter(item => !!item);

    const uniqueTerms = Array.from(new Set(normalized));
    localStorage.setItem(this.diceSearchTermsStorageKey, JSON.stringify(uniqueTerms));
  }

  updateJobStatus(link: string, status: string): Observable<boolean> {
    return this.http
      .post<{ updated: boolean }>(`${environment.apiUrl}/tracker/update`, { link, status })
      .pipe(
        map(r => r?.updated || false),
        catchError(err => {
          console.error('Failed to update tracker CSV:', err);
          return of(false);
        })
      );
  }

  updateJobFields(link: string, fields: { jobDescription?: string; coverLetter?: string; role?: string }): Observable<boolean> {
    return this.http
      .post<{ updated: boolean }>(`${environment.apiUrl}/tracker/update-fields`, { link, ...fields })
      .pipe(
        map(r => r?.updated || false),
        catchError(err => {
          console.error('Failed to update job fields:', err);
          return of(false);
        })
      );
  }

  enrichRoleForLink(link: string): Observable<{ updated: boolean; role: string; reason?: string }> {
    return this.http
      .post<{ updated: boolean; role: string; reason?: string }>(
        `${environment.apiUrl}/tracker/enrich-role`,
        { link }
      )
      .pipe(
        catchError(err => {
          console.error('Failed to enrich role from Dice:', err);
          throw err;
        })
      );
  }

  /**
   * Mock jobs data for demonstration
   */
  private getMockJobs(): Job[] {
    return [
      {
        link: 'https://www.dice.com/job-detail/768c95f4-c29d-4dad-8818-cb76e674e20a',
        role: 'Embedded/Firmware Engineer',
        company: 'Motion Recruitment Partners, LLC',
        location: 'San Francisco, California',
        salary: 'USD 160,000.00 - 220,000.00 per year',
        workType: 'Onsite',
        score: 58,
        summary: 'tech match +30; onsite +2; salary strong +14; direct overlap +12',
        status: 'To Apply'
      },
      {
        link: 'https://www.dice.com/job-detail/09f6f65b-086c-46ef-a517-d043d6c9a8be',
        role: 'Embedded/Firmware Engineer',
        company: 'Motion Recruitment Partners, LLC',
        location: 'Irvine, California',
        salary: 'USD 160,000.00 - 220,000.00 per year',
        workType: 'Onsite',
        score: 58,
        summary: 'tech match +30; onsite +2; salary strong +14; direct overlap +12',
        status: 'To Apply'
      },
      {
        link: 'https://www.dice.com/job-detail/984f68aa-7d8b-4b46-b2bf-ec1d9c4ba793',
        role: 'Embedded/Firmware Engineer',
        company: 'Spar Information Systems',
        location: 'Arkansas',
        salary: 'DOE',
        workType: 'Remote',
        score: 60,
        summary: 'tech match +24; seniority +10; remote +14; direct overlap +12',
        status: 'To Apply'
      }
    ];
  }
}
