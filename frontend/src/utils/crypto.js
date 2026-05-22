// Cache derived keys so we don't re-run PBKDF2 on every message
const keyCache = new Map();

/**
 * Derives a deterministic AES-GCM key for a given conversationId using PBKDF2.
 *
 * NOTE: In a production E2E-encrypted app you would exchange per-user keypairs
 * (e.g. via ECDH) so the server never sees plaintext. This demo derives the
 * key from the conversationId + a shared passphrase so that all participants
 * can decrypt without a separate key-exchange round-trip. The key never leaves
 * the browser.
 */
async function deriveConversationKey(conversationId) {
    const normalizedConversationId = String(conversationId);

    if (keyCache.has(normalizedConversationId)) return keyCache.get(normalizedConversationId);

    const enc = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode("rchat-v1-demo"),   // shared passphrase (would be secret in prod)
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(normalizedConversationId),   // conversation-specific salt
            iterations: 100_000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    keyCache.set(normalizedConversationId, key);
    return key;
}

/**
 * Encrypts a plaintext string for the given conversation.
 * Returns { ciphertext, iv } — both base64-encoded strings safe for JSON/DB.
 */
export async function encryptMessage(message, conversationId) {
    if (conversationId === undefined || conversationId === null || conversationId === "") {
        throw new Error("conversationId is required for encryption");
    }

    const key = await deriveConversationKey(conversationId);

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(message)
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

/**
 * Decrypts a ciphertext+iv pair for the given conversation.
 * Throws if the key or ciphertext is wrong (caller should catch).
 */
export async function decryptMessage(ciphertext, iv, conversationId) {
    const key = await deriveConversationKey(conversationId);

    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)),
        },
        key,
        Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
    );

    return new TextDecoder().decode(decrypted);
}

/**
 * Tries multiple conversation IDs so legacy messages (encrypted with an older
 * salt value) can still be recovered.
 */
export async function decryptMessageWithFallback(ciphertext, iv, conversationIds = []) {
    const candidates = Array.isArray(conversationIds)
        ? conversationIds
        : [conversationIds];

    const orderedUniqueCandidates = Array.from(
        new Set(
            [
                ...candidates
                    .filter((id) => id !== undefined && id !== null && String(id).trim() !== "")
                    .map((id) => String(id)),
                "undefined",
                "null",
            ]
        )
    );

    let lastError = null;

    for (const candidate of orderedUniqueCandidates) {
        try {
            return await decryptMessage(ciphertext, iv, candidate);
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error("Unable to decrypt message");
}
