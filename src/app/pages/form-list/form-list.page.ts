import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonBadge,
  IonText, IonSpinner, IonRefresher, IonRefresherContent
} from '@ionic/angular/standalone';

import { ApiService } from '../../services/api';

@Component({
  selector: 'app-form-list',
  templateUrl: './form-list.page.html',
  styleUrls: ['./form-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonBadge,
    IonText, IonSpinner, IonRefresher, IonRefresherContent
  ]
})
export class FormListPage implements OnInit {

  tenantId = 1;

  loading = false;
  errorMsg: string | null = null;
  forms: any[] = [];

  constructor(
    private api: ApiService,
    private nav: NavController
  ) {}

  ngOnInit() {
    this.load();
  }

  load(event?: any) {
    this.loading = true;
    this.errorMsg = null;

    this.api.listForms(this.tenantId).subscribe({
      next: (rows) => {
        this.forms = rows || [];
        this.loading = false;
        if (event) event.target.complete();
      },
      error: (err) => {
        this.errorMsg = err?.error?.message || err?.message || 'Erro ao carregar formulários';
        this.loading = false;
        if (event) event.target.complete();
      }
    });
  }

  openForm(idForm: number) {
    this.nav.navigateForward(`/forms/fill/${idForm}`);
  }
}
