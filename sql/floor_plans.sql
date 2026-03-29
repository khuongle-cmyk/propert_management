-- =====================================================================
-- Floor plans: editor + viewer, linked to properties and bookable_spaces.
-- Run after: properties, bookable_spaces, memberships, touch_updated_at().
-- Storage: bucket floor-plan-backgrounds (policies below).
-- =====================================================================

-- ---- floor_plans ------------------------------------------------------
create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  floor_number integer not null default 0,
  width_meters numeric(12, 4) not null default 20,
  height_meters numeric(12, 4) not null default 15,
  scale numeric(12, 4) not null default 100,
  background_image_url text,
  background_opacity numeric(5, 4) not null default 0.5,
  show_background boolean not null default true,
  canvas_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists floor_plans_tenant_idx on public.floor_plans (tenant_id);
create index if not exists floor_plans_property_idx on public.floor_plans (property_id);
create index if not exists floor_plans_property_floor_idx on public.floor_plans (property_id, floor_number);

-- ---- floor_plan_rooms -------------------------------------------------
create table if not exists public.floor_plan_rooms (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  bookable_space_id uuid references public.bookable_spaces(id) on delete set null,
  room_number text not null default '',
  room_name text not null default '',
  room_type text not null default 'office' check (
    room_type in (
      'office', 'meeting_room', 'hot_desk', 'venue', 'corridor',
      'bathroom', 'kitchen', 'storage', 'other'
    )
  ),
  x numeric(14, 4) not null default 0,
  y numeric(14, 4) not null default 0,
  width numeric(14, 4) not null default 40,
  height numeric(14, 4) not null default 40,
  rotation numeric(14, 4) not null default 0,
  color text,
  shape text not null default 'rect' check (shape in ('rect', 'polygon')),
  polygon_points jsonb,
  label_x numeric(14, 4),
  label_y numeric(14, 4),
  is_rentable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists floor_plan_rooms_plan_idx on public.floor_plan_rooms (floor_plan_id);
create index if not exists floor_plan_rooms_space_idx on public.floor_plan_rooms (bookable_space_id);

-- ---- floor_plan_elements ----------------------------------------------
create table if not exists public.floor_plan_elements (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  element_type text not null check (
    element_type in (
      'wall', 'door', 'window', 'staircase', 'elevator', 'pillar',
      'text_label', 'dimension_line', 'arrow'
    )
  ),
  x numeric(14, 4) not null default 0,
  y numeric(14, 4) not null default 0,
  width numeric(14, 4),
  height numeric(14, 4),
  rotation numeric(14, 4) not null default 0,
  points jsonb,
  style jsonb not null default '{}'::jsonb,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists floor_plan_elements_plan_idx on public.floor_plan_elements (floor_plan_id);

-- ---- Triggers ---------------------------------------------------------
drop trigger if exists trg_floor_plans_touch on public.floor_plans;
create trigger trg_floor_plans_touch
before update on public.floor_plans
for each row execute function public.touch_updated_at();

drop trigger if exists trg_floor_plan_rooms_touch on public.floor_plan_rooms;
create trigger trg_floor_plan_rooms_touch
before update on public.floor_plan_rooms
for each row execute function public.touch_updated_at();

-- ---- RLS --------------------------------------------------------------
alter table public.floor_plans enable row level security;
alter table public.floor_plan_rooms enable row level security;
alter table public.floor_plan_elements enable row level security;

drop policy if exists floor_plans_select on public.floor_plans;
create policy floor_plans_select on public.floor_plans for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.tenant_id = floor_plans.tenant_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer',
        'agent', 'super_admin', 'maintenance', 'tenant'
      )
  )
);

drop policy if exists floor_plans_write on public.floor_plans;
create policy floor_plans_write on public.floor_plans for all using (
  public.can_manage_tenant_data(floor_plans.tenant_id)
) with check (
  public.can_manage_tenant_data(floor_plans.tenant_id)
);

drop policy if exists floor_plan_rooms_select on public.floor_plan_rooms;
create policy floor_plan_rooms_select on public.floor_plan_rooms for select using (
  exists (
    select 1 from public.floor_plans fp
    join public.memberships m on m.tenant_id = fp.tenant_id and m.user_id = auth.uid()
    where fp.id = floor_plan_rooms.floor_plan_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer',
        'agent', 'super_admin', 'maintenance', 'tenant'
      )
  )
);

drop policy if exists floor_plan_rooms_write on public.floor_plan_rooms;
create policy floor_plan_rooms_write on public.floor_plan_rooms for all using (
  exists (
    select 1 from public.floor_plans fp
    where fp.id = floor_plan_rooms.floor_plan_id
      and public.can_manage_tenant_data(fp.tenant_id)
  )
) with check (
  exists (
    select 1 from public.floor_plans fp
    where fp.id = floor_plan_rooms.floor_plan_id
      and public.can_manage_tenant_data(fp.tenant_id)
  )
);

drop policy if exists floor_plan_elements_select on public.floor_plan_elements;
create policy floor_plan_elements_select on public.floor_plan_elements for select using (
  exists (
    select 1 from public.floor_plans fp
    join public.memberships m on m.tenant_id = fp.tenant_id and m.user_id = auth.uid()
    where fp.id = floor_plan_elements.floor_plan_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer',
        'agent', 'super_admin', 'maintenance', 'tenant'
      )
  )
);

drop policy if exists floor_plan_elements_write on public.floor_plan_elements;
create policy floor_plan_elements_write on public.floor_plan_elements for all using (
  exists (
    select 1 from public.floor_plans fp
    where fp.id = floor_plan_elements.floor_plan_id
      and public.can_manage_tenant_data(fp.tenant_id)
  )
) with check (
  exists (
    select 1 from public.floor_plans fp
    where fp.id = floor_plan_elements.floor_plan_id
      and public.can_manage_tenant_data(fp.tenant_id)
  )
);

-- ---- Storage bucket (background images / PDF raster) ------------------
insert into storage.buckets (id, name, public)
values ('floor-plan-backgrounds', 'floor-plan-backgrounds', true)
on conflict (id) do nothing;

drop policy if exists "floor plan backgrounds public read" on storage.objects;
create policy "floor plan backgrounds public read"
on storage.objects
for select
to public
using (bucket_id = 'floor-plan-backgrounds');

drop policy if exists "floor plan backgrounds authenticated upload" on storage.objects;
create policy "floor plan backgrounds authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'floor-plan-backgrounds'
  and (
    exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and lower(m.role) in ('owner', 'manager')
    )
  )
);

drop policy if exists "floor plan backgrounds authenticated update" on storage.objects;
create policy "floor plan backgrounds authenticated update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'floor-plan-backgrounds'
  and (
    exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and lower(m.role) in ('owner', 'manager')
    )
  )
);

drop policy if exists "floor plan backgrounds authenticated delete" on storage.objects;
create policy "floor plan backgrounds authenticated delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'floor-plan-backgrounds'
  and (
    exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and lower(m.role) in ('owner', 'manager')
    )
  )
);

comment on table public.floor_plans is 'Konva floor plan per property floor; canvas_data optional mirror of editor state.';
comment on table public.floor_plan_rooms is 'Rooms/shapes on a floor plan; may link to bookable_spaces.';
comment on table public.floor_plan_elements is 'Walls, doors, labels, and annotations on a floor plan.';
