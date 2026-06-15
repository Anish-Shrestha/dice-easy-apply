import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { JobService } from '../services/job.service';
import { DiceApiService } from '../services/dice-api.service';
import { CoverLetterService } from '../services/cover-letter.service';
import { Job, JobDecision } from '../models/job.model';

@Component({
  selector: 'app-easy-apply-workflow',
  templateUrl: './easy-apply-workflow.component.html',
  styleUrls: ['./easy-apply-workflow.component.css']
})
export class EasyApplyWorkflowComponent implements OnInit, OnDestroy {
  currentJob: Job | null = null;
  jobs: Job[] = [];
  jobStats = { total: 0, pending: 0, applied: 0, skipped: 0 };
  isLoading = false;
  coverLetterMode: 'AI' | 'Template' | null = null;
  generatedCoverLetter = '';
  savedCoverLetterPath = '';
  jobDescription = '';
  showReview = false;
  currentStep: 'cover-letter' | 'review' | 'decision' = 'cover-letter';
  jobNoteInput = '';
  decisionNotes = '';
  skipReason = '';
  showSettings = false;
  showDescriptionModal = false;
  showSkipReasonModal = false;
  showJobListModal = false;
  showRefreshStatusModal = false;
  refreshTrackerPhase: 'idle' | 'running' | 'success' | 'error' = 'idle';
  refreshTrackerResult: { refreshed: boolean; newLeads: number; total: number } | null = null;
  refreshTrackerError = '';
  refreshTrackerLog: string[] = [];
  refreshTrackerExecutionPills: string[] = [];
  refreshTrackerCurrentPill = '';
  refreshTrackerCurrentPillIndex = -1;
  jobListSearch = '';
  jobListStatusFilter: 'all' | 'pending' | 'applied' | 'skipped' = 'all';
  diceSearchTerms: string[] = [];
  diceSearchTermInput = '';
  isSavingDecision = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  showToast = false;
  chatMessages: Array<{ role: 'assistant' | 'user'; text: string; timestamp: string }> = [];
  chatInput = '';
  isChatLoading = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPillTimer: ReturnType<typeof setInterval> | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private jobService: JobService,
    private diceApi: DiceApiService,
    private coverLetterService: CoverLetterService
  ) { }

  ngOnInit(): void {
    this.subscribeToJobUpdates();
    this.loadDiceSearchText();

    // If a job was pre-selected (e.g. from grid row click), use it directly
    const preSelected = this.jobService.getCurrentJob();
    if (preSelected) {
      this.resetWorkflow();
      this.currentJob = preSelected;
      this.loadNoteForCurrentJob(preSelected);
      this.fetchJobDescription(preSelected);
      this.initializeChat();
      this.updateStats();
    } else {
      this.loadJobs();
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.stopRefreshPillProgress();
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showRefreshStatusModal) {
      this.closeRefreshStatusModal();
      return;
    }
    if (this.showJobListModal) {
      this.closeJobListModal();
      return;
    }
    if (this.showSkipReasonModal) {
      this.closeSkipReasonModal();
      return;
    }
    if (this.showDescriptionModal) {
      this.closeDescriptionModal();
    }
  }

  loadJobs(): void {
    this.isLoading = true;
    this.diceApi.searchEasyApplyJobs()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (jobs) => {
          this.jobService.setJobs(jobs);
          this.nextJob();
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading jobs:', err);
          this.nextJob();
          this.isLoading = false;
        }
      });
  }

  refreshTracker(): void {
    this.startRefreshPillProgress();
    this.showRefreshStatusModal = true;
    this.refreshTrackerPhase = 'running';
    this.refreshTrackerResult = null;
    this.refreshTrackerError = '';
    this.refreshTrackerLog = [
      'Scraping Easy Apply jobs from Dice...',
      'Checking tracker for existing links...'
    ];

    this.isLoading = true;
    this.diceApi.refreshTrackerFromDice(undefined, this.diceSearchTerms)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.stopRefreshPillProgress();
          const newLeads = Number.isFinite(result?.newLeads) ? result.newLeads : 0;
          const total = Number.isFinite(result?.total) ? result.total : this.jobStats.total;
          const refreshed = Boolean(result?.refreshed);

          this.refreshTrackerResult = {
            refreshed,
            newLeads,
            total
          };
          this.refreshTrackerPhase = 'success';
          this.refreshTrackerLog = result?.logTail?.length ? result.logTail : this.refreshTrackerLog;

          this.showDecisionToast(
            newLeads > 0
              ? `Tracker refreshed from Dice. Added ${newLeads} new job(s).`
              : 'Tracker refreshed from Dice. No new jobs found.',
            'success'
          );
          this.loadJobs();
        },
        error: (err) => {
          console.error('Error refreshing tracker:', err);
          this.stopRefreshPillProgress();
          this.refreshTrackerPhase = 'error';
          this.refreshTrackerError = err?.error?.error || err?.message || 'Unable to refresh tracker from Dice.';
          this.showDecisionToast('Tracker refresh failed. Reloaded existing tracker jobs.', 'error');
          this.loadJobs();
        }
      });
  }

  closeRefreshStatusModal(): void {
    this.showRefreshStatusModal = false;
  }

  private startRefreshPillProgress(): void {
    this.stopRefreshPillProgress();

    const pills = (this.diceSearchTerms || []).map(item => (item || '').trim()).filter(Boolean);
    this.refreshTrackerExecutionPills = pills.length
      ? pills
      : ['Using saved Dice search URLs from config'];

    this.refreshTrackerCurrentPillIndex = 0;
    this.refreshTrackerCurrentPill = this.refreshTrackerExecutionPills[0] || '';

    if (this.refreshTrackerExecutionPills.length <= 1) {
      return;
    }

    this.refreshPillTimer = setInterval(() => {
      this.refreshTrackerCurrentPillIndex = (this.refreshTrackerCurrentPillIndex + 1) % this.refreshTrackerExecutionPills.length;
      this.refreshTrackerCurrentPill = this.refreshTrackerExecutionPills[this.refreshTrackerCurrentPillIndex] || '';
    }, 2200);
  }

  private stopRefreshPillProgress(): void {
    if (this.refreshPillTimer) {
      clearInterval(this.refreshPillTimer);
      this.refreshPillTimer = null;
    }
  }

  private subscribeToJobUpdates(): void {
    this.jobService.jobs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(jobs => {
        this.jobs = jobs;
        this.updateStats();
      });
  }

  private updateStats(): void {
    this.jobStats = this.jobService.getJobStats();
  }

  private loadDiceSearchText(): void {
    this.diceSearchTerms = this.diceApi.getDiceSearchTerms();
  }

  addDiceSearchTerm(): void {
    const value = (this.diceSearchTermInput || '').trim();
    if (!value) {
      return;
    }

    const existing = new Set(this.diceSearchTerms.map(item => item.toLowerCase()));
    if (!existing.has(value.toLowerCase())) {
      this.diceSearchTerms = [...this.diceSearchTerms, value];
    }

    this.diceSearchTermInput = '';
  }

  removeDiceSearchTerm(term: string): void {
    this.diceSearchTerms = this.diceSearchTerms.filter(item => item !== term);
  }

  onDiceSearchTermKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addDiceSearchTerm();
    }
  }

  nextJob(): void {
    this.resetWorkflow();
    this.currentJob = null;
    const job = this.jobService.nextPendingJob();
    if (job) {
      this.currentJob = job;
      this.loadNoteForCurrentJob(job);
      this.fetchJobDescription(job);
      this.initializeChat();
    }
  }

  private resetWorkflow(): void {
    this.coverLetterMode = null;
    this.generatedCoverLetter = '';
    this.savedCoverLetterPath = '';
    this.jobDescription = '';
    this.showReview = false;
    this.currentStep = 'cover-letter';
    this.jobNoteInput = '';
    this.decisionNotes = '';
    this.skipReason = '';
    this.isSavingDecision = false;
    this.showDescriptionModal = false;
    this.showSkipReasonModal = false;
    this.chatMessages = [];
    this.chatInput = '';
    this.isChatLoading = false;
  }

  saveOptionalNote(): void {
    this.decisionNotes = (this.jobNoteInput || '').trim();
    if (this.currentJob?.link) {
      this.jobService.setJobNote(this.currentJob.link, this.decisionNotes);
    }
    this.showDecisionToast(this.decisionNotes ? 'Optional note saved.' : 'Optional note cleared.', 'success');
  }

  autoResizeNote(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const maxHeight = 220;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  getCoverLetterDisplayName(pathValue: string): string {
    const raw = (pathValue || '').trim();
    if (!raw) return '';

    const fileName = raw.split('/').pop()?.split('\\').pop() || raw;
    return fileName.replace(/\.[^.]+$/, '');
  }

  private loadNoteForCurrentJob(job: Job): void {
    const note = this.jobService.getJobNote(job.link || '');
    this.decisionNotes = note;
    this.jobNoteInput = note;
  }

  private initializeChat(): void {
    this.chatMessages = [
      {
        role: 'assistant',
        text: 'Ask me anything about this job. I will use the job description and your resume context.',
        timestamp: new Date().toISOString()
      }
    ];
  }

  openDescriptionModal(): void {
    this.showDescriptionModal = true;
  }

  onEasyApplyClick(): void {
    const job = this.currentJob;
    if (!job?.link) {
      this.showDecisionToast('Job link is not available for this item.', 'error');
      return;
    }

    this.diceApi.enrichRoleForLink(job.link)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const enrichedRole = (result?.role || '').trim();
          if (!enrichedRole) {
            this.showDecisionToast('Could not fetch title from Dice for this job yet.', 'error');
            return;
          }

          if (this.currentJob?.link === job.link) {
            this.currentJob.role = enrichedRole;
          }

          this.jobs = this.jobs.map(item => item.link === job.link ? { ...item, role: enrichedRole } : item);
          if (result?.updated) {
            this.showDecisionToast(`Role updated from Dice: ${enrichedRole}`, 'success');
          } else {
            this.showDecisionToast(`Current title: ${enrichedRole}`, 'success');
          }
        },
        error: () => {
          this.showDecisionToast('Could not update title from Dice right now.', 'error');
        }
      });
  }

  closeDescriptionModal(): void {
    this.showDescriptionModal = false;
  }

  openJobListModal(filter: 'all' | 'pending' | 'applied' | 'skipped' = 'all'): void {
    this.jobListSearch = '';
    this.jobListStatusFilter = filter;
    this.showJobListModal = true;
  }

  closeJobListModal(): void {
    this.showJobListModal = false;
  }

  get visibleJobsForModal(): Job[] {
    const keyword = (this.jobListSearch || '').trim().toLowerCase();

    return this.jobs.filter(job => {
      const status = this.getJobStatusLabel(job);
      const matchesStatus = this.jobListStatusFilter === 'all'
        || (this.jobListStatusFilter === 'applied' && status === 'Applied')
        || (this.jobListStatusFilter === 'skipped' && status === 'Skipped')
        || (this.jobListStatusFilter === 'pending' && (status === 'To Apply' || status === 'Pending'));

      if (!matchesStatus) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const role = (job.role || '').toLowerCase();
      const company = (job.company || '').toLowerCase();
      const location = (job.location || '').toLowerCase();
      return role.includes(keyword) || company.includes(keyword) || location.includes(keyword);
    });
  }

  getJobStatusLabel(job: Job): string {
    const status = (job.status || 'To Apply').trim();
    return status || 'To Apply';
  }

  get jobListFilterTitle(): string {
    if (this.jobListStatusFilter === 'applied') return 'Applied';
    if (this.jobListStatusFilter === 'skipped') return 'Skipped';
    if (this.jobListStatusFilter === 'pending') return 'Pending';
    return 'All Jobs';
  }

  selectJobFromModal(job: Job): void {
    if (!job) return;

    this.closeJobListModal();
    this.resetWorkflow();
    this.currentJob = job;
    this.jobService.setCurrentJob(job);
    this.loadNoteForCurrentJob(job);
    this.fetchJobDescription(job);
    this.initializeChat();
    this.showDecisionToast('Selected job loaded.', 'success');
  }

  onStatsKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openJobListModal('all');
    }
  }

  onStatItemKeyDown(event: KeyboardEvent, filter: 'all' | 'pending' | 'applied' | 'skipped'): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openJobListModal(filter);
    }
  }

  openSkipReasonModal(prefillReason?: string): void {
    if (!this.currentJob || this.isSavingDecision) return;
    this.skipReason = prefillReason || '';
    this.showSkipReasonModal = true;
  }

  closeSkipReasonModal(): void {
    this.showSkipReasonModal = false;
  }

  confirmSkipDecision(): void {
    if (!this.currentJob) return;
    if (!this.skipReason) {
      this.showDecisionToast('Select a skip reason before saving.', 'error');
      return;
    }
    this.showSkipReasonModal = false;
    this.finalizeDecision('Skipped', this.savedCoverLetterPath || undefined);
  }

  askResumeMatch(): void {
    const prompt = 'Does this job description match my resume? Give a match score (0-100), top overlaps, gaps, and clear recommendation.';
    this.ensureJobDescriptionThen(() => this.sendMessageToGemini(prompt));
  }

  private detectAutoSkipReason(description: string): 'clearance' | 'citizenship' | null {
    const text = (description || '').toLowerCase();
    if (!text) return null;

    const hasClearance = /(security clearance|active clearance|secret clearance|top secret|ts\/sci|public trust)/i.test(text);
    if (hasClearance) return 'clearance';

    const hasCitizenship = /(us citizenship|required to be (a )?u\.?s\.? citizen|must be a u\.?s\.? citizen|citizenship required|u\.?s\.? persons? only|us citizens only)/i.test(text);
    if (hasCitizenship) return 'citizenship';

    return null;
  }

  private maybePromptAutoSkip(description: string): void {
    if (!this.currentJob || this.showSkipReasonModal || this.isSavingDecision) return;

    const reason = this.detectAutoSkipReason(description);
    if (!reason) return;

    this.openSkipReasonModal(reason);
    const reasonText = reason === 'clearance' ? 'Security clearance required' : 'US citizenship required';
    this.showDecisionToast(`${reasonText} detected. Confirm Skipped in modal.`, 'error');
  }

  private sendMessageToGemini(message: string): void {
    if (!this.currentJob || this.isChatLoading) return;
    const trimmed = (message || '').trim();
    if (!trimmed) return;

    this.chatMessages.push({
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString()
    });
    this.chatInput = '';
    this.isChatLoading = true;

    const historyForPrompt = this.chatMessages.map(m => ({ role: m.role, text: m.text }));

    this.coverLetterService.chatWithGeminiAboutJob(this.currentJob, this.jobDescription, trimmed, historyForPrompt)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (reply) => {
          this.chatMessages.push({
            role: 'assistant',
            text: reply || 'No response from Gemini.',
            timestamp: new Date().toISOString()
          });
          this.isChatLoading = false;
        },
        error: () => {
          this.chatMessages.push({
            role: 'assistant',
            text: 'Unable to get response from Gemini right now.',
            timestamp: new Date().toISOString()
          });
          this.isChatLoading = false;
        }
      });
  }

  sendChatMessage(): void {
    this.sendMessageToGemini(this.chatInput);
  }

  onChatEnter(event: KeyboardEvent): void {
    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.sendChatMessage();
  }

  private fetchJobDescription(job: Job): void {
    this.isLoading = true;
    this.diceApi.getJobDescription(job)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.jobDescription = result.description || 'Job description not available';
          if (result.role && this.currentJob && !this.currentJob.role) {
            this.currentJob = { ...this.currentJob, role: result.role };
          }
          this.maybePromptAutoSkip(this.jobDescription);
          this.isLoading = false;
        },
        error: () => {
          this.jobDescription = 'Could not fetch job description';
          this.isLoading = false;
        }
      });
  }

  private ensureJobDescriptionThen(callback: () => void): void {
    if (!this.currentJob) return;

    const hasDescription = this.jobDescription
      && this.jobDescription !== 'Job description not available'
      && this.jobDescription !== 'Could not fetch job description'
      && this.jobDescription.length > 50;

    if (hasDescription) {
      callback();
      return;
    }

    // Fetch job description first, then proceed
    this.isLoading = true;
    this.diceApi.getJobDescription(this.currentJob)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.jobDescription = result.description || 'Job description not available';
          if (result.role && this.currentJob && !this.currentJob.role) {
            this.currentJob = { ...this.currentJob, role: result.role };
          }
          this.isLoading = false;
          callback();
        },
        error: () => {
          this.jobDescription = 'Could not fetch job description';
          this.isLoading = false;
          callback();
        }
      });
  }

  selectCoverLetterMode(mode: 'AI' | 'Template' | null): void {
    this.coverLetterMode = mode;
    if (mode === null) {
      this.currentStep = 'review';
      this.generatedCoverLetter = '';
    } else if (mode === 'AI') {
      this.ensureJobDescriptionThen(() => this.generateCoverLetter(mode));
    } else {
      this.generateCoverLetter(mode);
    }
  }

  private generateCoverLetter(mode: 'AI' | 'Template'): void {
    if (!this.currentJob) return;

    this.isLoading = true;
    this.savedCoverLetterPath = '';

    const saveAfterGenerate = (letter: string) => {
      this.generatedCoverLetter = letter;
      this.coverLetterService
        .saveCoverLetterAsTxt(this.currentJob!, letter, mode)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (savedPath) => {
            this.savedCoverLetterPath = savedPath || '';
            this.isLoading = false;
          },
          error: () => { this.isLoading = false; }
        });
    };

    if (mode === 'AI') {
      this.coverLetterService.generateAICoverLetter(this.currentJob, this.jobDescription)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (letter) => saveAfterGenerate(letter || this.getDefaultCoverLetter()),
          error: () => saveAfterGenerate(this.getDefaultCoverLetter())
        });
    } else {
      this.coverLetterService.generateTemplateCoverLetter(this.currentJob)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (letter) => saveAfterGenerate(letter)
        });
    }
  }

  private getDefaultCoverLetter(): string {
    if (!this.currentJob) return '';
    const template = `Professional cover letter for ${this.currentJob.role} at ${this.currentJob.company}`;
    return template;
  }

  downloadCoverLetterPdf(): void {
    if (!this.generatedCoverLetter || !this.currentJob) return;

    const role = this.currentJob.role || 'Role';
    const company = this.currentJob.company || 'Company';
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `cover_letter_${company.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.pdf`;

    // Create a printable HTML document and use browser print-to-PDF
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // Fallback: download as txt if popup blocked
      const blob = new Blob([this.generatedCoverLetter], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.pdf', '.txt');
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const content = this.generatedCoverLetter.replace(/\n/g, '<br>');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${role} @ ${company} - Cover Letter</title>
        <style>
          body { font-family: 'Georgia', serif; font-size: 12pt; line-height: 1.6; margin: 1in; color: #333; }
          @media print { body { margin: 0.75in; } }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  }

  proceedToDecision(): void {
    this.currentStep = 'decision';
  }

  recordDecision(decision: 'Applied' | 'Skipped' | 'Pending'): void {
    if (!this.currentJob || this.isSavingDecision) return;

    if (decision === 'Skipped') {
      this.openSkipReasonModal();
      return;
    }

    this.finalizeDecision(decision, this.savedCoverLetterPath || undefined);
  }

  private showDecisionToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.showToast = false;
      this.toastTimer = null;
    }, 3000);
  }

  private finalizeDecision(decision: 'Applied' | 'Skipped' | 'Pending', coverLetterPath?: string): void {
    if (!this.currentJob) return;

    const selectedJob = this.currentJob;
    this.isSavingDecision = true;

    const jobDecision: JobDecision = {
      link: selectedJob.link,
      decision,
      company: selectedJob.company,
      role: selectedJob.role,
      location: selectedJob.location,
      notes: this.decisionNotes,
      skipReason: decision === 'Skipped' ? this.skipReason : undefined,
      coverLetterPath: coverLetterPath || undefined,
      timestamp: new Date().toISOString()
    };

    // Persist status change back to tracker CSV first.
    this.diceApi.updateJobStatus(selectedJob.link, decision)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.jobService.recordDecision(jobDecision);
          this.updateStats();
          this.showDecisionToast(`${decision} saved. Moving to next job...`, 'success');
          this.isSavingDecision = false;
          this.nextJob();
        },
        error: () => {
          this.isSavingDecision = false;
          this.showDecisionToast(`Failed to save ${decision}. Please try again.`, 'error');
        }
      });
  }

  saveSettings(): void {
    this.diceApi.setDiceSearchTerms(this.diceSearchTerms);
    this.showSettings = false;
    alert('Settings saved successfully!');
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  clearAllData(): void {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      this.jobService.clearAllData();
      this.resetWorkflow();
      this.updateStats();
      this.nextJob();
    }
  }
}
