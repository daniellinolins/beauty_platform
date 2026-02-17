import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api';

@Injectable({ providedIn: 'root' })
export class SessionService {
  context: any | null = null;

  constructor(private api: ApiService) {}

  async loadContext(): Promise<any> {
    const ctx = await firstValueFrom(this.api.meContext());
    this.context = ctx;
    return ctx;
  }

  clear() {
    this.context = null;
  }

  get userType(): string | null {
    return this.context?.user?.user_type ?? null;
  }

  get tenantId(): number | null {
    return this.context?.user?.tenant_id ?? null;
  }

  get clinics(): any[] {
    return Array.isArray(this.context?.clinics) ? this.context.clinics : [];
  }
}
