import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonFab,
  IonFabButton,
  IonIcon,
  IonButtons,
  IonButton,
} from '@ionic/angular/standalone';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from 'src/app/services/api';

@Component({
  selector: 'app-form-list',
  templateUrl: './form-list.page.html',
  styleUrls: ['./form-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,

    // ✅ Isso habilita routerLink / routerLinkActive no template
    RouterModule,

    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonList,
    IonItem,
    IonLabel,
    IonFab,
    IonFabButton,
    IonIcon,
    IonButtons,
    IonButton,
  ],
})
export class FormListPage {
  forms: any[] = [];
  tenantId = 1;

  // ✅ Se seu app usa Tabs e o caminho real for /tabs/forms,
  // troque aqui para: '/tabs/forms'
  private formsBasePath = '/forms';

  constructor(private api: ApiService, private router: Router) {}

  ionViewWillEnter() {
    this.load();
  }

  load() {
    this.api.listForms(this.tenantId).subscribe({
      next: (list) => (this.forms = list || []),
      error: (err) => console.error(err),
    });
  }

  newForm() {
    this.router.navigateByUrl(`${this.formsBasePath}/builder`);
  }

  editUrl(form: any): string {
    return `${this.formsBasePath}/builder/${form.id_form}`;
  }

  fillUrl(form: any): string {
    return `${this.formsBasePath}/fill/${form.id_form}`;
  }

  // Mantidos (caso você use em algum lugar)
  editForm(form: any) {
    this.router.navigateByUrl(this.editUrl(form));
  }

  openForm(form: any) {
    this.router.navigateByUrl(this.fillUrl(form));
  }
}
