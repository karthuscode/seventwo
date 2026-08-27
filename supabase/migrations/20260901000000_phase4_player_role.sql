-- Phase 4, part 1: add the registered-player role separately so PostgreSQL can
-- commit the enum value before later policies and functions use it.

alter type public.workspace_role add value if not exists 'PLAYER';
