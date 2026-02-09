import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = `${environment.apiBaseUrl}/api`;

  constructor(private http: HttpClient) {}

  // -----------------------------
  // Forms (já existia)
  // -----------------------------
  listForms(tenantId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/forms`, { params: { tenant_id: tenantId } });
  }

  getLatestFormVersion(tenantId: number, idForm: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/forms/${idForm}/versions/latest`, {
      params: { tenant_id: tenantId },
    });
  }

  // ✅ NOVO: create form (builder)
  createForm(req: {
    tenant_id: number;
    name: string;
    description?: string;
    status?: string;
    default_language?: string;
    code?: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms`, req);
  }

  // ✅ NOVO: list versions (builder)
  listFormVersions(idForm: number, tenantId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/forms/${idForm}/versions`, {
      params: { tenant_id: tenantId },
    });
  }

  // ✅ NOVO: create version (builder)
  // (IMPORTANTE: assinatura com 1 argumento só, para bater com o TS do builder)
  createFormVersion(req: {
    tenant_id: number;
    id_form: number;
    status: string; // DRAFT / PUBLISHED
    schema_json: any;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms/${req.id_form}/versions`, req);
  }

  // ✅ NOVO: update version (seu backend pode ou não ter ainda)
  updateFormVersion(req: {
    tenant_id: number;
    id_form: number;
    id_form_version: number;
    status: string;
    schema_json: any;
  }): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/forms/${req.id_form}/versions/${req.id_form_version}`,
      req,
    );
  }

  // ✅ NOVO: publish version (seu backend pode ou não ter ainda)
  publishFormVersion(req: {
    tenant_id: number;
    id_form: number;
    id_form_version: number;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/forms/${req.id_form}/versions/${req.id_form_version}/publish`, req);
  }

  // -----------------------------
  // Submissions (já existia)
  // -----------------------------
  createSubmission(req: {
    tenant_id: number;
    clinic_id: number;
    client_id: number;
    id_form: number;
    id_form_version: number;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/form-submissions`, req);
  }

  saveSubmissionPayload(submissionId: number, tenantId: number, payload: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/form-submissions/${submissionId}/payload`, {
      tenant_id: tenantId,
      payload_json: payload,
    });
  }

  // -----------------------------
  // Files (já existia)
  // -----------------------------
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
