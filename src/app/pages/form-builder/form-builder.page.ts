import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/services/api';
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
  IonTextarea, // ✅ FIX: necessário para <ion-textarea>
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';

import { FormSchema, FormSection } from './form-schema.types';
import { ElementEditorModal } from './modals/element-editor.modal';
import { FormPreviewModal } from './modals/form-preview.modal';

type TabKey = 'meta' | 'structure' | 'versions';

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
    IonTextarea, // ✅ FIX: necessário para <ion-textarea>

    IonSelect,
    IonSelectOption,

    IonReorderGroup,
    IonReorder,
  ],
})
export class FormBuilderPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tenantId = 1;

  // ids
  idForm: number | null = null;
  idFormVersion: number | null = null;

  loading = false;

  // UI state
  tab: TabKey = 'meta';
  errorMsg = '';
  infoMsg = '';

  // Form meta
  formName = '';
  formDescription = '';
  formStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE';
  defaultLanguage: 'pt' | 'en' = 'pt';

  // Version meta
  versionStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'DRAFT';
  versionNumber: number | null = null;

  // Schema (editor)
  schema: FormSchema = {
    schema_version: 'v1',
    default_language: 'pt',
    sections: [
      {
        id: 'sec-1',
        title: { pt: 'Seção 1', en: 'Section 1' },
        elements: [],
      },
    ],
  };

  // helpers
  get isNew(): boolean {
    return !this.idForm;
  }

  get sections(): FormSection[] {
    return this.schema.sections || [];
  }

  selectedSectionIndex = 0;

  get currentSection(): FormSection | null {
    return this.sections?.[this.selectedSectionIndex] || null;
  }

  get currentElements() {
    return this.currentSection?.elements || [];
  }

  // versions list
  versions: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private nav: NavController,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.idForm = id ? Number(id) : null;

    // se vier com ?version=...
    const v = this.route.snapshot.queryParamMap.get('version');
    this.idFormVersion = v ? Number(v) : null;

    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------
  // Meta handlers
  // ---------------------------
  setFormName(v: any) {
    // ✅ FIX: evita trimLeft/trimStart (ES2019). Compatível com ES2018/ES5.
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
    const val = (v ?? '').toString();
    this.defaultLanguage = val === 'en' ? 'en' : 'pt';
    this.schema.default_language = this.defaultLanguage;
  }

  setTab(v: any) {
    const val = (v ?? '').toString() as TabKey;
    this.tab = (val === 'meta' || val === 'structure' || val === 'versions') ? val : 'meta';
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
        // novo form: fica em meta/estrutura e aguarda "Criar"
        this.tab = 'meta';
        return;
      }

      // Carrega lista de versões
      await this.refreshVersions();

      // Se tiver idFormVersion usa, senão tenta usar o draft mais recente ou published
      if (this.idFormVersion) {
        await this.loadVersion(this.idFormVersion);
      } else if (this.versions?.length) {
        // preferir DRAFT
        const draft = this.versions.find((x) => x.status === 'DRAFT');
        const pick = draft || this.versions[0];
        if (pick?.id_form_version) {
          await this.loadVersion(Number(pick.id_form_version));
        }
      }
    } catch (e: any) {
      this.errorMsg = e?.message || 'Erro ao carregar form.';
    } finally {
      this.loading = false;
    }
  }

  async refreshVersions() {
    if (!this.idForm) return;

    const list = await firstValueFrom(
      this.api.listFormVersions(this.idForm, this.tenantId).pipe(takeUntil(this.destroy$))
    );

    // list pode vir array ou {items: []}
    const anyList: any = list as any;
    this.versions = Array.isArray(anyList) ? anyList : (anyList?.items || []);
  }

  async loadVersion(idFormVersion: number) {
    if (!this.idForm) return;

    const version = await firstValueFrom(
      this.api.getFormVersion(this.idForm, idFormVersion, this.tenantId).pipe(takeUntil(this.destroy$))
    );

    const v: any = version || {};
    this.idFormVersion = idFormVersion;
    this.versionStatus = (v.status || 'DRAFT');
    this.versionNumber = v.version_number ?? null;

    // schema_json pode vir como string JSON
    const schemaJson = v.schema_json;
    const parsed = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson;
    if (parsed) {
      this.schema = parsed as FormSchema;
      // garante coerência
      this.defaultLanguage = (this.schema.default_language === 'en' ? 'en' : 'pt');
      this.selectedSectionIndex = 0;
    }
  }

  loadVersionFromList(v: any) {
    const id = v?.id_form_version;
    if (id) this.loadVersion(Number(id));
  }

  // ---------------------------
  // Sections
  // ---------------------------
  selectSection(i: number) {
    this.selectedSectionIndex = i;
  }

  async addSection() {
    if (this.versionStatus !== 'DRAFT') return;

    const newId = `sec-${Date.now()}`;
    this.schema.sections = [
      ...(this.schema.sections || []),
      { id: newId, title: { pt: 'Nova Seção', en: 'New Section' }, elements: [] },
    ];

    this.selectedSectionIndex = (this.schema.sections.length - 1);
  }

  async renameSection(i: number) {
    const s = this.schema.sections?.[i];
    if (!s) return;

    const alert = await this.alertCtrl.create({
      header: 'Renomear seção',
      inputs: [
        { name: 'pt', type: 'text', value: (s.title as any)?.['pt'] || '', placeholder: 'Título (pt)' },
        { name: 'en', type: 'text', value: (s.title as any)?.['en'] || '', placeholder: 'Title (en)' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data: any) => {
            s.title = { pt: data.pt || '', en: data.en || '' };
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
  // Elements
  // ---------------------------
  isField(el: any): boolean {
    return el?.type === 'FIELD';
  }

  fieldKey(el: any): string {
    return el?.type === 'FIELD' ? (el.field?.key || '') : '';
  }

  fieldInputType(el: any): string {
    return el?.type === 'FIELD' ? (el.field?.input_type || '') : '';
  }

  staticText(el: any): string {
    if (!el) return '';
    if (el.type === 'TITLE') return (el.text?.[this.defaultLanguage] || '');
    if (el.type === 'SUBTITLE') return (el.text?.[this.defaultLanguage] || '');
    if (el.type === 'TEXT_BLOCK') return (el.text?.[this.defaultLanguage] || '');
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
    if (index === null) {
      sec.elements.push(updated);
    } else {
      sec.elements[index] = updated;
    }
  }

  // ---------------------------
  // Actions (save/publish/preview)
  // ---------------------------
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

  async createNewFormAndDraft() {
    if (this.loading) return;

    this.loading = true;
    this.errorMsg = '';
    this.infoMsg = '';

    try {
      const created = await firstValueFrom(
        this.api.createForm({
          tenant_id: this.tenantId,
          name: this.formName,
          description: this.formDescription,
          status: this.formStatus,
          default_language: this.defaultLanguage,
        }).pipe(takeUntil(this.destroy$))
      );

      const formId = Number((created as any)?.id_form || (created as any)?.id);
      if (!formId) throw new Error('API não retornou id_form.');

      this.idForm = formId;

      const createdV = await firstValueFrom(
        this.api.createFormVersion({
          tenant_id: this.tenantId,
          id_form: this.idForm,
          status: 'DRAFT',
          schema_json: this.schema,
        }).pipe(takeUntil(this.destroy$))
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
    // Mantive aqui como estava na sua base (se você já adaptou as assinaturas, ok)
    // Se sua ApiService tiver updateForm/updateFormVersion, conecte aqui.
    this.infoMsg = 'Salvar rascunho ainda não foi ligado na sua ApiService.';
  }

  async publish() {
    this.infoMsg = 'Publicar ainda não foi ligado na sua ApiService.';
  }

  async createNewDraftFromCurrent() {
    if (!this.idForm) return;

    this.loading = true;
    this.errorMsg = '';
    this.infoMsg = '';

    try {
      const createdV = await firstValueFrom(
        this.api.createFormVersion({
          tenant_id: this.tenantId,
          id_form: this.idForm,
          status: 'DRAFT',
          schema_json: this.schema,
        }).pipe(takeUntil(this.destroy$))
      );

      this.idFormVersion = Number((createdV as any)?.id_form_version || (createdV as any)?.id);
      this.versionStatus = 'DRAFT';

      await this.refreshVersions();
      this.infoMsg = 'Novo rascunho criado a partir da versão atual.';
      this.tab = 'structure';
    } catch (e: any) {
      this.errorMsg = e?.message || 'Erro ao criar novo rascunho.';
    } finally {
      this.loading = false;
    }
  }
}
