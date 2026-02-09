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
  IonButton,
  IonButtons,
  IonFab,
  IonFabButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { ApiService } from '../../services/api';
import { addIcons } from 'ionicons';
import { addOutline, createOutline } from 'ionicons/icons';

@Component({
  selector: 'app-form-list',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Forms</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list>
        <ion-item *ngFor="let f of forms">
          <ion-label (click)="openForm(f.id_form)" style="cursor:pointer;">
            <div><strong>{{ f.name || ('Form #' + f.id_form) }}</strong></div>
            <div style="font-size: 12px; opacity: 0.75">
              id_form: {{ f.id_form }}
            </div>
          </ion-label>

          <ion-buttons slot="end">
            <ion-button fill="clear" (click)="editForm(f.id_form)">
              <ion-icon slot="icon-only" name="create-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-item>
      </ion-list>

      <div *ngIf="errorMsg" style="margin-top: 12px;">
        {{ errorMsg }}
      </div>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button (click)="newForm()">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class FormListPage implements OnInit {
  tenantId = 1;
  clinicId = 1;

  forms: any[] = [];
  errorMsg = '';

  constructor(private api: ApiService, private nav: NavController) {
    addIcons({ addOutline, createOutline });
  }

  ngOnInit(): void {
    this.api.listForms(this.tenantId).subscribe({
      next: (list) => (this.forms = list || []),
      error: (err: any) => {
        this.errorMsg = err?.error?.message || err?.message || 'Erro ao listar forms';
      },
    });
  }

  openForm(idForm: number) {
    this.nav.navigateForward(`/forms/fill/${idForm}`);
  }

  newForm() {
    this.nav.navigateForward(`/forms/builder/new`);
  }

  editForm(idForm: number) {
    this.nav.navigateForward(`/forms/builder/${idForm}`);
  }
}
