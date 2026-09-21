// Sync with rules.json by hand.
export const RESOURCE_TYPES = [
    "main_frame", "sub_frame", "xmlhttprequest", "websocket", "image", "script", "other"
];

const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1", "[::1]"]);

export function isPrivateHost(hostname) {
    const host = String(hostname).toLowerCase().replace(/\.$/, "");
    if (PRIVATE_HOSTNAMES.has(host)) return true;

    const octets = host.split(".");
    if (octets.length !== 4) return false;
    if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return false;

    const [a, b] = octets.map(Number);
    return a === 127
        || a === 10
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 169 && b === 254);
}
