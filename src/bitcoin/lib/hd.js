// HD wallet helpers (BIP32, BIP39, SLIP-132 versions) for the Bitcoin tool pages.
import { HDKey } from '../../assets/vendor/@scure/bip32@1.7.0/index.esm.js';
import * as bip39 from '../../assets/vendor/@scure/bip39@1.6.0/index.esm.js';
import { wordlist } from '../../assets/vendor/@scure/bip39@1.6.0/wordlists/english.esm.js';
import {
  InputError, base58check, bytesToHex, concat, hash160, hexToBytes, NETWORKS,
  encodeSegwit, taprootTweak, xOnly, witnessScript, encodeWif,
} from './btc.js';

export { HDKey, bip39, wordlist };

/** SLIP-132 version bytes: [public, private], with the address type each implies. */
export const VERSIONS = {
  xpub: { pub: 0x0488b21e, prv: 0x0488ade4, prvName: 'xprv', net: 'mainnet', script: 'p2pkh', note: 'Legacy (BIP44) or any' },
  ypub: { pub: 0x049d7cb2, prv: 0x049d7878, prvName: 'yprv', net: 'mainnet', script: 'p2sh-p2wpkh', note: 'Nested segwit (BIP49)' },
  zpub: { pub: 0x04b24746, prv: 0x04b2430c, prvName: 'zprv', net: 'mainnet', script: 'p2wpkh', note: 'Native segwit (BIP84)' },
  Ypub: { pub: 0x0295b43f, prv: 0x0295b005, prvName: 'Yprv', net: 'mainnet', script: 'p2sh-p2wsh', note: 'Nested segwit multisig' },
  Zpub: { pub: 0x02aa7ed3, prv: 0x02aa7a99, prvName: 'Zprv', net: 'mainnet', script: 'p2wsh', note: 'Native segwit multisig' },
  tpub: { pub: 0x043587cf, prv: 0x04358394, prvName: 'tprv', net: 'testnet', script: 'p2pkh', note: 'Testnet legacy or any' },
  upub: { pub: 0x044a5262, prv: 0x044a4e28, prvName: 'uprv', net: 'testnet', script: 'p2sh-p2wpkh', note: 'Testnet nested segwit' },
  vpub: { pub: 0x045f1cf6, prv: 0x045f18bc, prvName: 'vprv', net: 'testnet', script: 'p2wpkh', note: 'Testnet native segwit' },
  Upub: { pub: 0x024289ef, prv: 0x024285b5, prvName: 'Uprv', net: 'testnet', script: 'p2sh-p2wsh', note: 'Testnet nested segwit multisig' },
  Vpub: { pub: 0x02575483, prv: 0x02575048, prvName: 'Vprv', net: 'testnet', script: 'p2wsh', note: 'Testnet native segwit multisig' },
};

/** Find the version family of an extended key string by its version bytes. */
export function parseExtendedKey(str) {
  const s = String(str).trim();
  let payload;
  try { payload = base58check.decode(s); } catch (e) {
    throw new InputError(/checksum/i.test(String(e.message)) ? 'Checksum does not match: the key has a typo' : 'Not a valid Base58Check string');
  }
  if (payload.length !== 78) throw new InputError(`Extended keys are 78 bytes; this one is ${payload.length}`);
  const ver = new DataView(payload.buffer, payload.byteOffset).getUint32(0, false);
  const entry = Object.entries(VERSIONS).find(([, v]) => v.pub === ver || v.prv === ver);
  if (!entry) throw new InputError(`Unknown version bytes 0x${ver.toString(16).padStart(8, '0')}`);
  const [family, v] = entry, isPrivate = v.prv === ver;
  let key;
  try { key = HDKey.fromExtendedKey(s, { public: v.pub, private: v.prv }); } catch (e) {
    throw new InputError(`Invalid extended key: ${e.message}`);
  }
  return { key, family, isPrivate, versionName: isPrivate ? v.prvName : family, version: ver, payload };
}

