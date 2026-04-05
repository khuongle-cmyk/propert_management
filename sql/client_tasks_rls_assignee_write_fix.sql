-- Fix: assignees could not save task updates (e.g. assign to self) because WITH CHECK
-- required can_manage_tenant_data only, while USING allowed assignee OR manager.
-- Also allow tenant members (same roles as task SELECT) to claim unassigned tasks by assigning to themselves.

drop policy if exists client_tasks_write on public.client_tasks;

create policy client_tasks_write on public.client_tasks
for all using (
  public.can_manage_tenant_data(client_tasks.tenant_id)
  or client_tasks.assigned_to_user_id = auth.uid()
  or (
    client_tasks.assigned_to_user_id is null
    and exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.tenant_id = client_tasks.tenant_id
        and lower(coalesce(m.role, '')) in (
          'owner',
          'manager',
          'customer_service',
          'accounting',
          'maintenance',
          'viewer',
          'super_admin'
        )
    )
  )
)
with check (
  public.can_manage_tenant_data(client_tasks.tenant_id)
  or client_tasks.assigned_to_user_id = auth.uid()
);
