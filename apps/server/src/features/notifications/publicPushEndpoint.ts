import { pushEndpointSchema } from "@openbts/shared/contract";
import { type LookupOptions, lookup } from "node:dns";
import https from "node:https";
import { BlockList, type LookupFunction, isIP } from "node:net";
import type { RequestDetails } from "web-push";

type Subnet = readonly [network: string, prefix: number];

export const NON_PUBLIC_PUSH_ADDRESS = "NON_PUBLIC_PUSH_ADDRESS";
const PUSH_REQUEST_TIMEOUT_MS = 10_000;

const NON_PUBLIC_IPV4_SUBNETS: readonly Subnet[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const NON_PUBLIC_IPV6_SUBNETS: readonly Subnet[] = [
  ["::", 3],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["4000::", 2],
  ["8000::", 1],
];

function toBlockList(subnets: readonly Subnet[], type: "ipv4" | "ipv6"): BlockList {
  const blockList = new BlockList();
  for (const [network, prefix] of subnets) blockList.addSubnet(network, prefix, type);
  return blockList;
}

const nonPublicIpv4 = toBlockList(NON_PUBLIC_IPV4_SUBNETS, "ipv4");
const nonPublicIpv6 = toBlockList(NON_PUBLIC_IPV6_SUBNETS, "ipv6");

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !nonPublicIpv4.check(address, "ipv4");
  return version === 6 && !nonPublicIpv6.check(address, "ipv6");
}

function nonPublicAddressError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error("The push endpoint does not lead to a public address");
  error.code = NON_PUBLIC_PUSH_ADDRESS;
  return error;
}

function lookupPublicAddress(hostname: string, options: LookupOptions, callback: Parameters<LookupFunction>[2]): void {
  lookup(hostname, options, (error, address, family) => {
    if (error) return callback(error, address, family);

    const addresses = Array.isArray(address) ? address.map((entry) => entry.address) : [address];
    callback(addresses.every(isPublicAddress) ? null : nonPublicAddressError(), address, family);
  });
}

export async function resolvePublicPushEndpoint(endpoint: string): Promise<string> {
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) throw nonPublicAddressError();

  const { hostname } = new URL(parsed.data);
  await new Promise<void>((resolve, reject) => {
    lookupPublicAddress(hostname, { all: true }, (error) => (error ? reject(error) : resolve()));
  });
  return parsed.data;
}

function unexpectedStatusError(statusCode: number): Error {
  return Object.assign(new Error(`The push service answered ${statusCode}`), { statusCode });
}

export function sendPushRequest({ endpoint, method, headers, body }: RequestDetails): Promise<void> {
  const { hostname, pathname, search } = new URL(endpoint);

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: pathname + search,
      method,
      headers,
      lookup: lookupPublicAddress,
      signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
    };
    const request = https.request(options, (response) => {
      response.resume();
      response.on("error", reject);
      response.on("end", () => {
        const { statusCode = 0 } = response;
        if (statusCode >= 200 && statusCode <= 299) resolve();
        else reject(unexpectedStatusError(statusCode));
      });
    });
    request.on("error", reject);
    request.end(body ?? undefined);
  });
}
