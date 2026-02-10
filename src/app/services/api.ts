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
    // backend currently has only /versions (list). We pick the first (DESC) as "latest".
    return this.listFormVersions(tenantId, idForm).pipe(
      map((list) => (Array.isArray(list) && list.length ? list[0] : null)),
    );
  }

  createForm(req: {
    tenant_id: number;
    name: string;
    description?: string;
    status?: FormStatus;
    default_language?: string; //'pt' | 'en';
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
    req: { tenant_id: number; version_status?: VersionStatus; schema_json?: any },
  ): Observable<any> {
    return this.http.put(`${this.baseUrl}/forms/${formId}/versions/${formVersionId}`, req);
  }  

  createFormVersion(req: {
    tenant_id: number;
    id_form: number;
    schema_json: any;
    status?: VersionStatus; // frontend convenience (builder uses "status")
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms/${req.id_form}/versions`, {
      tenant_id: req.tenant_id,
      version_status: (req.status || 'DRAFT') as VersionStatus,
      schema_json: req.schema_json,
    });
  }

  publishFormVersion(req: {
    tenant_id: number;
    id_form: number;
    id_form_version: number;
  }): Observable<any> {
    // Requires a backend route: POST /api/forms/:id_form/versions/:id_form_version/publish?tenant_id=...
    return this.http.post(
      `${this.baseUrl}/forms/${req.id_form}/versions/${req.id_form_version}/publish`,
      null,
      {
        params: { tenant_id: req.tenant_id },
      },
    );
  }

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
}
