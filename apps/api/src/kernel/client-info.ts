import { createHmac } from 'node:crypto';
import type { Request } from 'express';

/**
 * Raw IP addresses are personal data (DPDP). They are stored only as a keyed hash,
 * which still lets us spot "same IP" patterns without keeping the address.
 */
export function hashIp(ip: string | undefined, secret: string): string {
  return createHmac('sha256', secret)
    .update(ip ?? 'unknown')
    .digest('base64url')
    .slice(0, 22);
}

export interface DeviceInfo {
  browser: string;
  os: string;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * Coarse device label for the sessions list (GL-03). Deliberately tiny: a full UA
 * parser adds a dependency (the popular one is AGPL since v2) for no user value.
 */
export function parseUserAgent(ua: string | undefined): DeviceInfo {
  const s = ua ?? '';
  const pick = (table: [RegExp, string][]) => table.find(([re]) => re.test(s))?.[1] ?? 'Unknown';
  return { browser: pick(BROWSERS), os: pick(SYSTEMS) };
}

export function clientInfo(req: Request, ipSecret: string) {
  return {
    ipHash: hashIp(req.ip, ipSecret),
    ua: (req.get('user-agent') ?? '').slice(0, 512),
    ...parseUserAgent(req.get('user-agent')),
  };
}
