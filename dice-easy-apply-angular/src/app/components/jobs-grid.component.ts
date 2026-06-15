import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Job } from '../models/job.model';
import { DiceApiService } from '../services/dice-api.service';
import { JobService } from '../services/job.service';

type SortColumn = 'role' | 'company' | 'location' | 'score' | 'status' | 'workType' | 'dateUpdated';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-jobs-grid',
  templateUrl: './jobs-grid.component.html',
  styleUrls: ['./jobs-grid.component.css']
})
export class JobsGridComponent implements OnInit, OnDestroy {
  jobs: Job[] = [];
  filteredJobs: Job[] = [];

  searchText = '';
  selectedStatus = 'All';
  selectedWorkType = 'All';
  minScore: number | null = null;

  sortColumn: SortColumn = 'score';
  sortDirection: SortDirection = 'desc';

  isLoading = false;

  stats = {
    total: 0,
    toApply: 0,
    applied: 0,
    skipped: 0,
    pending: 0
  };

  private destroy$ = new Subject<void>();

  constructor(
    private jobService: JobService,
    private diceApi: DiceApiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.jobService.jobs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(jobs => {
        this.jobs = jobs || [];
        this.applyFiltersAndSort();
        this.calculateStats();
      });

    if (!this.jobs.length) {
      this.refreshFromTracker();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshFromTracker(): void {
    this.isLoading = true;
    this.diceApi.searchEasyApplyJobs()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (jobs) => {
          this.jobService.setJobs(jobs);
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        }
      });
  }

  onFilterChange(): void {
    this.applyFiltersAndSort();
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'score' ? 'desc' : 'asc';
    }
    this.applyFiltersAndSort();
  }

  getSortLabel(column: SortColumn): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  private applyFiltersAndSort(): void {
    const search = this.searchText.trim().toLowerCase();

    this.filteredJobs = this.jobs
      .filter(job => {
        if (this.selectedStatus !== 'All' && (job.status || 'To Apply') !== this.selectedStatus) {
          return false;
        }

        if (this.selectedWorkType !== 'All' && (job.workType || 'Unknown') !== this.selectedWorkType) {
          return false;
        }

        if (this.minScore !== null && this.minScore !== undefined && (job.score || 0) < this.minScore) {
          return false;
        }

        if (!search) {
          return true;
        }

        const searchable = [
          job.role,
          job.company,
          job.location,
          job.salary,
          job.summary,
          job.status,
          job.workType,
          job.link
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchable.includes(search);
      })
      .sort((a, b) => this.compareJobs(a, b));
  }

  private compareJobs(a: Job, b: Job): number {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    let left: string | number = '';
    let right: string | number = '';

    switch (this.sortColumn) {
      case 'score':
        left = a.score || 0;
        right = b.score || 0;
        break;
      case 'dateUpdated':
        left = a.dateUpdated || '';
        right = b.dateUpdated || '';
        break;
      case 'role':
        left = a.role || '';
        right = b.role || '';
        break;
      case 'company':
        left = a.company || '';
        right = b.company || '';
        break;
      case 'location':
        left = a.location || '';
        right = b.location || '';
        break;
      case 'status':
        left = a.status || 'To Apply';
        right = b.status || 'To Apply';
        break;
      case 'workType':
        left = a.workType || 'Unknown';
        right = b.workType || 'Unknown';
        break;
      default:
        left = a.score || 0;
        right = b.score || 0;
    }

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * direction;
    }

    return String(left).localeCompare(String(right)) * direction;
  }

  private calculateStats(): void {
    const toApply = this.jobs.filter(j => (j.status || 'To Apply') === 'To Apply').length;
    const applied = this.jobs.filter(j => j.status === 'Applied').length;
    const skipped = this.jobs.filter(j => j.status === 'Skipped').length;
    const pending = this.jobs.filter(j => j.status === 'Pending').length;

    this.stats = {
      total: this.jobs.length,
      toApply,
      applied,
      skipped,
      pending
    };
  }

  trackByLink(index: number, job: Job): string {
    return job.link || String(index);
  }

  loadInWorkflow(job: Job): void {
    this.jobService.setCurrentJob(job);
    this.router.navigate(['/workflow']);
  }

  getStatusClass(status: string | undefined): string {
    switch (status || 'To Apply') {
      case 'Applied':
        return 'status-applied';
      case 'Skipped':
        return 'status-skipped';
      case 'Pending':
        return 'status-pending';
      default:
        return 'status-to-apply';
    }
  }

  clearFilters(): void {
    this.searchText = '';
    this.selectedStatus = 'All';
    this.selectedWorkType = 'All';
    this.minScore = null;
    this.applyFiltersAndSort();
  }
}
