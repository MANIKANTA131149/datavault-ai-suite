import { createRequire } from "module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isPrivateIp, assertPublicHost } = require("../../server/lib/net-guard.js");

describe("net-guard isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // AWS metadata endpoint
    "100.64.0.1", // CGNAT
    "::1",
    "::ffff:10.0.0.1", // IPv4-mapped IPv6
    "fd00::1", // unique-local
  ])("treats %s as private", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])("treats %s as public", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("assertPublicHost (enforced)", () => {
  beforeAll(() => { process.env.ENFORCE_NET_GUARD = "1"; });
  afterAll(() => { delete process.env.ENFORCE_NET_GUARD; });

  it("blocks the AWS metadata IP", async () => {
    await expect(assertPublicHost("169.254.169.254")).rejects.toThrow();
  });

  it("blocks localhost and private suffixes", async () => {
    await expect(assertPublicHost("localhost")).rejects.toThrow();
    await expect(assertPublicHost("db.internal")).rejects.toThrow();
    await expect(assertPublicHost("svc.local")).rejects.toThrow();
  });

  it("blocks a private IP inside a URL / connection string", async () => {
    await expect(assertPublicHost("postgres://user:pass@10.0.0.5:5432/db")).rejects.toThrow();
  });

  it("allows a public IP literal", async () => {
    await expect(assertPublicHost("8.8.8.8")).resolves.toBeUndefined();
  });
});
