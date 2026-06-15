import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { EasyApplyWorkflowComponent } from './components/easy-apply-workflow.component';
import { JobsGridComponent } from './components/jobs-grid.component';

const routes: Routes = [
  { path: 'workflow', component: EasyApplyWorkflowComponent },
  { path: 'jobs', component: JobsGridComponent },
  { path: '', redirectTo: '/workflow', pathMatch: 'full' },
  { path: '**', redirectTo: '/workflow' }
];

@NgModule({
  declarations: [
    AppComponent,
    EasyApplyWorkflowComponent,
    JobsGridComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    RouterModule.forRoot(routes)
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
