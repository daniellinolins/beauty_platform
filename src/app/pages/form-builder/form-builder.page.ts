import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/services/api';
import { AlertController, ModalController, NavController } from '@ionic/angular';
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

import { FormSchema, FormSection } from './form-schema.types';
import { ElementEditorModal } from './modals/element-editor.modal';
import { FormPreviewModal } from './modals/form-preview.modal';

type TabKey = 'meta' | 'structure' | 'versions';
type DefaultLanguage = 'pt-PT' | 'pt-BR' | 'en-US' | 'es-ES';

@Component({
  selector: 'app-form-builder',
  templateUrl: './form-builder.page.html',
  styleUrls: ['./form-builder.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonText,
    IonSpinner,
    IonList,
    IonItem,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonReorderGroup,
    IonReorder,
  ],
})
export class FormBuilderPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tenantId = 1;

  idForm: number | null = null;
  idFormVersion: number | null = null;

  loading = false;

  tab: TabKey = 'meta';
  errorMsg = '';
  infoMsg = '';

  formName = '';
  formDescription = '';
  formStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';

  // ✅ precisa bater com o HTML (pt-PT, pt-BR, en-US, es-ES)
  defaultLanguage: DefaultLanguage = 'pt-PT';

  versionStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'DRAFT';
  versionNumber: number | null = null;

  schema: FormSchema = {
    schema_version: 'v1',
    default_language: 'pt',
    sections: [
      {
        id: 'sec-1',
        title: {
          pt: 'Seção 1',
          en: 'Section 1',
          'pt-PT': 'Seção 1',
          'pt-BR': 'Seção 1',
          'en-US': 'Section 1',
          'es-ES': 'Sección 1',
        } as any,
        elements: [],
      },
    ],
  };

  get isNew(): boolean {
    return !this.idForm;
  }

  get sections(): FormSection[] {
    return this.schema.sections || [];
  }

  selectedSectionIndex: number = 0;

  get currentSection(): FormSection | null {
    return this.sections?.[this.selectedSectionIndex] || null;
  }

  get currentElements() {
    return this.currentSection?.elements || [];
  }

  versions: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private nav: NavController,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.idForm = id ? Number(id) : null;

    const v = this.route.snapshot.queryParamMap.get('version');
    this.idFormVersion = v ? Number(v) : null;

    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------
  // helpers
  // ---------------------------
  private normalizeDefaultLanguage(input: any): DefaultLanguage {
    const s = (input ?? '').toString();
    if (s === 'pt-PT' || s === 'pt-BR' || s === 'en-US' || s === 'es-ES') return s;
    // se vier 'pt' ou 'en' do schema antigo
    if (s === 'en') return 'en-US';
    if (s === 'es') return 'es-ES';
    return 'pt-PT';
  }

  private schemaLangKey(): 'pt' | 'en' | 'es' {
    if (this.defaultLanguage.startsWith('pt')) return 'pt';
    if (this.defaultLanguage.startsWith('es')) return 'es';
    return 'en';
  }

  private ensureSectionTitleKeys(sec: any) {
    const t = (sec?.title || {}) as any;

    const pt = t['pt'] ?? t['pt-PT'] ?? t['pt-BR'] ?? '';
    const en = t['en'] ?? t['en-US'] ?? '';
    const es = t['es'] ?? t['es-ES'] ?? '';

    // mantém pt/en (compatibilidade)
    t['pt'] = pt || '';
    t['en'] = en || '';
    t['es'] = es || '';

    // garante chaves usadas no HTML
    t['pt-PT'] = t['pt-PT'] ?? pt ?? '';
    t['pt-BR'] = t['pt-BR'] ?? pt ?? '';
    t['en-US'] = t['en-US'] ?? en ?? '';
    t['es-ES'] = t['es-ES'] ?? es ?? '';

    sec.title = t;
  }

  private normalizeSchemaForUi() {
    // Ajusta schema.default_language quando for 'pt'/'en' etc
    const dl = (this.schema as any)?.default_language;
    this.defaultLanguage = this.normalizeDefaultLanguage(dl);

    // garante que cada seção tenha as chaves pt-PT / en-US etc, já que o HTML usa isso
    for (const s of this.schema.sections || []) {
      this.ensureSectionTitleKeys(s as any);
    }
  }

  // ---------------------------
  // Meta handlers (HTML usa)
  // ---------------------------
  setFormName(v: any) {
    this.formName = (v ?? '').toString().replace(/^\s+/, '');
  }

  setFormDescription(v: any) {
    this.formDescription = (v ?? '').toString();
  }

  setFormStatus(v: any) {
    const val = (v ?? '').toString();
    this.formStatus = val === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  }

  setDefaultLanguage(v: any) {
    this.defaultLanguage = this.normalizeDefaultLanguage(v);

    // guarda no schema também (compat: salva key curta pt/en/es)
    const key = this.schemaLangKey();
    (this.schema as any).default_language = key;

    // garante chaves em todas as seções
    this.normalizeSchemaForUi();
  }

  setTab(v: any) {
    const val = (v ?? '').toString() as TabKey;
    this.tab = val === 'meta' || val === 'structure' || val === 'versions' ? val : 'meta';
  }

  // ---------------------------
  // Load / Refresh
  // ---------------------------
  async load() {
    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    try {
      if (!this.idForm) {
        this.tab = 'meta';
        this.normalizeSchemaForUi();
        return;
      }

      await this.refreshVersions();

      if (this.idFormVersion) {
        await this.loadVersion(this.idFormVersion);
      } else if (this.versions?.length) {
        const draft = this.versions.find((x) => x.status === 'DRAFT');
        const pick = draft || this.versions[0];
        if (pick?.id_form_version) {
          await this.loadVersion(Number(pick.id_form_version));
        }
      }

      this.normalizeSchemaForUi();
    } catch (e: any) {
      this.errorMsg = e?.message || 'Erro ao carregar form.';
    } finally {
      this.loading = false;
    }
  }

  async refreshVersions() {
    if (!this.idForm) return;

    const list = await firstValueFrom(
      this.api.listFormVersions(this.tenantId, this.idForm).pipe(takeUntil(this.destroy$)),
    );

    const anyList: any = list as any;
    this.versions = Array.isArray(anyList) ? anyList : anyList?.items || [];
  }

  async loadVersion(idFormVersion: number) {
    if (!this.idForm) return;

    const version = await firstValueFrom(
      this.api.getFormVersion(this.idForm, idFormVersion, this.tenantId).pipe(takeUntil(this.destroy$)),
    );

    const v: any = version || {};
    this.idFormVersion = idFormVersion;
    this.versionStatus = v.status || 'DRAFT';
    this.versionNumber = v.version_number ?? null;

    const schemaJson = v.schema_json;
    const parsed = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson;

    if (parsed) {
      this.schema = parsed as FormSchema;
      this.normalizeSchemaForUi();
      this.selectedSectionIndex = 0;
    }
  }

  loadVersionFromList(v: any) {
    const id = v?.id_form_version;
    if (id) this.loadVersion(Number(id));
  }

  // ---------------------------
  // Sections (HTML usa)
  // ---------------------------
  selectSection(i: number) {
    this.selectedSectionIndex = i;
  }

  async addSection() {
    if (this.versionStatus !== 'DRAFT') return;

    const newId = `sec-${Date.now()}`;
    const n = (this.schema.sections?.length || 0) + 1;

    const sec: any = {
      id: newId,
      title: {
        pt: `Seção ${n}`,
        en: `Section ${n}`,
      },
      elements: [],
    };

    this.ensureSectionTitleKeys(sec);

    this.schema.sections = [...(this.schema.sections || []), sec];
    this.selectedSectionIndex = this.schema.sections.length - 1;
  }

  async renameSection(i: number) {
    const s: any = this.schema.sections?.[i];
    if (!s) return;

    this.ensureSectionTitleKeys(s);

    const alert = await this.alertCtrl.create({
      header: 'Renomear seção',
      inputs: [
        {
          name: 'pt',
          type: 'text',
          value: (s.title as any)?.['pt'] || '',
          placeholder: 'Título (pt)',
        },
        {
          name: 'en',
          type: 'text',
          value: (s.title as any)?.['en'] || '',
          placeholder: 'Title (en)',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data: any) => {
            const pt = (data?.pt ?? '').toString();
            const en = (data?.en ?? '').toString();

            s.title = {
              ...(s.title || {}),
              pt,
              en,
            };

            this.ensureSectionTitleKeys(s);
          },
        },
      ],
    });

    await alert.present();
  }

  removeSection(i: number) {
    if ((this.schema.sections?.length || 0) <= 1) return;
    this.schema.sections.splice(i, 1);
    if (this.selectedSectionIndex >= this.schema.sections.length) {
      this.selectedSectionIndex = Math.max(0, this.schema.sections.length - 1);
    }
  }

  reorderSections(ev: CustomEvent<ItemReorderEventDetail>) {
    const from = ev.detail.from;
    const to = ev.detail.to;

    const arr = this.schema.sections || [];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);

    ev.detail.complete();
    this.selectedSectionIndex = to;
  }

  // ---------------------------
  // Elements (HTML usa)
  // ---------------------------
  isField(el: any): boolean {
    return el?.type === 'FIELD';
  }

  fieldKey(el: any): string {
    return el?.type === 'FIELD' ? el.field?.key || '' : '';
  }

  fieldInputType(el: any): string {
    return el?.type === 'FIELD' ? el.field?.input_type || '' : '';
  }

  staticText(el: any): string {
    if (!el) return '';
    const lang = this.defaultLanguage;

    if (el.type === 'TITLE' || el.type === 'SUBTITLE' || el.type === 'TEXT_BLOCK') {
      return el.text?.[lang] || el.text?.['pt-PT'] || el.text?.['pt'] || '';
    }
    if (el.type === 'IMAGE_DECORATIVE') return `IMAGE: ${el.url || ''}`;
    if (el.type === 'DIVIDER') return 'DIVIDER';
    return el.type || '';
  }

  reorderElements(ev: CustomEvent<ItemReorderEventDetail>) {
    const sec = this.currentSection;
    if (!sec) return;

    const arr = sec.elements || [];
    const [moved] = arr.splice(ev.detail.from, 1);
    arr.splice(ev.detail.to, 0, moved);

    ev.detail.complete();
  }

  async addElement() {
    if (this.versionStatus !== 'DRAFT') return;
    await this.openElementEditor(null);
  }

  async editElement(i: number) {
    if (this.versionStatus !== 'DRAFT') return;
    await this.openElementEditor(i);
  }

  removeElement(i: number) {
    if (this.versionStatus !== 'DRAFT') return;
    const sec = this.currentSection;
    if (!sec) return;
    sec.elements.splice(i, 1);
  }

  private async openElementEditor(index: number | null) {
    const sec = this.currentSection;
    if (!sec) return;

    const modal = await this.modalCtrl.create({
      component: ElementEditorModal,
      componentProps: {
        element: index === null ? null : sec.elements[index],
        defaultLanguage: this.defaultLanguage,
      },
    });

    await modal.present();
    const res = await modal.onDidDismiss();
    if (!res?.data) return;

    const updated = res.data;
    if (index === null) sec.elements.push(updated);
    else sec.elements[index] = updated;
  }

  // ---------------------------
  // Preview / Create / Save Draft / Clone Draft
  // ---------------------------
  async preview() {
    const modal = await this.modalCtrl.create({
      component: FormPreviewModal,
      componentProps: {
        schema: this.schema,
        initialSectionIndex: this.selectedSectionIndex,
        defaultLanguage: this.defaultLanguage,
      },
    });

    await modal.present();
  }

  async createNewFormAndDraft() {
    if (this.loading) return;

    this.loading = true;
    this.errorMsg = '';
    this.infoMsg = '';

    try {
      // garante coerência do schema antes de salvar
      this.normalizeSchemaForUi();

      const created = await firstValueFrom(
        this.api
          .createForm({
            tenant_id: this.tenantId,
            name: this.formName,
            description: this.formDescription,
            status: this.formStatus,
            default_language: this.defaultLanguage,
          })
          .pipe(takeUntil(this.destroy$)),
      );

      const formId = Number((created as any)?.id_form || (created as any)?.id);
      if (!formId) throw new Error('API não retornou id_form.');

      this.idForm = formId;

      const createdV = await firstValueFrom(
        this.api
          .createFormVersion({
            tenant_id: this.tenantId,
            id_form: this.idForm,
            status: 'DRAFT',
            schema_json: this.schema,
          })
          .pipe(takeUntil(this.destroy$)),
      );

      this.idFormVersion = Number((createdV as any)?.id_form_version || (createdV as any)?.id);
      this.versionStatus = 'DRAFT';

      await this.refreshVersions();
      this.infoMsg = 'Form e rascunho criados com sucesso.';
      this.tab = 'structure';
    } catch (e: any) {
      this.errorMsg = e?.message || 'Erro ao criar form.';
    } finally {
      this.loading = false;
    }
  }

  async saveDraft() {
    if (this.loading) return;

    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    try {
      // garante coerência do schema antes de salvar
      this.normalizeSchemaForUi();

      if (!this.idForm) {
        if (!this.formName?.trim()) {
          this.errorMsg = 'Informe o nome do formulário antes de salvar.';
          return;
        }
        await this.createNewFormAndDraft();
        return;
      }

      const schemaString = JSON.stringify(this.schema);
      const checksum = await this.computeSha256(schemaString);

      const saved = await firstValueFrom(
        this.api
          .saveDraftFormVersion(this.tenantId, this.idForm, {
            version_id: this.idFormVersion ?? null,
            schema_json: this.schema,
            checksum_sha256: checksum || undefined,
          })
          .pipe(takeUntil(this.destroy$)),
      );

      this.idFormVersion = Number(saved?.id_form_version || saved?.id);
      this.versionStatus = (saved?.status || 'DRAFT') as any;
      this.versionNumber = saved?.version_number ?? this.versionNumber;

      await this.refreshVersions();
      this.infoMsg = 'Rascunho salvo com sucesso.';
      this.tab = 'structure';
    } catch (e: any) {
      const msg = e?.error?.error || e?.error?.message || e?.message || 'Erro ao salvar rascunho.';
      this.errorMsg = msg;
    } finally {
      this.loading = false;
    }
  }

  async publish() {
    this.infoMsg = 'Publicar ainda não foi ligado aqui (você já tem endpoint no backend).';
  }

  // ✅ ESTE ERA O MÉTODO QUE FALTAVA (HTML chama no tab "versions")
  async createNewDraftFromCurrent() {
    if (this.loading) return;
    if (!this.idForm) return;

    this.loading = true;
    this.errorMsg = '';
    this.infoMsg = '';

    try {
      // garante coerência do schema antes de clonar
      this.normalizeSchemaForUi();

      const createdV = await firstValueFrom(
        this.api
          .createFormVersion({
            tenant_id: this.tenantId,
            id_form: this.idForm,
            status: 'DRAFT',
            schema_json: this.schema,
          })
          .pipe(takeUntil(this.destroy$)),
      );

      this.idFormVersion = Number((createdV as any)?.id_form_version || (createdV as any)?.id);
      this.versionStatus = 'DRAFT';
      this.versionNumber = (createdV as any)?.version_number ?? this.versionNumber;

      await this.refreshVersions();
      this.infoMsg = 'Nova versão DRAFT criada (clonada da atual).';
      this.tab = 'structure';
    } catch (e: any) {
      const msg = e?.error?.error || e?.error?.message || e?.message || 'Erro ao criar novo rascunho.';
      this.errorMsg = msg;
    } finally {
      this.loading = false;
    }
  }

  private async computeSha256(text: string): Promise<string> {
    try {
      const data = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }
}
