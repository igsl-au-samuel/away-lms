-- Access matrix row 25: health() is callable by anon and authenticated, touches no tables.
begin;
select plan(5);

select has_function('public', 'health', array[]::text[], 'health() exists');

select tests.as_anon();
select is(public.health(), true, 'anon: health() returns true');

select tests.as_authenticated('00000000-0000-0000-0000-0000000000aa');
select is(public.health(), true, 'authenticated with no profile: health() returns true');

select tests.reset_role();
select is(public.health(), true, 'postgres: health() returns true');

select is(
  (select prosecdef from pg_proc where oid = 'public.health()'::regprocedure),
  true,
  'health() is security definer'
);

select * from finish();
rollback;
