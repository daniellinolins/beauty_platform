import { IonicModule } from '@ionic/angular';

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonReorder,
  IonReorderGroup,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ReorderEndCustomEvent,
  ToastController,
} from '@ionic/angular/standalone';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService, FormStatus, VersionStatus } from 'src/app/services/api';
import { FormSchema, FormSection, makeEmptySchema } from './form-schema.types';
import { FormElement } from 'src/app/components/form-renderer/form-renderer.types';
import { ElementEditorModal } from './modals/element-editor.modal';
import { FormPreviewModal } from './modals/form-preview.modal';

@Component({
  selector: 'app-form-builder',
  templateUrl: './form-builder.page.html',
  styleUrls: ['./form-builder.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonText,
    IonSegment,
    IonSegmentButton,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonList,
    IonReorderGroup,
    IonReorder,
  ],
})
export class FormBuilderPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  errorMsg = '';
  infoMsg = '';

  // route param
  idForm = 0;
  tenantId = 1;

  // tabs
  tab: 'meta' | 'structure' | 'versions' = 'meta';

  // form meta
  formName = '';
  formDescription = '';
  formStatus: FormStatus = 'ACTIVE';
  defaultLanguage = 'pt';

  // versions
  versions: any[] = [];
  idFormVersion = 0;
  versionStatus: VersionStatus = 'DRAFT';
  versionNumber = 0;

  // schema being edited (always the current draft)
  schema: FormSchema = makeEmptySchema('pt');
  selectedSectionIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.tenantId = Number(
      this.route.snapshot.queryParamMap.get('tenant_id') || 1,
    );
    this.idForm = Number(this.route.snapshot.paramMap.get('id') || 0);

    if (this.idForm) {
      // existing form
      void this.loadLatestDraftOrLatest();
    } else {
      // new form
      this.schema = makeEmptySchema(this.defaultLanguage);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------
  // Template helpers
  // ---------------------

  // se você usa idForm (number) como “0 = novo”
  get isNew(): boolean {
    return !this.idForm || this.idForm <= 0;
  }

  setTab(value: any) {
    const v = (value ?? 'meta') as string;
    this.tab =
      v === 'structure' || v === 'versions' || v === 'meta'
        ? (v as any)
        : 'meta';
  }

  setFormName(v: string) {
    this.formName = v || '';
  }

  setFormDescription(v: string) {
    this.formDescription = v || '';
  }

  setFormStatus(v: string) {
    this.formStatus = (v as FormStatus) || 'ACTIVE';
  }

  setDefaultLanguage(v: string) {
    this.defaultLanguage = v || 'pt';
    if (this.schema) this.schema.default_language = this.defaultLanguage;
  }

  get sections(): FormSection[] {
    return this.schema?.sections || [];
  }

  get currentElements(): FormElement[] {
    const s = this.sections?.[this.selectedSectionIndex];
    return s?.elements || [];
  }

  isField(el: FormElement): boolean {
    return el.type === 'FIELD';
  }

  fieldKey(el: FormElement): string {
    return el.type === 'FIELD' ? el.key : '';
  }

  fieldInputType(el: FormElement): string {
    return el.type === 'FIELD' ? el.input_type : '';
  }

  staticText(el: FormElement): string {
    if (el.type === 'TEXT_BLOCK') return el.text?.[this.defaultLanguage] || '';
    if (el.type === 'IMAGE_DECORATIVE')
      return el.alt?.[this.defaultLanguage] || '';
    if (el.type === 'DIVIDER') return '---';
    return '';
  }

  // ---------------------
  // Loading
  // ---------------------

  private async loadLatestDraftOrLatest() {
    this.loading = true;
    this.errorMsg = '';
    try {
      // Load latest version (backend decides what is latest)
      const latest = await firstValueFrom(
        this.api.getLatestFormVersion(this.tenantId, this.idForm),
      );

      this.idFormVersion = Number(latest?.id_form_version || 0);
      this.versionStatus = (latest?.version_status || 'DRAFT') as VersionStatus;
      this.versionNumber = Number(latest?.version_number || 0);

      // meta fields (when backend includes them)
      this.formName = latest?.form_name || latest?.name || this.formName;
      this.formDescription =
        latest?.form_description || latest?.description || this.formDescription;
      this.formStatus = (latest?.form_status ||
        latest?.status ||
        this.formStatus) as FormStatus;
      this.defaultLanguage = latest?.default_language || this.defaultLanguage;

      const rawSchema = latest?.schema_json;
      this.schema =
        rawSchema && typeof rawSchema === 'object'
          ? rawSchema
          : makeEmptySchema(this.defaultLanguage);
      if (!this.schema.sections?.length)
        this.schema = makeEmptySchema(this.defaultLanguage);
      this.schema.default_language = this.defaultLanguage;

      await this.refreshVersions();
    } catch (e: any) {
      this.errorMsg = e?.message || 'Falha ao carregar versão.';
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  async refreshVersions() {
    if (!this.idForm) return;
    try {
      const list = await firstValueFrom(
        this.api
          .listFormVersions(this.idForm, this.tenantId)
          .pipe(takeUntil(this.destroy$)),
      );
      // list can be array or {items:[]}
      const items = Array.isArray(list) ? list : (list as any)?.items;
      this.versions = Array.isArray(items) ? items : [];
    } catch (e) {
      console.warn('refreshVersions failed', e);
    }
  }

  // ---------------------
  // Create / Save / Publish
  // ---------------------

  async createNewFormAndDraft() {
    this.loading = true;
    this.errorMsg = '';
    try {
      if (!this.formName.trim()) {
        await this.toast('Informe o nome do formulário.');
        return;
      }

      const form = await firstValueFrom(
        this.api.createForm({
          tenant_id: this.tenantId,
          name: this.formName.trim(),
          description: this.formDescription || undefined,
          status: this.formStatus,
          default_language: this.defaultLanguage,
        }),
      );

      this.idForm = Number(form?.id_form || form?.id || 0);

      const draftSchema = this.schema || makeEmptySchema(this.defaultLanguage);
      const v = await firstValueFrom(
        this.api.createFormVersion({
          tenant_id: this.tenantId,
          id_form: this.idForm,
          status: 'DRAFT',
          schema_json: draftSchema,
        }),
      );

      this.idFormVersion = Number(v?.id_form_version || v?.id || 0);
      this.versionStatus = (v?.version_status || 'DRAFT') as VersionStatus;
      this.versionNumber = Number(v?.version_number || 1);

      await this.refreshVersions();
      this.tab = 'structure';
      await this.toast('Formulário criado.');
    } catch (e: any) {
      console.error(e);
      this.errorMsg = e?.message || 'Falha ao criar formulário.';
    } finally {
      this.loading = false;
    }
  }

  async saveDraft() {
    if (!this.idForm || !this.idFormVersion) {
      await this.toast('Crie o formulário primeiro.');
      return;
    }
    if (this.versionStatus !== 'DRAFT') {
      await this.toast('Somente versões DRAFT podem ser alteradas.');
      return;
    }

    this.loading = true;
    this.errorMsg = '';
    try {
      // Update form meta
      await firstValueFrom(
        this.api.updateForm(this.idForm, {
          tenant_id: this.tenantId,
          name: this.formName,
          description: this.formDescription,
          status: this.formStatus,
          default_language: this.defaultLanguage,
        }),
      );

      // Update version
      await firstValueFrom(
        this.api.updateFormVersion(this.idForm, this.idFormVersion, {
          tenant_id: this.tenantId,
          version_status: 'DRAFT',
          schema_json: this.schema,
        }),
      );

      await this.refreshVersions();
      await this.toast('Rascunho salvo.');
    } catch (e: any) {
      console.error(e);
      this.errorMsg = e?.message || 'Falha ao salvar rascunho.';
    } finally {
      this.loading = false;
    }
  }

  async publish() {
    if (!this.idForm || !this.idFormVersion) return;
    if (this.versionStatus !== 'DRAFT') {
      await this.toast('Apenas DRAFT pode ser publicado.');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Publicar versão',
      message:
        'Deseja publicar esta versão? Após publicar, ela não poderá ser editada.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Publicar',
          role: 'confirm',
          handler: () => {
            void this.doPublish();
          },
        },
      ],
    });
    await alert.present();
  }

  private async doPublish() {
    this.loading = true;
    this.errorMsg = '';
    try {
      await firstValueFrom(
        this.api.publishFormVersion({
          tenant_id: this.tenantId,
          id_form: this.idForm,
          id_form_version: this.idFormVersion,
        }),
      );
      await this.toast('Publicado com sucesso.');
      await this.loadLatestDraftOrLatest();
    } catch (e: any) {
      console.error(e);
      this.errorMsg = e?.message || 'Falha ao publicar.';
    } finally {
      this.loading = false;
    }
  }

  async createNewDraftFromCurrent() {
    if (!this.idForm) return;

    this.loading = true;
    this.errorMsg = '';
    try {
      const v = await firstValueFrom(
        this.api.createFormVersion({
          tenant_id: this.tenantId,
          id_form: this.idForm,
          status: 'DRAFT',
          schema_json: this.schema,
        }),
      );

      this.idFormVersion = Number(v?.id_form_version || v?.id || 0);
      this.versionStatus = (v?.version_status || 'DRAFT') as VersionStatus;
      this.versionNumber = Number(v?.version_number || this.versionNumber + 1);

      await this.refreshVersions();
      await this.toast('Novo rascunho criado.');
    } catch (e: any) {
      console.error(e);
      this.errorMsg = e?.message || 'Falha ao criar novo rascunho.';
    } finally {
      this.loading = false;
    }
  }

  // ---------------------
  // Sections
  // ---------------------

  selectSection(i: number) {
    this.selectedSectionIndex = i;
  }

  reorderSections(ev: ReorderEndCustomEvent) {
    const from = ev.detail.from;
    const to = ev.detail.to;
    if (from === to) {
      ev.detail.complete(true);
      return;
    }

    const s = [...this.sections];
    const [moved] = s.splice(from, 1);
    s.splice(to, 0, moved);
    this.schema.sections = s;
    this.selectedSectionIndex = to;
    ev.detail.complete(true);
  }

  async addSection() {
    if (this.versionStatus !== 'DRAFT') return;
    const alert = await this.alertCtrl.create({
      header: 'Nova seção',
      inputs: [{ name: 'title', placeholder: 'Título' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Ok',
          role: 'confirm',
          handler: (data) => {
            const title = (data?.title || '').trim();
            const newSec: FormSection = {
              id: `sec_${Date.now()}`, // <-- obrigatório
              title: {
                [this.defaultLanguage]: `Seção ${this.sections.length + 1}`,
              },
              elements: [] as FormElement[],
            };
            this.sections.push(newSec);
            this.schema.sections = [...this.sections, newSec];
            this.selectedSectionIndex = this.sections.length - 1;
          },
        },
      ],
    });
    await alert.present();
  }

  async renameSection(i: number) {
    if (this.versionStatus !== 'DRAFT') return;
    const current = this.sections[i];
    const currentTitle = current?.title?.[this.defaultLanguage] || '';
    const alert = await this.alertCtrl.create({
      header: 'Renomear seção',
      inputs: [{ name: 'title', value: currentTitle }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Ok',
          role: 'confirm',
          handler: (data) => {
            const title = (data?.title || '').trim();
            const updated = {
              ...current,
              title: {
                ...(current.title || {}),
                [this.defaultLanguage]: title,
              },
            };
            const arr = [...this.sections];
            arr[i] = updated;
            this.schema.sections = arr;
          },
        },
      ],
    });
    await alert.present();
  }

  removeSection(i: number) {
    if (this.versionStatus !== 'DRAFT') return;
    if (this.sections.length <= 1) return;
    const arr = [...this.sections];
    arr.splice(i, 1);
    this.schema.sections = arr;
    this.selectedSectionIndex = Math.max(
      0,
      Math.min(this.selectedSectionIndex, arr.length - 1),
    );
  }

  // ---------------------
  // Elements
  // ---------------------

  reorderElements(ev: ReorderEndCustomEvent) {
    const from = ev.detail.from;
    const to = ev.detail.to;
    const sec = this.sections[this.selectedSectionIndex];
    if (!sec) {
      ev.detail.complete(true);
      return;
    }

    const els = [...(sec.elements || [])];
    const [moved] = els.splice(from, 1);
    els.splice(to, 0, moved);

    const sections = [...this.sections];
    sections[this.selectedSectionIndex] = { ...sec, elements: els };
    this.schema.sections = sections;

    ev.detail.complete(true);
  }

  async addElement() {
    if (this.versionStatus !== 'DRAFT') return;

    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        mode: 'create',
        defaultLanguage: this.defaultLanguage,
      },
    });

    await modal.present();
    const res = await modal.onDidDismiss();
    const el = res.data as FormElement | undefined;
    if (!el) return;

    const sec = this.sections[this.selectedSectionIndex];
    const els = [...(sec.elements || []), el];
    const sections = [...this.sections];
    sections[this.selectedSectionIndex] = { ...sec, elements: els };
    this.schema.sections = sections;
  }

  async editElement(i: number) {
    if (this.versionStatus !== 'DRAFT') return;

    const sec = this.sections[this.selectedSectionIndex];
    const current = sec?.elements?.[i];
    if (!current) return;

    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        mode: 'edit',
        defaultLanguage: this.defaultLanguage,
        element: current,
      },
    });

    await modal.present();
    const res = await modal.onDidDismiss();
    const updated = res.data as FormElement | undefined;
    if (!updated) return;

    const els = [...(sec.elements || [])];
    els[i] = updated;
    const sections = [...this.sections];
    sections[this.selectedSectionIndex] = { ...sec, elements: els };
    this.schema.sections = sections;
  }

  removeElement(i: number) {
    if (this.versionStatus !== 'DRAFT') return;
    const sec = this.sections[this.selectedSectionIndex];
    const els = [...(sec.elements || [])];
    els.splice(i, 1);
    const sections = [...this.sections];
    sections[this.selectedSectionIndex] = { ...sec, elements: els };
    this.schema.sections = sections;
  }

  // ---------------------
  // Preview + versions list
  // ---------------------

  async preview() {
    const modal = await this.modalCtrl.create({
      component: FormPreviewModal,
      componentProps: {
        schema: this.schema,
        defaultLanguage: this.defaultLanguage,
      },
    });
    await modal.present();
  }

  async loadVersionFromList(v: any) {
    const id = Number(v?.id_form_version || v?.id || 0);
    if (!id) return;

    // Simple strategy: backend doesn't have version-by-id endpoint in this patch.
    // So re-load latest and keep list only for navigation reference.
    // If your backend has GET /versions/<id>, you can add it and fetch here.
    await this.toast('Carregamento de versões antigas ainda não implementado.');
  }

  private async toast(message: string) {
    const t = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'bottom',
    });
    await t.present();
  }
}
