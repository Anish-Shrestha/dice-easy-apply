import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Job, JobDecision, ApplicationTracker } from '../models/job.model';

@Injectable({
  providedIn: 'root'
})
export class JobService {
  private jobs: Job[] = [];
  private jobNotes: Record<string, string> = {};
  private jobsSubject = new BehaviorSubject<Job[]>([]);
  private currentJobSubject = new BehaviorSubject<Job | null>(null);
  private trackerSubject = new BehaviorSubject<ApplicationTracker>({
    totalProcessed: 0,
    appliedCount: 0,
    skippedCount: 0,
    pendingCount: 0,
    decisions: []
  });

  public jobs$ = this.jobsSubject.asObservable();
  public currentJob$ = this.currentJobSubject.asObservable();
  public tracker$ = this.trackerSubject.asObservable();

  constructor() {
    this.loadJobsFromLocalStorage();
    this.loadTrackerFromLocalStorage();
    this.loadJobNotesFromLocalStorage();
  }

  private loadJobsFromLocalStorage(): void {
    const stored = localStorage.getItem('dice_jobs');
    if (stored) {
      this.jobs = JSON.parse(stored);
      this.jobsSubject.next(this.jobs);
    }
  }

  private loadTrackerFromLocalStorage(): void {
    const stored = localStorage.getItem('dice_tracker');
    if (stored) {
      this.trackerSubject.next(JSON.parse(stored));
    }
  }

  private loadJobNotesFromLocalStorage(): void {
    const stored = localStorage.getItem('dice_job_notes');
    if (stored) {
      this.jobNotes = JSON.parse(stored);
    }
  }

  private saveJobsToLocalStorage(): void {
    localStorage.setItem('dice_jobs', JSON.stringify(this.jobs));
    this.jobsSubject.next(this.jobs);
  }

  private saveTrackerToLocalStorage(): void {
    const tracker = this.trackerSubject.getValue();
    localStorage.setItem('dice_tracker', JSON.stringify(tracker));
  }

  private saveJobNotesToLocalStorage(): void {
    localStorage.setItem('dice_job_notes', JSON.stringify(this.jobNotes));
  }

  setJobNote(link: string, note: string): void {
    const normalizedLink = (link || '').trim();
    if (!normalizedLink) return;

    const trimmedNote = (note || '').trim();
    if (!trimmedNote) {
      delete this.jobNotes[normalizedLink];
    } else {
      this.jobNotes[normalizedLink] = trimmedNote;
    }

    this.saveJobNotesToLocalStorage();
  }

  getJobNote(link: string): string {
    const normalizedLink = (link || '').trim();
    if (!normalizedLink) return '';
    return this.jobNotes[normalizedLink] || '';
  }

  addJobs(newJobs: Job[]): void {
    // Filter duplicates by link
    const existingLinks = new Set(this.jobs.map(j => j.link));
    const filtered = newJobs.filter(j => !existingLinks.has(j.link));
    
    this.jobs = [...this.jobs, ...filtered];
    this.sortJobs();
    this.saveJobsToLocalStorage();
  }

  setJobs(newJobs: Job[]): void {
    this.jobs = [...newJobs];
    this.sortJobs();
    this.currentJobSubject.next(null);
    this.saveJobsToLocalStorage();
  }

  getPendingJobs(): Job[] {
    return this.jobs.filter(j => j.status === 'To Apply' || !j.status);
  }

  getCurrentJob(): Job | null {
    return this.currentJobSubject.getValue();
  }

  setCurrentJob(job: Job): void {
    this.currentJobSubject.next(job);
  }

  nextPendingJob(): Job | null {
    const pending = this.getPendingJobs();
    if (pending.length > 0) {
      const job = pending[0];
      this.setCurrentJob(job);
      return job;
    }
    this.currentJobSubject.next(null);
    return null;
  }

  recordDecision(decision: JobDecision): void {
    // Update job status
    const jobIndex = this.jobs.findIndex(j => j.link === decision.link);
    if (jobIndex >= 0) {
      this.jobs[jobIndex].status = decision.decision;
      this.jobs[jobIndex].dateUpdated = new Date().toISOString();
    }

    // Update tracker
    const tracker = this.trackerSubject.getValue();
    tracker.decisions.push(decision);
    tracker.totalProcessed++;
    
    if (decision.decision === 'Applied') {
      tracker.appliedCount++;
    } else if (decision.decision === 'Skipped') {
      tracker.skippedCount++;
    } else if (decision.decision === 'Pending') {
      tracker.pendingCount++;
    }

    this.trackerSubject.next(tracker);
    this.saveJobsToLocalStorage();
    this.saveTrackerToLocalStorage();
  }

  private sortJobs(): void {
    this.jobs.sort((a, b) => {
      const scoreA = a.score || 0;
      const scoreB = b.score || 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return (a.role || '').localeCompare(b.role || '');
    });
  }

  getJobStats(): { total: number; pending: number; applied: number; skipped: number } {
    return {
      total: this.jobs.length,
      pending: this.getPendingJobs().length,
      applied: this.jobs.filter(j => j.status === 'Applied').length,
      skipped: this.jobs.filter(j => j.status === 'Skipped').length
    };
  }

  clearAllData(): void {
    this.jobs = [];
    this.jobsSubject.next([]);
    this.currentJobSubject.next(null);
    this.trackerSubject.next({
      totalProcessed: 0,
      appliedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      decisions: []
    });
    localStorage.removeItem('dice_jobs');
    localStorage.removeItem('dice_tracker');
    localStorage.removeItem('dice_job_notes');
  }
}
