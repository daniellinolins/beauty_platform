import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  ModalController,
  NavController,
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
import { FormElement } from 'src/app/components/form-renderer/form-renderer.types';

import { ElementEditorModal } from './modals/element-editor.modal';
import { FormPreviewModal } from './modals/form-preview.modal';

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
    private alertCtrl: AlertController
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

  // -----------------------------
  // Helpers p/ HTML
  // -----------------------------
  setTab(v: any) {
    this.tab = v as any;
  }

  setFormName(v: any) {
    this.formName = (v ?? '').toString();
  }

  setFormDescription(v: any) {
    this.formDescription = (v ?? '').toString();
  }

  setFormStatus(v: any) {
    this.formStatus = (v ?? 'ACTIVE') as any;
  }

  setDefaultLanguage(v: any) {
    this.defaultLanguage = (v ?? 'pt-PT').toString();
    this.schema.default_language = this.defaultLanguage;
  }

  get sections(): FormSection[] {
    return this.schema.sections || [];
  }

  get currentSection(): FormSection | null {
    const s = this.sections[this.selectedSectionIndex];
    return s || null;
  }

  get currentElements(): FormElement[] {
    return (this.currentSection?.elements || []) as FormElement[];
  }

  // -----------------------------
  // Init
  // -----------------------------
  initNew() {
    this.loading = false;
    this.errorMsg = '';
    this.infoMsg = '';
    this.idForm = null;
    this.idFormVersion = null;
    this.versionNumber = null;
    this.versionStatus = 'DRAFT';
    this.schema = makeEmptySchema(this.defaultLanguage);
    this.schema.sections = [
      {
        id: this.uuid(),
        title: { [this.defaultLanguage]: 'Seção 1' },
        elements: [],
      },
    ];
    this.selectedSectionIndex = 0;
    this.tab = 'meta';
  }

  // -----------------------------
  // Create form + first draft
  // -----------------------------
  async createNewFormAndDraft() {
    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    try {
      if (!this.formName.trim()) {
        this.errorMsg = 'Nome do formulário é obrigatório.';
        return;
      }

      const createdForm = await firstValueFrom(
        this.api
          .createForm({
            tenant_id: this.tenantId,
            name: this.formName.trim(),
            description: this.formDescription || '',
            status: this.formStatus,
            default_language: this.defaultLanguage,
          })
          .pipe(takeUntil(this.destroy$))
      );

      this.idForm = Number(createdForm?.id_form);
      if (!this.idForm) throw new Error('createForm não retornou id_form');

      this.schema.default_language = this.defaultLanguage;

      const createdVer = await firstValueFrom(
        this.api
          .createFormVersion({
            tenant_id: this.tenantId,
            id_form: this.idForm,
            schema_json: this.schema,
            status: 'DRAFT',
          })
          .pipe(takeUntil(this.destroy$))
      );

      this.idFormVersion = Number(createdVer?.id_form_version);
      this.versionNumber = Number(createdVer?.version_number || 1);
      this.versionStatus = (createdVer?.status || 'DRAFT') as any;

      this.isNew = false;
      this.infoMsg = 'Formulário criado com versão DRAFT.';
      await this.refreshVersions();

      this.nav.navigateRoot(`/forms/builder/${this.idForm}`);
    } catch (e) {
      this.errorMsg = 'Erro ao criar formulário.';
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  // -----------------------------
  // Load EDIT
  // -----------------------------
  async loadForEdit() {
    if (!this.idForm) return;

    this.errorMsg = '';
    this.loading = true;

    try {
      await this.refreshVersions();

      const draft = this.versions.find((v) => v.status === 'DRAFT');
      if (draft) {
        this.applyVersion(draft);
      } else if (this.versions.length > 0) {
        this.applyVersion(this.versions[0]);
      }

      this.tab = 'structure';
    } catch (e) {
      console.error(e);
      this.errorMsg = 'Erro ao carregar formulário.';
    } finally {
      this.loading = false;
    }
  }

  async refreshVersions() {
    if (!this.idForm) return;

    const list = await firstValueFrom(
      this.api.listFormVersions(this.idForm, this.tenantId).pipe(takeUntil(this.destroy$))
    );

    this.versions = list || [];
  }

  applyVersion(v: any) {
    this.idFormVersion = Number(v.id_form_version);
    this.versionNumber = Number(v.version_number);
    this.versionStatus = (v.status || 'DRAFT') as any;

    if (v.schema_json) {
      this.schema = v.schema_json;
      if (!this.schema.sections || this.schema.sections.length === 0) {
        this.schema.sections = [
          { id: this.uuid(), title: { [this.defaultLanguage]: 'Seção 1' }, elements: [] },
        ];
      }
    }

    if (!this.schema.default_language) {
      this.schema.default_language = this.defaultLanguage;
    } else {
      this.defaultLanguage = this.schema.default_language;
    }

    if (this.selectedSectionIndex >= (this.schema.sections?.length || 0)) {
      this.selectedSectionIndex = 0;
    }
  }

  // -----------------------------
  // Top buttons (HTML)
  // -----------------------------
  async preview() {
    const modal = await this.modalCtrl.create({
      component: FormPreviewModal,
      componentProps: {
        tenantId: this.tenantId,
        defaultLang: this.defaultLanguage,
        schema: this.schema,
      },
    });
    await modal.present();
  }

  async saveDraft() {
    // Backend ainda não tem PUT version (update). Mantém compatível:
    // por enquanto cria nova versão DRAFT com o schema atual.
    await this.createNewDraftFromCurrent();
  }

  async publish() {
    // Backend publish ainda não foi implementado por você (passo C).
    // Por enquanto só alerta.
    const a = await this.alertCtrl.create({
      header: 'Publicar',
      message: 'Endpoint de publicação ainda não foi implementado no backend.',
      buttons: ['OK'],
    });
    await a.present();
  }

  // -----------------------------
  // Sections
  // -----------------------------
  selectSection(i: number) {
    this.selectedSectionIndex = i;
  }

  async renameSection(i: number) {
    const current = this.sections[i];
    const currentTitle = (current?.title?.[this.defaultLanguage] || '').toString();

    const alert = await this.alertCtrl.create({
      header: 'Renomear seção',
      inputs: [
        {
          name: 'title',
          type: 'text',
          value: currentTitle,
          placeholder: 'Título da seção',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data) => {
            const t = (data?.title || '').toString().trim();
            if (!t) return;
            current.title = current.title || {};
            current.title[this.defaultLanguage] = t;
          },
        },
      ],
    });

    await alert.present();
  }

  removeSection(i: number) {
    if (this.sections.length <= 1) return;
    this.sections.splice(i, 1);
    if (this.selectedSectionIndex >= this.sections.length) this.selectedSectionIndex = this.sections.length - 1;
  }

  addSection() {
    const n = this.sections.length + 1;
    this.sections.push({
      id: this.uuid(),
      title: { [this.defaultLanguage]: `Seção ${n}` },
      elements: [],
    });
    this.selectedSectionIndex = this.sections.length - 1;
  }

  reorderSections(ev: CustomEvent<ItemReorderEventDetail>) {
    const from = ev.detail.from;
    const to = ev.detail.to;
    const moved = this.sections.splice(from, 1)[0];
    this.sections.splice(to, 0, moved);
    ev.detail.complete();
    this.selectedSectionIndex = to;
  }

  // -----------------------------
  // Elements
  // -----------------------------
  reorderElements(ev: CustomEvent<ItemReorderEventDetail>) {
    const els = this.currentElements;
    const moved = els.splice(ev.detail.from, 1)[0];
    els.splice(ev.detail.to, 0, moved);
    ev.detail.complete();
  }

  async addElement() {
    if (!this.currentSection) return;

    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        defaultLanguage: this.defaultLanguage,
        element: null,
      },
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.element) {
      this.currentSection.elements = this.currentSection.elements || [];
      this.currentSection.elements.push(data.element);
    }
  }

  async editElement(index: number) {
    if (!this.currentSection) return;
    const el = this.currentSection.elements?.[index];
    if (!el) return;

    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        defaultLanguage: this.defaultLanguage,
        element: el,
      },
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.element) {
      this.currentSection.elements[index] = data.element;
    }
  }

  removeElement(i: number) {
    if (!this.currentSection?.elements) return;
    this.currentSection.elements.splice(i, 1);
  }

  // Helpers usados no HTML
  isField(el: any): boolean {
    return el?.type === 'FIELD';
  }

  fieldKey(el: any): string {
    return el?.key || el?.field?.key || '';
  }

  fieldInputType(el: any): string {
    return el?.input_type || el?.field?.input_type || '';
  }

  staticText(el: any): string {
    const t = el?.text;
    if (!t) return '';
    if (typeof t === 'string') return t;
    return t?.[this.defaultLanguage] || '';
  }

  // -----------------------------
  // Versions list actions
  // -----------------------------
  async createNewDraftFromCurrent() {
    if (!this.idForm) return;

    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    try {
      const createdVer = await firstValueFrom(
        this.api
          .createFormVersion({
            tenant_id: this.tenantId,
            id_form: this.idForm,
            schema_json: this.schema,
            status: 'DRAFT',
          })
          .pipe(takeUntil(this.destroy$))
      );

      this.idFormVersion = Number(createdVer?.id_form_version);
      this.versionNumber = Number(createdVer?.version_number || 1);
      this.versionStatus = (createdVer?.status || 'DRAFT') as any;

      await this.refreshVersions();
      this.infoMsg = 'Nova versão DRAFT criada.';
      this.tab = 'structure';
    } catch (e) {
      console.error(e);
      this.errorMsg = 'Erro ao criar nova versão DRAFT.';
    } finally {
      this.loading = false;
    }
  }

  loadVersionFromList(v: any) {
    this.applyVersion(v);
    this.tab = 'structure';
  }

  // -----------------------------
  // Utils
  // -----------------------------
  private uuid(): string {
    // simples e suficiente para o builder
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
