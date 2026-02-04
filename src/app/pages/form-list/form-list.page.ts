import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-form-list',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Forms</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list>
        <ion-item
          button
          detail
          *ngFor="let f of forms"
          (click)="openForm(f.id_form)"
        >
          <ion-label>
            <div><strong>{{ f.name || ('Form #' + f.id_form) }}</strong></div>
            <div style="font-size: 12px; opacity: 0.75">
              id_form: {{ f.id_form }}
            </div>
          </ion-label>
        </ion-item>
      </ion-list>

      <div *ngIf="errorMsg" style="margin-top: 12px;">
        {{ errorMsg }}
      </div>
    </ion-content>
  `,
})
export class FormListPage implements OnInit {
  tenantId = 1;
  clinicId = 1;

  forms: any[] = [];
  errorMsg = '';

  constructor(
    private api: ApiService,
    private nav: NavController,
  ) {}

  ngOnInit(): void {
    // Se seu backend exige clinic_id, use: this.api.listForms(this.tenantId, this.clinicId)
    this.api.listForms(this.tenantId).subscribe({
      next: (list) => (this.forms = list || []),
      error: (err: any) => {
        this.errorMsg =
          err?.error?.message ||
          err?.message ||
          'Erro ao listar forms';
      },
    });
  }

  openForm(idForm: number) {
    this.nav.navigateForward(`/forms/fill/${idForm}`);
  }
}
