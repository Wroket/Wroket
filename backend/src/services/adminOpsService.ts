import { getStore } from "../persistence";
import { getActiveSessions } from "./authService";
import { getReadinessStatus, type ReadinessStatus } from "./healthService";

export interface AdminPricingLead {
  email: string;
  lastSubmittedAt: string;
  lastTier: string | null;
}

export interface AdminPricingLeadsSnapshot {
  leads: AdminPricingLead[];
  last7d: number;
  last30d: number;
}

export interface AdminOpsSnapshot extends ReadinessStatus {
  sessions: {
    total: number;
    usersWithMultiple: number;
  };
}

export function getAdminPricingLeads(): AdminPricingLeadsSnapshot {
  const store = getStore();
  const raw = store.pricingContactLeads ?? {};
  const now = Date.now();
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;
  let last7d = 0;
  let last30d = 0;

  const leads: AdminPricingLead[] = Object.entries(raw).map(([email, row]) => {
    const submittedMs = new Date(row.lastSubmittedAt).getTime();
    if (submittedMs >= d7) last7d++;
    if (submittedMs >= d30) last30d++;
    return {
      email,
      lastSubmittedAt: row.lastSubmittedAt,
      lastTier: row.lastTier ?? null,
    };
  });

  leads.sort((a, b) => new Date(b.lastSubmittedAt).getTime() - new Date(a.lastSubmittedAt).getTime());

  return { leads, last7d, last30d };
}

export async function getAdminOpsSnapshot(): Promise<AdminOpsSnapshot> {
  const readiness = await getReadinessStatus();
  const sessions = getActiveSessions();
  const countByUid = new Map<string, number>();
  for (const s of sessions) {
    countByUid.set(s.uid, (countByUid.get(s.uid) ?? 0) + 1);
  }
  let usersWithMultiple = 0;
  for (const n of countByUid.values()) {
    if (n > 1) usersWithMultiple++;
  }

  return {
    ...readiness,
    sessions: {
      total: sessions.length,
      usersWithMultiple,
    },
  };
}