/** Encode an extended key with any version bytes (SLIP-132 conversion). */
function encodeVersion(key, version, priv) {
  const ver = new Uint8Array(4);
  new DataView(ver.buffer).setUint32(0, version, false);
  const depth = Uint8Array.of(key.depth);
  const parent = new Uint8Array(4); new DataView(parent.buffer).setUint32(0, key.parentFingerprint, false);
  const index = new Uint8Array(4); new DataView(index.buffer).setUint32(0, key.index, false);
  const keyData = priv ? concat(Uint8Array.of(0), key.privateKey) : key.publicKey;
  return base58check.encode(concat(ver, depth, parent, index, key.chainCode, keyData));
}
export { encodeVersion };

/** Parse a BIP32 path like m/84'/0'/0'/0/5 (also h / H for hardened). */
export function normalizePath(path) {
  const p = String(path).trim().replace(/\s+/g, '');
  if (!/^m(\/\d+['hH]?)*$/.test(p)) throw new InputError(`Invalid derivation path "${path}". Use the form m/84'/0'/0'/0/0`);
  for (const part of p.split('/').slice(1)) {
    if (Number(part.replace(/['hH]$/, '')) >= 0x80000000) throw new InputError(`Path index ${part} is too large`);
  }
  return p.replace(/[hH]/g, "'");
}

export const formatIndex = i => (i >= 0x80000000 ? `${i - 0x80000000}'` : String(i));
export const fingerprintHex = n => (n >>> 0).toString(16).padStart(8, '0');
export const keyFingerprint = pub => bytesToHex(hash160(pub).slice(0, 4));

/** Address of a public key for a script type. */
export function addressFor(pub, type, netKey) {
  const net = NETWORKS[netKey];
  const h = hash160(pub);
  switch (type) {
    case 'p2pkh': return base58check.encode(concat(Uint8Array.of(net.pkh), h));
    case 'p2sh-p2wpkh': return base58check.encode(concat(Uint8Array.of(net.sh), hash160(witnessScript(0, h))));
    case 'p2wpkh': return encodeSegwit(net.hrp, 0, h);
    case 'p2tr': return encodeSegwit(net.hrp, 1, taprootTweak(xOnly(pub)));
    default: throw new InputError(`Unsupported address type ${type}`);
  }
}

export const wifFor = (priv, netKey) => encodeWif(priv, NETWORKS[netKey], true);

/** Explain why a mnemonic is invalid, or return null if it is valid. */
export function mnemonicProblem(words) {
  const list = words.trim().normalize('NFKD').toLowerCase().split(/\s+/).filter(Boolean);
  if (!list.length) return 'Mnemonic is empty';
  if (![12, 15, 18, 21, 24].includes(list.length)) return `${list.length} words; a BIP39 mnemonic has 12, 15, 18, 21 or 24`;
  const unknown = list.filter(w => !wordlist.includes(w));
  if (unknown.length) return `Not in the BIP39 English word list: ${[...new Set(unknown)].join(', ')}`;
  if (!bip39.validateMnemonic(list.join(' '), wordlist)) return 'Checksum does not match: a word is wrong or the order is changed';
  return null;
}

export const normalizeMnemonic = words => words.trim().normalize('NFKD').toLowerCase().split(/\s+/).filter(Boolean).join(' ');

export function seedFromInput(mnemonicOrSeed, passphrase = '') {
  const t = String(mnemonicOrSeed).trim();
  if (/^(0x)?[0-9a-f]+$/i.test(t) && !/\s/.test(t)) {
    const seed = hexToBytes(t, 'Seed');
    if (seed.length < 16 || seed.length > 64) throw new InputError('A BIP32 seed is 16–64 bytes');
    return { seed, from: 'seed' };
  }
  const problem = mnemonicProblem(t);
  if (problem) throw new InputError(problem);
  return { seed: bip39.mnemonicToSeedSync(normalizeMnemonic(t), passphrase.normalize('NFKD')), from: 'mnemonic' };
}
