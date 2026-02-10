import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  NavController,
  ModalController,
} from '@ionic/angular';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonReorder,
  IonReorderGroup,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  ItemReorderEventDetail,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ApiService } from 'src/app/services/api';

import { FormSchema, FormSection, makeEmptySchema } from './form-schema.types';
import { ElementEditorModal } from './modals/element-editor.modal';
import { FormPreviewModal } from './modals/form-preview.modal';

import { FormElement } from 'src/app/components/form-renderer/form-renderer.types';

@Component({
  selector: 'app-form-builder',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonText,
    IonSpinner,
    IonButton,
    IonSegment,
    IonSegmentButton,
    IonList,
    IonItem,
    IonLabel,
    IonReorderGroup,
    IonReorder,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
  ],
  templateUrl: './form-builder.page.html',

  // ✅ garante o provider mesmo se o bootstrap estiver fora do padrão
  providers: [ModalController, AlertController, NavController],
})
export class FormBuilderPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tenantId = 1;

  loading = false;
  errorMsg = '';
  infoMsg = '';

  idForm: number | null = null;
  isNew = false;

  formName = '';
  formDescription = '';
  formStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';
  defaultLanguage = 'pt-PT';

  idFormVersion: number | null = null;
  versionNumber: number | null = null;
  versionStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'DRAFT';

  schema: FormSchema = makeEmptySchema(this.defaultLanguage);

  tab: 'meta' | 'structure' | 'versions' = 'meta';
  selectedSectionIndex = 0;

  versions: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private nav: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('idForm');
    if (!id) {
      this.isNew = true;
      this.initNew();
      return;
    }

    this.isNew = false;
    this.idForm = Number(id);
    this.loadForEdit();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(v: string) {
    if (v === 'meta' || v === 'structure' || v === 'versions') this.tab = v;
  }

  setFormName(v: string) {
    this.formName = v ?? '';
  }
  setFormDescription(v: string) {
    this.formDescription = v ?? '';
  }
  setFormStatus(v: 'ACTIVE' | 'INACTIVE') {
    this.formStatus = v ?? 'ACTIVE';
  }
  setDefaultLanguage(v: string) {
    this.defaultLanguage = v ?? 'pt-PT';
    // Recria schema base apenas se estiver novo e vazio (evita apagar trabalho)
    if (this.isNew && (!this.schema?.sections || this.schema.sections.length === 0)) {
      this.schema = makeEmptySchema(this.defaultLanguage);
    }
  }

  private initNew() {
    this.idForm = null;
    this.idFormVersion = null;
    this.versionNumber = null;
    this.versionStatus = 'DRAFT';
    this.formName = '';
    this.formDescription = '';
    this.formStatus = 'ACTIVE';
    this.defaultLanguage = 'pt-PT';
    this.schema = makeEmptySchema(this.defaultLanguage);
    this.selectedSectionIndex = 0;
    this.versions = [];
    this.tab = 'meta';
  }

  private async loadForEdit() {
    // ⚠️ Mantive sua estrutura. Caso você queira, eu conecto aqui com o endpoint real.
    // Por enquanto, só evita crash.
    this.loading = true;
    this.errorMsg = '';
    try {
      // Ex.: você pode buscar latest version + detalhes do form aqui.
      // Depende do que existe no backend / ApiService.
      // this.versions = await firstValueFrom(this.api.listFormVersions(...));

      // placeholder (não quebra)
      this.loading = false;
    } catch (e: any) {
      this.loading = false;
      this.errorMsg = e?.message || 'Erro ao carregar formulário';
    }
  }

  get sections(): FormSection[] {
    return this.schema?.sections || [];
  }

  get currentElements(): FormElement[] {
    const sec = this.sections[this.selectedSectionIndex];
    return sec?.elements || [];
  }

  selectSection(i: number) {
    this.selectedSectionIndex = i;
  }

  async openPreview() {
    const modal = await this.modalCtrl.create({
      component: FormPreviewModal,
      componentProps: {
        schema: this.schema,
        defaultLanguage: this.defaultLanguage,
      },
    });
    await modal.present();
  }

  async createNewFormAndDraft() {
    // ⚠️ Aqui precisa existir endpoint no backend + método no ApiService.
    // Mantive “safe”: só avisa por enquanto, sem quebrar.
    const alert = await this.alertCtrl.create({
      header: 'Ação pendente',
      message:
        'O fluxo de criação (POST /api/forms + POST /api/form_versions) precisa estar implementado no backend e no ApiService.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async saveDraft() {
    // ⚠️ idem: depende de endpoints/métodos no ApiService
    const alert = await this.alertCtrl.create({
      header: 'Ação pendente',
      message:
        'O fluxo de salvar rascunho (update/create form_version) precisa estar implementado no backend e no ApiService.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async publish() {
    const alert = await this.alertCtrl.create({
      header: 'Ação pendente',
      message:
        'O fluxo de publish (mudar status da versão para PUBLISHED) precisa estar implementado no backend e no ApiService.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  reorderSections(ev: CustomEvent<ItemReorderEventDetail>) {
    const from = ev.detail.from;
    const to = ev.detail.to;

    const arr = [...this.sections];
    const moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);

    this.schema = { ...this.schema, sections: arr };
    ev.detail.complete();
  }

  reorderElements(ev: CustomEvent<ItemReorderEventDetail>) {
    const sec = this.sections[this.selectedSectionIndex];
    if (!sec) return ev.detail.complete();

    const from = ev.detail.from;
    const to = ev.detail.to;

    const arr = [...(sec.elements || [])];
    const moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);

    const newSections = [...this.sections];
    newSections[this.selectedSectionIndex] = { ...sec, elements: arr };

    this.schema = { ...this.schema, sections: newSections };
    ev.detail.complete();
  }

  async addSection() {
    const secId = crypto.randomUUID?.() || String(Date.now());
    const newSec: FormSection = {
      id: secId,
      title: { [this.defaultLanguage]: `Seção ${this.sections.length + 1}` },
      elements: [],
    };

    this.schema = { ...this.schema, sections: [...this.sections, newSec] };
    this.selectedSectionIndex = this.sections.length;
  }

  async editElement(index: number) {
    const sec = this.sections[this.selectedSectionIndex];
    if (!sec) return;

    const el = sec.elements[index];
    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        element: el,
        defaultLanguage: this.defaultLanguage,
      },
    });

    modal.onDidDismiss().then((res) => {
      const updated = res?.data?.element as FormElement | undefined;
      if (!updated) return;

      const newEls = [...sec.elements];
      newEls[index] = updated;

      const newSections = [...this.sections];
      newSections[this.selectedSectionIndex] = { ...sec, elements: newEls };

      this.schema = { ...this.schema, sections: newSections };
    });

    await modal.present();
  }

  async addElement() {
    const sec = this.sections[this.selectedSectionIndex];
    if (!sec) return;

    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        element: null,
        defaultLanguage: this.defaultLanguage,
      },
    });

    modal.onDidDismiss().then((res) => {
      const created = res?.data?.element as FormElement | undefined;
      if (!created) return;

      const newEls = [...sec.elements, created];

      const newSections = [...this.sections];
      newSections[this.selectedSectionIndex] = { ...sec, elements: newEls };

      this.schema = { ...this.schema, sections: newSections };
    });

    await modal.present();
  }

  removeElement(index: number) {
    const sec = this.sections[this.selectedSectionIndex];
    if (!sec) return;

    const newEls = [...sec.elements];
    newEls.splice(index, 1);

    const newSections = [...this.sections];
    newSections[this.selectedSectionIndex] = { ...sec, elements: newEls };

    this.schema = { ...this.schema, sections: newSections };
  }

  loadVersionFromList(v: any) {
    // placeholder: quando você tiver schema_json na lista, aplica aqui.
    // ex: this.schema = JSON.parse(v.schema_json)
  }
}
