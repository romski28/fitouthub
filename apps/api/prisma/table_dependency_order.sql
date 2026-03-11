-- Generate dependency-aware import order for public tables
-- Run this in the SOURCE database (old DB) SQL editor.

-- 1) Direct FK dependency edges (child depends on parent)
WITH fk_edges AS (
  SELECT
    child_ns.nspname  AS child_schema,
    child_cls.relname AS child_table,
    parent_ns.nspname AS parent_schema,
    parent_cls.relname AS parent_table,
    c.conname         AS constraint_name
  FROM pg_constraint c
  JOIN pg_class child_cls   ON child_cls.oid = c.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child_cls.relnamespace
  JOIN pg_class parent_cls  ON parent_cls.oid = c.confrelid
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent_cls.relnamespace
  WHERE c.contype = 'f'
    AND child_ns.nspname = 'public'
    AND parent_ns.nspname = 'public'
)
SELECT *
FROM fk_edges
ORDER BY parent_table, child_table;

-- 2) Topological-ish level per table (parents get lower level)
-- If table A depends on B, A should have a higher level than B.
WITH RECURSIVE
all_tables AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),
fk_edges AS (
  SELECT
    child_ns.nspname  AS child_schema,
    child_cls.relname AS child_table,
    parent_ns.nspname AS parent_schema,
    parent_cls.relname AS parent_table
  FROM pg_constraint c
  JOIN pg_class child_cls   ON child_cls.oid = c.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child_cls.relnamespace
  JOIN pg_class parent_cls  ON parent_cls.oid = c.confrelid
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent_cls.relnamespace
  WHERE c.contype = 'f'
    AND child_ns.nspname = 'public'
    AND parent_ns.nspname = 'public'
),
roots AS (
  -- tables with no outgoing dependency (i.e., do not depend on any other table)
  SELECT t.schema_name, t.table_name
  FROM all_tables t
  LEFT JOIN fk_edges e
    ON e.child_schema = t.schema_name
   AND e.child_table = t.table_name
  WHERE e.child_table IS NULL
),
walk AS (
  SELECT r.schema_name, r.table_name, 0::int AS lvl
  FROM roots r
  UNION ALL
  SELECT e.child_schema, e.child_table, w.lvl + 1
  FROM walk w
  JOIN fk_edges e
    ON e.parent_schema = w.schema_name
   AND e.parent_table = w.table_name
),
ranked AS (
  SELECT schema_name, table_name, MAX(lvl) AS level
  FROM walk
  GROUP BY schema_name, table_name
),
unreached AS (
  -- cyclic/self-referential tables may not be reached from roots
  SELECT t.schema_name, t.table_name
  FROM all_tables t
  LEFT JOIN ranked r
    ON r.schema_name = t.schema_name
   AND r.table_name = t.table_name
  WHERE r.table_name IS NULL
)
SELECT
  r.schema_name,
  r.table_name,
  r.level,
  'OK'::text AS status
FROM ranked r
UNION ALL
SELECT
  u.schema_name,
  u.table_name,
  9999 AS level,
  'CYCLE_OR_UNREACHABLE'::text AS status
FROM unreached u
ORDER BY level, table_name;

-- 3) SQL lines you can copy to export table data in dependency order
WITH RECURSIVE
all_tables AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),
fk_edges AS (
  SELECT
    child_ns.nspname  AS child_schema,
    child_cls.relname AS child_table,
    parent_ns.nspname AS parent_schema,
    parent_cls.relname AS parent_table
  FROM pg_constraint c
  JOIN pg_class child_cls   ON child_cls.oid = c.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child_cls.relnamespace
  JOIN pg_class parent_cls  ON parent_cls.oid = c.confrelid
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent_cls.relnamespace
  WHERE c.contype = 'f'
    AND child_ns.nspname = 'public'
    AND parent_ns.nspname = 'public'
),
roots AS (
  SELECT t.schema_name, t.table_name
  FROM all_tables t
  LEFT JOIN fk_edges e
    ON e.child_schema = t.schema_name
   AND e.child_table = t.table_name
  WHERE e.child_table IS NULL
),
walk AS (
  SELECT r.schema_name, r.table_name, 0::int AS lvl
  FROM roots r
  UNION ALL
  SELECT e.child_schema, e.child_table, w.lvl + 1
  FROM walk w
  JOIN fk_edges e
    ON e.parent_schema = w.schema_name
   AND e.parent_table = w.table_name
),
ranked AS (
  SELECT schema_name, table_name, MAX(lvl) AS level
  FROM walk
  GROUP BY schema_name, table_name
),
unreached AS (
  SELECT t.schema_name, t.table_name
  FROM all_tables t
  LEFT JOIN ranked r
    ON r.schema_name = t.schema_name
   AND r.table_name = t.table_name
  WHERE r.table_name IS NULL
),
ordered AS (
  SELECT schema_name, table_name, level
  FROM ranked
  UNION ALL
  SELECT schema_name, table_name, 9999 AS level
  FROM unreached
)
SELECT
  'TABLE ' || quote_ident(schema_name) || '.' || quote_ident(table_name) ||
  ' | ORDER=' || level ||
  CASE WHEN level = 9999 THEN ' | HANDLE MANUALLY (cycle/self-ref)' ELSE '' END AS import_order_line
FROM ordered
ORDER BY level, table_name;
