import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { supportedDialects, formatSql } from '../../src/dev/sql-formatter/sql-formatter.js';
import { InputError } from '../../src/dev/lib/ui.js';

// The page loads this UMD bundle as a classic script (window.sqlFormatter).
const lib = createRequire(import.meta.url)('../../src/assets/vendor/sql-formatter@15.9.0/dist/sql-formatter.min.js');

const EXAMPLE = "select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.created_at > '2024-01-01' and u.status in ('active','trial') group by u.id, u.name having count(o.id) > 2 order by orders desc limit 10;";

test('every dialect offered on the page is supported by the bundled build', () => {
  const s = supportedDialects(lib);
  for (const d of ['sql', 'postgresql', 'mysql', 'mariadb', 'sqlite', 'transactsql', 'plsql', 'bigquery', 'snowflake', 'redshift', 'spark', 'hive', 'trino', 'db2', 'clickhouse', 'duckdb']) assert.ok(s.has(d), d);
  assert.equal(supportedDialects({}).size, 0);
});

test('example query', () => {
  assert.equal(formatSql(lib, EXAMPLE), [
    'SELECT', '  u.id,', '  u.name,', '  count(o.id) AS orders', 'FROM', '  users u',
    '  LEFT JOIN orders o ON o.user_id = u.id', 'WHERE', "  u.created_at > '2024-01-01'", "  AND u.status IN ('active', 'trial')",
    'GROUP BY', '  u.id,', '  u.name', 'HAVING', '  count(o.id) > 2', 'ORDER BY', '  orders DESC', 'LIMIT', '  10;',
  ].join('\n'));
});

test('keyword case and indentation options', () => {
  assert.equal(formatSql(lib, 'SELECT a FROM t', { kw: 'lower', indent: '4' }), 'select\n    a\nfrom\n    t');
  assert.equal(formatSql(lib, 'Select a From t', { kw: 'preserve' }), 'Select\n  a\nFrom\n  t');
  assert.equal(formatSql(lib, 'select a from t', { indent: 'tab' }), 'SELECT\n\ta\nFROM\n\tt');
});

test('dialect-specific syntax', () => {
  assert.match(formatSql(lib, 'select `a` from `t`', { dialect: 'mysql' }), /`a`/);
  assert.match(formatSql(lib, 'select [a] from [t]', { dialect: 'transactsql' }), /\[a\]/);
});

test('errors', () => {
  assert.throws(() => formatSql(lib, '  '), e => e instanceof InputError && e.message === 'Paste some SQL.');
  assert.throws(() => formatSql(lib, 'select ('), /^Error: Could not format: Parse error at token: «EOF» at line 1 column 9$/);
  assert.throws(() => formatSql(lib, 'select 1', { dialect: 'nope' }), /Could not format: Unsupported SQL dialect: nope/);
});
