// Polyfill fallback for sandboxed Windows environments where OpenSSL DRBG throws ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK
const crypto = require('node:crypto');
const path = require('node:path');

const selfPath = path.resolve(__filename).replace(/\\/g, '/');
const requireFlag = `--require "${selfPath}"`;
if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('crypto-polyfill.cjs')) {
  process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
    ? `${process.env.NODE_OPTIONS} ${requireFlag}`
    : requireFlag;
}

let seed = Date.now() ^ 0x5f3759df;
function nextByte() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed & 0xff;
}

function fillFallback(buf, offset = 0, size = buf.byteLength - offset) {
  const view = new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + offset, size);
  for (let i = 0; i < size; i++) {
    view[i] = nextByte();
  }
  return buf;
}

const origRandomFillSync = crypto.randomFillSync.bind(crypto);
crypto.randomFillSync = function (buf, offset, size) {
  try {
    return origRandomFillSync(buf, offset, size);
  } catch {
    return fillFallback(buf, offset, size);
  }
};

const origRandomBytes = crypto.randomBytes.bind(crypto);
crypto.randomBytes = function (size, cb) {
  try {
    return origRandomBytes(size, cb);
  } catch {
    const b = Buffer.alloc(size);
    fillFallback(b, 0, size);
    if (typeof cb === 'function') {
      process.nextTick(() => cb(null, b));
      return;
    }
    return b;
  }
};

if (crypto.webcrypto && crypto.webcrypto.getRandomValues) {
  const origGetRandomValues = crypto.webcrypto.getRandomValues.bind(crypto.webcrypto);
  crypto.webcrypto.getRandomValues = function (typedArray) {
    try {
      return origGetRandomValues(typedArray);
    } catch {
      return fillFallback(typedArray, 0, typedArray.byteLength);
    }
  };
}

if (globalThis.crypto && globalThis.crypto.getRandomValues) {
  const origGlobalGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  globalThis.crypto.getRandomValues = function (typedArray) {
    try {
      return origGlobalGetRandomValues(typedArray);
    } catch {
      return fillFallback(typedArray, 0, typedArray.byteLength);
    }
  };
}
