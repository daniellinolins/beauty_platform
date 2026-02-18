import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from 'src/app/guards/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then((m) => m.LoginPage),
  },

  {
    path: 'folder/:id',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./folder/folder.module').then((m) => m.FolderPageModule),
  },

  {
    path: 'forms',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/form-list/form-list.page').then((m) => m.FormListPage),
  },
  {
    path: 'forms/builder',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/form-builder/form-builder.page').then(
        (m) => m.FormBuilderPage,
      ),
  },
  {
    path: 'forms/builder/:idForm',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/form-builder/form-builder.page').then(
        (m) => m.FormBuilderPage,
      ),
  },
  {
    path: 'forms/fill/:idForm',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/form-fill/form-fill.page').then((m) => m.FormFillPage),
  },

  {
    path: 'select-clinic',
    loadComponent: () =>
      import('./pages/select-clinic/select-clinic.page').then(
        (m) => m.SelectClinicPage,
      ),
  },
  {
    path: 'clinic/clients',
    loadComponent: () =>
      import('./pages/clinic-clients/clinic-clients.page').then(
        (m) => m.ClinicClientsPage,
      ),
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
