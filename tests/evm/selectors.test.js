import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signatureLines, functionSelector, eventTopic } from '../../src/evm/selectors/selectors.js';

test('one signature per non-empty line', () => {
  assert.deepEqual(signatureLines('  a()\n\n b() \n'), ['a()', 'b()']);
});

test('well-known ERC-20 function selectors (the page example)', () => {
  const t = functionSelector('function transfer(address to, uint256 amount) external returns (bool);');
  assert.equal(t.canonical, 'transfer(address,uint256)');
  assert.equal(t.isEvent, false);
  assert.equal(t.value, '0xa9059cbb');
  assert.equal(t.hash, '0xa9059cbb2ab09eb219583f4a59a5d0623ade346d962bcd4e46b11da047c9049b');
  // `uint` is an alias for uint256.
  const a = functionSelector('approve(address spender, uint amount)');
  assert.equal(a.canonical, 'approve(address,uint256)');
  assert.equal(a.value, '0x095ea7b3');
  assert.equal(functionSelector('balanceOf(address)').value, '0x70a08231');
  assert.equal(functionSelector('transferFrom(address,address,uint256)').value, '0x23b872dd');
  assert.equal(functionSelector('supportsInterface(bytes4)').value, '0x01ffc9a7');
});

test('an event on the Functions tab gives its topic', () => {
  const r = functionSelector('event Transfer(address indexed from, address indexed to, uint256 value)');
  assert.equal(r.isEvent, true);
  assert.equal(r.value, '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
});

test('well-known ERC-20 event topics and log layout (the page example)', () => {
  const t = eventTopic('event Transfer(address indexed from, address indexed to, uint256 value);');
  assert.equal(t.canonical, 'Transfer(address,address,uint256)');
  assert.equal(t.topic, '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
  assert.equal(t.layout, 'topic 0 = event hash\ntopic 1 = from\ntopic 2 = to\ndata = value');
  assert.equal(t.tooMany, false);
  const a = eventTopic('event Approval(address indexed owner, address indexed spender, uint256 value)');
  assert.equal(a.topic, '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925');
});

test('event layout with unnamed and no data parameters', () => {
  assert.equal(eventTopic('event E(address indexed, uint256)').layout, 'topic 0 = event hash\ntopic 1 = #0\ndata = #1');
  assert.equal(eventTopic('event E()').layout, 'topic 0 = event hash\ndata = (empty)');
});

test('more than 3 indexed parameters is flagged', () => {
  const r = eventTopic('event E(uint indexed a, uint indexed b, uint indexed c, uint indexed d)');
  assert.equal(r.tooMany, true);
  assert.equal(r.layout, 'Too many indexed parameters: an event can have at most 3 (4 if anonymous).');
});

test('errors', () => {
  assert.throws(() => functionSelector('(address,uint256)'), /Missing function name/);
  assert.throws(() => eventTopic('(address)'), /Missing event name/);
  assert.throws(() => functionSelector('transfer(address,uint257)'));
  assert.throws(() => functionSelector('transfer(address'));
});
