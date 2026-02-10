import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'forms', pathMatch: 'full' },

  // Keep the legacy folder route if your starter template still uses it
  {
    path: 'folder/:id',
    loadChildren: () => import('./folder/folder.module').then((m) => m.FolderPageModule),
  },

  {
    path: 'forms',
    loadComponent: () => import('./pages/form-list/form-list.page').then((m) => m.FormListPage),
  },
  {
    path: 'forms/builder',
    loadComponent: () => import('./pages/form-builder/form-builder.page').then((m) => m.FormBuilderPage),
  },
  {
    path: 'forms/builder/:idForm',
    loadComponent: () => import('./pages/form-builder/form-builder.page').then((m) => m.FormBuilderPage),
  },
  {
    path: 'forms/fill/:idForm',
    loadComponent: () => import('./pages/form-fill/form-fill.page').then((m) => m.FormFillPage),
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
