import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  health() {
    return this.http.get<{ status: string; db: number }>(
      `${this.baseUrl}/api/health`,
    );
  }

  listForms(tenantId: number) {
    return this.http.get<any[]>(`${this.baseUrl}/api/forms?tenant_id=${tenantId}`);
  }

  getLatestFormVersion(tenantId: number, idForm: number) {
    return this.http.get<any>(
      `${this.baseUrl}/api/forms/${idForm}/versions/latest?tenant_id=${tenantId}`,
    );
  }

  createSubmission(payload: any) {
    return this.http.post<any>(`${this.baseUrl}/api/form-submissions`, payload);
  }

  saveSubmissionPayload(
    idSubmission: number,
    tenantId: number,
    payloadJson: any,
  ) {
    return this.http.put<any>(
      `${this.baseUrl}/api/form-submissions/${idSubmission}/payload`,
      {
        tenant_id: tenantId,
        payload_json: payloadJson,
      },
    );
  }

  uploadFile(
    tenantId: number,
    blob: Blob,
    filename: string,
    category: 'signatures' | 'photos' | 'pdfs',
    purpose?: string,
  ) {
    const form = new FormData();
    form.append('tenant_id', String(tenantId));
    form.append('category', category);
    if (purpose) form.append('purpose', purpose);
    form.append('file', blob, filename);

    return this.http.post<any>(`${this.baseUrl}/api/files`, form);
  }
}
