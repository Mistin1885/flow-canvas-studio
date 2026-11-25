-- Compare logical table contents, including JSONB, bytea archives and edit receipts.
SELECT format(
  'SELECT %L, count(*), md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(r)::text) AS h FROM %I.%I AS r) AS rows',
  tablename, schemaname, tablename
)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
