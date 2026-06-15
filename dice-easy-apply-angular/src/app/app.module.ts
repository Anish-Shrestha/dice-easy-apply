import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { EasyApplyWorkflowComponent } from './components/easy-apply-workflow.component';
import { JobsGridComponent } from './components/jobs-grid.component';
import { LoginComponent } from './components/login.component';
import { SettingsComponent } from './components/settings.component';
import { AdminComponent } from './components/admin.component';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard] },
  { path: 'workflow', component: EasyApplyWorkflowComponent, canActivate: [AuthGuard] },
  { path: 'jobs', component: JobsGridComponent, canActivate: [AuthGuard] },
  { path: '', redirectTo: '/workflow', pathMatch: 'full' },
  { path: '**', redirectTo: '/workflow' }
];

@NgModule({
  declarations: [
    AppComponent,
    EasyApplyWorkflowComponent,
    JobsGridComponent,
    LoginComponent,
    SettingsComponent,
    AdminComponent
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
