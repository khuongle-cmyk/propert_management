/**
 * Creates an internal task in client_tasks when invoice generation fails.
 * Called from generateFirstInvoicesOnSign() and any other auto-invoicing flow.
 *
 * Assignment priority:
 *   1. First property_staff member with role 'accounting' at the property
 *   2. Fall back to first tenant membership with role 'accounting' / 'owner' / 'super_admin'
 *   3. If no assignee found, task is unassigned but still created (for the tasks board)
 *
 * Never throws — if task creation itself fails, logs and returns null.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function createInvoiceFailureTask(params: {
  supabase: SupabaseClient;
  contractId: string;
  tenantId: string | null;
  propertyId: string | null;
  title: string;
  details: string;
}): Promise<string | null> {
  const { supabase, contractId, tenantId, propertyId, title, details } = params;

  try {
    if (!tenantId) {
      console.error(
        "[createInvoiceFailureTask] cannot create task: missing tenantId",
        { contractId, title },
      );
      return null;
    }

    // Resolve assignee
    let assigneeUserId: string | null = null;

    // Try property_staff with accounting role first
    if (propertyId) {
      const { data: propStaff } = await supabase
        .from("property_staff")
        .select("user_id,role")
        .eq("property_id", propertyId)
        .eq("role", "accounting")
        .limit(1)
        .maybeSingle();

      if (propStaff?.user_id) {
        assigneeUserId = propStaff.user_id;
      }
    }

    // Fall back to tenant-level accounting / owner / super_admin
    if (!assigneeUserId) {
      const { data: memberships } = await supabase
        .from("memberships")
        .select("user_id,role")
        .eq("tenant_id", tenantId);

      if (memberships && memberships.length > 0) {
        // Priority: accounting > owner > super_admin
        const byPriority = ["accounting", "owner", "super_admin"];
        for (const targetRole of byPriority) {
          const match = memberships.find(
            (m) => String(m.role).toLowerCase().trim() === targetRole,
          );
          if (match?.user_id) {
            assigneeUserId = match.user_id;
            break;
          }
        }
      }
    }

    // Create the task
    const { data: task, error: taskErr } = await supabase
      .from("client_tasks")
      .insert({
        tenant_id: tenantId,
        contract_id: contractId,
        property_id: propertyId,
        title,
        description: `Automatic invoice generation failed.\n\nDetails:\n${details}\n\nPlease review the contract and generate the invoice manually from the invoicing page.`,
        category: "invoicing",
        type: "internal",
        priority: "high",
        status: "todo",
        assigned_to_user_id: assigneeUserId,
        due_date: todayPlusDays(1),
        source: "auto_invoicing_failure",
      })
      .select("id")
      .single();

    if (taskErr || !task) {
      console.error(
        "[createInvoiceFailureTask] failed to insert task:",
        taskErr,
      );
      return null;
    }

    console.log(
      `[createInvoiceFailureTask] created task ${task.id} for contract ${contractId}`,
    );
    return task.id;
  } catch (e) {
    console.error("[createInvoiceFailureTask] unexpected error:", e);
    return null;
  }
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}