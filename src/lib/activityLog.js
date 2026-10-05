import { base44 } from "@/api/base44Client";

// Single shared helper so every create/update/delete/status change writes one
// consistent Activity entry (user, time, action, record, old->new).
export async function logActivity({ project_id, visi_id, user, text, type = "comment" }) {
  try {
    await base44.entities.Activity.create({
      project_id, visi_id, user, text, type, created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("activity log failed", e);
  }
}