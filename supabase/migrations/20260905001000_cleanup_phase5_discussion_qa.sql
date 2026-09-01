-- Remove only the automatically named temporary workspaces left by an
-- interrupted Phase 5.2 Realtime QA run. Production workspace names cannot
-- match this deliberately narrow generated-name pattern accidentally.

do $$
begin
  perform set_config('seventwo.owner_transfer', 'on', true);

  delete from public.workspaces workspace
  where workspace.created_at >= timestamptz '2026-09-01 00:00:00+00'
    and (
      workspace.name ~ '^Discussion QA [0-9]{13}-[0-9a-f]{8}$'
      or workspace.name ~ '^Discussion isolation [0-9]{13}-[0-9a-f]{8}$'
    );
end;
$$;
