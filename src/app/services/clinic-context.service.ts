import { Injectable } from '@angular/core';

export type ActiveClinic = {
  clinic_id: number;
  tenant_id: number;
  clinic_name?: string;
};

@Injectable({ providedIn: 'root' })
export class ClinicContextService {
  private storageKey = 'active_clinic';

  getActiveClinic(): ActiveClinic | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.clinic_id || !obj?.tenant_id) return null;
      return {
        clinic_id: Number(obj.clinic_id),
        tenant_id: Number(obj.tenant_id),
        clinic_name: obj.clinic_name || undefined,
      };
    } catch {
      return null;
    }
  }

  setActiveClinic(clinic: ActiveClinic) {
    localStorage.setItem(this.storageKey, JSON.stringify(clinic));
  }

  clearActiveClinic() {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Usa o /api/me/context já carregado para:
   * - se existir active_clinic salva e ainda existir no contexto, mantém
   * - senão, se houver 1 clínica, seta ela
   * Retorna:
   *  - 'NONE' (sem clínicas)
   *  - 'ONE' (setada automaticamente)
   *  - 'MANY' (precisa escolher)
   */
  initFromContext(ctx: any): 'NONE' | 'ONE' | 'MANY' {
    const clinics: any[] = Array.isArray(ctx?.clinics) ? ctx.clinics : [];
    if (!clinics.length) {
      this.clearActiveClinic();
      return 'NONE';
    }

    const current = this.getActiveClinic();
    if (current) {
      const stillExists = clinics.find((c) => Number(c?.clinic_id) === current.clinic_id);
      if (stillExists) {
        // mantém
        this.setActiveClinic({
          clinic_id: Number(stillExists.clinic_id),
          tenant_id: Number(stillExists.tenant_id),
          clinic_name: stillExists.clinic_name || stillExists.name || undefined,
        });
        return clinics.length === 1 ? 'ONE' : 'MANY';
      }
    }

    if (clinics.length === 1) {
      const c = clinics[0];
      this.setActiveClinic({
        clinic_id: Number(c.clinic_id),
        tenant_id: Number(c.tenant_id),
        clinic_name: c.clinic_name || c.name || undefined,
      });
      return 'ONE';
    }

    this.clearActiveClinic();
    return 'MANY';
  }
}
