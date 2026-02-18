import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type FormStatus = 'ACTIVE' | 'INACTIVE';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = `${environment.apiBaseUrl}/api`;

  constructor(private http: HttpClient) {}

  // -------------------------------
  // AUTH / SESSION
  // -------------------------------
  login(emailOrPhone: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/auth/login`, {
      email_or_phone: emailOrPhone,
      password,
    });
  }

  meContext(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/me/context`);
  }

  // -------------------------------
  // LEGACY (mantido para não quebrar)
  // -------------------------------
  listForms(tenantId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forms`, {
      params: { tenant_id: tenantId },
    });
  }

  listFormVersions(tenantId: number, idForm: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forms/${idForm}/versions`, {
      params: { tenant_id: tenantId },
    });
  }

  getLatestFormVersion(
    tenantId: number,
    idForm: number,
  ): Observable<any | null> {
    return this.listFormVersions(tenantId, idForm).pipe(
      map((list) => (Array.isArray(list) && list.length ? list[0] : null)),
    );
  }

  createForm(req: {
    tenant_id: number;
    name: string;
    description?: string;
    status?: FormStatus;
    default_language?: string;
    code?: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms`, req);
  }

  updateForm(
    formId: number,
    req: {
      tenant_id: number;
      name?: string;
      description?: string;
      status?: FormStatus;
      default_language?: string;
      code?: string;
    },
  ): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/forms/${formId}`, req);
  }

  updateFormVersion(
    formId: number,
    formVersionId: number,
    req: {
      tenant_id: number;
      version_status?: VersionStatus;
      schema_json?: any;
    },
  ): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/forms/${formId}/versions/${formVersionId}`,
      req,
    );
  }

  createFormVersion(req: {
    tenant_id: number;
    id_form: number;
    schema_json: any;
    status?: VersionStatus;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms/${req.id_form}/versions`, {
      tenant_id: req.tenant_id,
      version_status: (req.status || 'DRAFT') as VersionStatus,
      schema_json: req.schema_json,
    });
  }

  getFormVersion(
    formId: number,
    versionId: number,
    tenantId: number,
  ): Observable<any> {
    return this.http.get(
      `${this.baseUrl}/forms/${formId}/versions/${versionId}`,
      {
        params: { tenant_id: tenantId },
      },
    );
  }

  /**
   * ✅ FIX: backend legado exige tenant_id no BODY (não só na querystring).
   * Mantemos mode na query.
   */
  publishFormVersion(req: {
    tenant_id: number;
    id_form: number;
    id_form_version: number;
    mode?: 'replace' | 'error';
    schema_obj?: any; // opcional: ajuda validação no backend
  }): Observable<any> {
    const mode = req.mode || 'replace';

    // ✅ tenant_id no body
    const body: any = { tenant_id: req.tenant_id };
    if (req.schema_obj) body.schema_obj = req.schema_obj;

    return this.http.post(
      `${this.baseUrl}/forms/${req.id_form}/versions/${req.id_form_version}/publish`,
      body,
      { params: { mode } },
    );
  }

  saveDraftFormVersion(
    tenantId: number,
    formId: number,
    payload: {
      version_id?: number | null;
      schema_json: any;
      checksum_sha256?: string;
    },
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms/${formId}/versions/draft`, {
      tenant_id: tenantId,
      version_id: payload.version_id ?? null,
      schema_json: payload.schema_json,
      checksum_sha256: payload.checksum_sha256,
    });
  }

  /**
   * LEGACY submission (mantido)
   */
  createSubmission(req: {
    tenant_id: number;
    clinic_id: number;
    client_id: number;
    id_form: number;
    id_form_version: number;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/form-submissions`, req);
  }

  saveSubmissionPayload(
    submissionId: number,
    tenantId: number,
    payload: any,
  ): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/form-submissions/${submissionId}/payload`,
      {
        tenant_id: tenantId,
        payload_json: payload,
      },
    );
  }

  uploadFile(
    tenantId: number,
    blobOrFile: Blob,
    filename: string,
    category: string,
    purpose: string,
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', blobOrFile, filename);
    fd.append('tenant_id', String(tenantId));
    fd.append('category', category);
    fd.append('purpose', purpose);
    return this.http.post(`${this.baseUrl}/files`, fd);
  }

  // -------------------------------
  // SECURE (recomendado)
  // -------------------------------
  secureCreateSubmission(req: {
    clinic_id: number;
    client_id?: number; // obrigatório para clínica, opcional para CLIENT
    id_form: number;
    id_form_version: number;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/secure/form-submissions`, req);
  }

  secureSaveSubmissionPayload(id: number, payload: any): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/secure/form-submissions/${id}/payload`,
      {
        payload_json: payload,
      },
    );
  }

  secureFinalizeSubmission(id: number): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/secure/form-submissions/${id}/finalize`,
      {},
    );
  }

  // -------------------------------
  // CLIENTS (secure)
  // -------------------------------
  secureListClinicClients(
    clinicId: number,
    status: 'ACTIVE' | 'PENDING' | 'ALL' = 'ACTIVE',
  ): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.baseUrl}/secure/clinics/${clinicId}/clients`,
      { params: { status } },
    );
  }

  secureRequestLinkExistingClient(
    clinicId: number,
    emailOrPhone: string,
    channel: 'INBOX' | 'EMAIL' = 'INBOX',
  ): Observable<any> {
    return this.http.post<any>(
      `${this.baseUrl}/secure/clinics/${clinicId}/clients/request-link`,
      { email_or_phone: emailOrPhone, channel },
    );
  }

  secureCreateClientAndRequestLink(
    clinicId: number,
    req: {
      full_name: string;
      email: string;
      phone?: string;
      temp_password?: string;
      channel?: 'INBOX' | 'EMAIL';
    },
  ): Observable<any> {
    return this.http.post<any>(
      `${this.baseUrl}/secure/clinics/${clinicId}/clients/create-and-request-link`,
      req,
    );
  }
}
