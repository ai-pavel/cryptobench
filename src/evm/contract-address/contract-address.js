// Contract Address: compute the address of a contract deployed with CREATE or CREATE2.
import { parseAddress, parseBigInt, hexToBytes, bytesToHex, bigIntToBytes, keccak, rlpEncode, concat, toChecksumAddress, InputError } from '../lib/evm.js';
import { $, renderRows, live, segmented } from '../lib/ui.js';

/** Salt as 32 bytes: a decimal number, or hex left-padded with zeros. */
export function parseSalt(s) {
  s = s.trim();
  if (/^\d+$/.test(s)) return bigIntToBytes(BigInt(s), 32);
  const b = hexToBytes(s, 'Salt');
  if (b.length > 32) throw new InputError('Salt must be at most 32 bytes');
  return concat(new Uint8Array(32 - b.length), b);
}

/** CREATE: keccak256(rlp([deployer, nonce]))[12:]. Returns { address }. */
export function createAddress(deployerRaw, nonceRaw) {
  const deployer = parseAddress(deployerRaw, 'Deployer');
  const from = hexToBytes(deployer);
  const nonce = parseBigInt(nonceRaw, 'Nonce');
  if (nonce < 0n) throw new InputError('Nonce cannot be negative');
  return { address: toChecksumAddress(bytesToHex(keccak(rlpEncode([from, bigIntToBytes(nonce)])).slice(12))) };
}

/**
 * CREATE2: keccak256(0xff ‖ deployer ‖ salt ‖ keccak256(init_code))[12:].
 * codeMode is 'code' (codeRaw is the init code) or 'hash' (codeRaw is its 32-byte hash).
 * Returns { address, salt, codeHash } with salt and codeHash as 0x hex.
 */
export function create2Address(deployerRaw, saltRaw, codeRaw, codeMode) {
  const deployer = parseAddress(deployerRaw, 'Deployer');
  const from = hexToBytes(deployer);
  const salt = parseSalt(saltRaw);
  const code = hexToBytes(codeRaw, codeMode === 'hash' ? 'Init code hash' : 'Init code');
  if (codeMode === 'hash' && code.length !== 32) throw new InputError('Init code hash must be 32 bytes');
  const codeHash = codeMode === 'hash' ? code : keccak(code);
  const address = toChecksumAddress(bytesToHex(keccak(concat(Uint8Array.of(0xff), from, salt, codeHash)).slice(12)));
  return { address, salt: bytesToHex(salt), codeHash: bytesToHex(codeHash) };
}

function mount() {
  let run;
  const mode = segmented($('mode'), m => {
    $('create-fields').hidden = m !== 'create';
    $('create2-fields').hidden = m !== 'create2';
    run();
  });
  const codeMode = segmented($('code-mode'), m => {
    $('code').placeholder = m === 'hash' ? '0x… (32 bytes)' : '0x…';
    run();
  });

  run = live([$('deployer'), $('nonce'), $('salt'), $('code')], () => {
    if (mode() === 'create') {
      const r = createAddress($('deployer').value, $('nonce').value);
      renderRows($('out'), [
        { label: 'Contract address', value: r.address },
        { label: 'Formula', value: 'keccak256(rlp([deployer, nonce]))[12:]', copy: false },
      ]);
    } else {
      const r = create2Address($('deployer').value, $('salt').value, $('code').value, codeMode());
      renderRows($('out'), [
        { label: 'Contract address', value: r.address },
        { label: 'Salt', value: r.salt },
        { label: 'Init code hash', value: r.codeHash },
        { label: 'Formula', value: 'keccak256(0xff ‖ deployer ‖ salt ‖ keccak256(init_code))[12:]', copy: false },
      ]);
    }
  }, { errEl: $('err'), outEl: $('out') });

  // Examples: a deployer's second contract (nonce 1), and example 4 from EIP-1014.
  $('example-create').onclick = () => {
    $('deployer').value = '0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0';
    $('nonce').value = '1';
    $('mode').querySelector('[data-mode="create"]').click();
  };
  $('example-create2').onclick = () => {
    $('deployer').value = '0xdeadbeef00000000000000000000000000000000';
    $('salt').value = '0x000000000000000000000000feed000000000000000000000000000000000000';
    $('code').value = '0x00';
    $('code-mode').querySelector('[data-mode="code"]').click();
    $('mode').querySelector('[data-mode="create2"]').click();
  };
}

if (globalThis.document) mount();
