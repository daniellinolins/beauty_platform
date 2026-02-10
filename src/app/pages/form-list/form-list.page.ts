import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem, IonLabel, IonFab, IonFabButton, IonIcon, IonButtons, IonButton } from '@ionic/angular/standalone';
import { ApiService } from 'src/app/services/api';
import { Router } from '@angular/router';

@Component({
  selector: 'app-form-list',
  templateUrl: './form-list.page.html',
  styleUrls: ['./form-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
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
    // New form (builder starts as "isNew")
    this.router.navigateByUrl('/forms/builder');
  }

  editForm(form: any) {
    this.router.navigate(['/forms/builder', form.id_form]);
  }

  openForm(form: any) {
    this.router.navigate(['/forms/fill', form.id_form]);
  }
}
