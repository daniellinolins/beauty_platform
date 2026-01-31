import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'folder/inbox',
    pathMatch: 'full'
  },
  {
    path: 'folder/:id',
    loadChildren: () => import('./folder/folder.module').then( m => m.FolderPageModule)
  },
{
  path: 'forms',
  loadComponent: () => import('./pages/form-list/form-list.page').then(m => m.FormListPage)
},
{
  path: 'forms/fill/:id_form',
  loadComponent: () => import('./pages/form-fill/form-fill.page').then(m => m.FormFillPage)
},


];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
