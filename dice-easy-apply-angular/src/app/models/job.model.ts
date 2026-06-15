export interface Job {
  id?: string;
  link: string;
  role: string;
  company: string;
  location: string;
  salary?: string;
  workType?: 'Remote' | 'Hybrid' | 'Onsite' | 'Unknown';
  score?: number;
  summary?: string;
  jobDescription?: string;
  jobDescriptionFile?: string;
  status?: 'To Apply' | 'Applied' | 'Skipped' | 'Pending';
  dateAdded?: string;
  dateUpdated?: string;
}

export interface JobDecision {
  link: string;
  decision: 'Applied' | 'Skipped' | 'Pending';
  company: string;
  role: string;
  location: string;
  notes?: string;
  skipReason?: string;
  coverLetterPath?: string;
  jobDescriptionPath?: string;
  timestamp: string;
}

export interface CoverLetter {
  id?: string;
  jobLink: string;
  company: string;
  role: string;
  content: string;
  type: 'AI' | 'Template';
  generatedAt: string;
}

export interface ApplicationTracker {
  totalProcessed: number;
  appliedCount: number;
  skippedCount: number;
  pendingCount: number;
  decisions: JobDecision[];
}
