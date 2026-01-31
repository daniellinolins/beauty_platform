import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  health() {
    return this.http.get<{ status: string; db: number }>(`${this.baseUrl}/health`);
  }

listForms(tenantId: number) {
  return this.http.get<any[]>(`${this.baseUrl}/forms?tenant_id=${tenantId}`);
}

getLatestFormVersion(tenantId: number, idForm: number) {
  return this.http.get<any>(`${this.baseUrl}/forms/${idForm}/versions/latest?tenant_id=${tenantId}`);
}

createSubmission(payload: any) {
  return this.http.post<any>(`${this.baseUrl}/form-submissions`, payload);
}

saveSubmissionPayload(idSubmission: number, tenantId: number, payloadJson: any) {
  return this.http.put<any>(`${this.baseUrl}/form-submissions/${idSubmission}/payload`, {
    tenant_id: tenantId,
    payload_json: payloadJson
  });
}



}
