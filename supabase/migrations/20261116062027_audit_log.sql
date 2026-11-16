-- Spec 002 migration A1 (A009): the audit table, its append-only guards and its one
-- visibility policy. Shape per specs/002-transaction-audit/data-model.md; the reasoning
-- behind each choice is research R4 (shape), R5 (append-only) and R6 (visibility).
--
-- No foreign keys on purpose: ids are plain uuids with name and role snapshots, so
-- deleting a person, request or leave type never reaches into the log (FR-012, FR-013).

create table public.audit_log (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  actor_id        uuid,
  actor_role      public.app_role,
  actor_name      text not null,
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  subject_id      uuid,
  subject_name    text,
  before          jsonb,
  after           jsonb,
  context         jsonb,
  comment         text,
  is_demo         boolean not null default false,
  is_backfilled   boolean not null default false,
  source_key      text,
  constraint audit_log_comment_length check (char_length(comment) <= 500),
  constraint audit_log_action_known check (action in (
    'request_submitted', 'request_approved', 'request_declined',
    'allowance_set', 'allowance_removed',
    'user_created', 'user_role_changed', 'user_region_changed', 'user_active_changed',
    'leave_type_default_changed', 'leave_type_changed'
  )),
  constraint audit_log_entity_known check (entity in (
    'leave_request', 'allowance', 'user', 'leave_type'
  ))
);

-- Order is (created_at desc, id desc) everywhere: created_at carries the change's own
-- timestamp, and id breaks ties so paging never skips or repeats a row.
create index audit_log_recent_idx on public.audit_log (created_at desc, id desc);
create index audit_log_subject_idx on public.audit_log (subject_id, created_at desc, id desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc, id desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);
-- Live entries leave source_key null; Postgres allows many nulls in a unique index.
create unique index audit_log_source_key_idx on public.audit_log (source_key)
  where source_key is not null;

alter table public.audit_log enable row level security;

-- R5 step 1: grants stop the API roles before anything else is considered. This covers
-- truncate too, which ignores RLS (ADR 0009). Writing happens only through
-- private.audit_write, which runs as the table owner.
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated;

-- R5 step 4: defence in depth. The grants stop the API roles, but the secret key and a
-- direct SQL session are stopped here too, which is what FR-005's "by any route" needs.
create function private.audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'audit_immutable',
    detail = 'audit entries are append-only; a migration may drop the trigger, nothing else';
end;
$$;

revoke all on function private.audit_immutable() from public, anon, authenticated, service_role;

create trigger audit_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.audit_immutable();

create trigger audit_no_truncate
  before truncate on public.audit_log
  execute function private.audit_immutable();

-- R6: the whole visibility rule in one place, so the policy and any later read function
-- cannot drift from it. Returns false for a caller with no active profile, which is how
-- inactive users (X) and anon get no rows.
create function private.can_view_audit(p_actor uuid, p_subject uuid, p_entity text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- An active admin sees everything.
    when private.current_role() = 'admin' then true
    -- anon, inactive, or a uid with no profile.
    when private.current_role() is null then false
    -- Everyone with a role sees entries they made and entries about them (FR-020).
    when p_actor = auth.uid() or p_subject = auth.uid() then true
    -- Leave-type defaults belong to everybody.
    when p_action = 'leave_type_default_changed' then true
    -- A manager additionally sees the request and allowance entries for the people whose
    -- leave they can decide: ADR 0010's rule, read against the subject's current role.
    -- Another manager's entries, and the manager's own as a non-subject, stay hidden.
    when private.current_role() = 'manager'
         and p_entity in ('leave_request', 'allowance')
         and p_subject is not null
         and p_subject <> auth.uid()
         and exists (
           select 1
           from public.profiles subject
           where subject.id = p_subject
             and subject.role in ('employee', 'admin')
         )
    then true
    else false
  end;
$$;

revoke all on function private.can_view_audit(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
-- The policy is evaluated as the calling role, so authenticated needs this one call.
grant execute on function private.can_view_audit(uuid, uuid, text, text) to authenticated;

-- The single policy: select only, so there is no insert, update or delete route at all.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.can_view_audit(actor_id, subject_id, entity, action));
