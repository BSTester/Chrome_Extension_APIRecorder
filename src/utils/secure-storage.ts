/* 安全存储（轻量加密）：基于 Web Crypto AES-GCM
   注意：前端加密无法提供绝对安全，仅用于降低明文暴露风险。
   - 优先使用 chrome.storage.local（扩展上下文），否则回退到 localStorage/IndexedDB 上层调用
*/
const PEPPER = 'api-recorder-secure-pepper-v1';

async function getKey(): Promise<CryptoKey> {
  const runtimeId = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : 'web';
  const encoder = new TextEncoder();
  const base = `${runtimeId}:${PEPPER}:${location.origin}`;
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(base),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const salt = encoder.encode('secure-storage-salt');
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function setSecure<T>(key: string, value: T | null): Promise<void> {
  if (value === null) {
    // 删除
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve) => chrome.storage.local.remove(key, () => resolve()));
    } else {
      localStorage.removeItem(key);
    }
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(value));
  const cryptoKey = await getKey();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
  const payload = JSON.stringify({
    iv: toBase64(iv.buffer),
    data: toBase64(cipher),
  });
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await new Promise<void>((resolve) => chrome.storage.local.set({ [key]: payload }, () => resolve()));
  } else {
    localStorage.setItem(key, payload);
  }
}

export async function getSecure<T>(key: string): Promise<T | null> {
  let payload: string | null = null;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    payload = await new Promise<string | null>((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res[key] ?? null));
    });
  } else {
    payload = localStorage.getItem(key);
  }
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    const iv = new Uint8Array(fromBase64(parsed.iv));
    const encrypted = fromBase64(parsed.data);
    const cryptoKey = await getKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    // 解密失败视作无数据
    return null;
  }
}