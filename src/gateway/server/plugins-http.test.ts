import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import type { PluginRuntime } from "../../plugins/runtime/types.js";
import type { GatewayRequestContext, GatewayRequestOptions } from "../server-methods/types.js";
import { makeMockHttpResponse } from "../test-http-response.js";
import { createTestRegistry } from "./__tests__/test-utils.js";
import {
  createGatewayPluginRequestHandler,
  isRegisteredPluginHttpRoutePath,
  shouldEnforceGatewayAuthForPluginPath,
} from "./plugins-http.js";

const loadOpenClawPlugins = vi.hoisted(() => vi.fn());
type HandleGatewayRequestOptions = GatewayRequestOptions & {
  extraHandlers?: Record<string, unknown>;
};
const handleGatewayRequest = vi.hoisted(() =>
  vi.fn(async (_opts: HandleGatewayRequestOptions) => {}),
);

vi.mock("../../plugins/loader.js", () => ({
  loadOpenClawPlugins,
}));

vi.mock("../server-methods.js", () => ({
  handleGatewayRequest,
}));

type PluginHandlerLog = Parameters<typeof createGatewayPluginRequestHandler>[0]["log"];

function createPluginLog(): PluginHandlerLog {
  return { warn: vi.fn() } as unknown as PluginHandlerLog;
}

function createRoute(params: {
  path: string;
  pluginId?: string;
  auth?: "gateway" | "plugin";
  match?: "exact" | "prefix";
  handler?: (req: IncomingMessage, res: ServerResponse) => boolean | void | Promise<boolean | void>;
}) {
  return {
    pluginId: params.pluginId ?? "route",
    path: params.path,
    auth: params.auth ?? "gateway",
    match: params.match ?? "exact",
    handler: params.handler ?? (() => {}),
    source: params.pluginId ?? "route",
  };
}

function buildRepeatedEncodedSlash(depth: number): string {
  let encodedSlash = "%2f";
  for (let i = 1; i < depth; i++) {
    encodedSlash = encodedSlash.replace(/%/g, "%25");
  }
  return encodedSlash;
}

function createSubagentRuntimeRegistry() {
  return createTestRegistry();
}

async function createSubagentRuntime(): Promise<PluginRuntime["subagent"]> {
  const serverPlugins = await import("../server-plugins.js");
  loadOpenClawPlugins.mockReturnValue(createSubagentRuntimeRegistry());
  serverPlugins.loadGatewayPlugins({
    cfg: {},
    workspaceDir: "/tmp",
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    coreGatewayHandlers: {},
    baseMethods: [],
  });
  serverPlugins.setFallbackGatewayContext({} as GatewayRequestContext);
  const call = loadOpenClawPlugins.mock.calls.at(-1)?.[0] as
    | { runtimeOptions?: { subagent?: PluginRuntime["subagent"] } }
    | undefined;
  if (!call?.runtimeOptions?.subagent) {
    throw new Error("Expected subagent runtime from loadGatewayPlugins");
  }
  return call.runtimeOptions.subagent;
}

/** Set reg as both the constructor arg and the active plugin registry so
 *  `createGatewayPluginRequestHandler` resolves routes from it at request time. */
function createHandlerWithActiveRegistry(
  reg: ReturnType<typeof createTestRegistry>,
  log?: ReturnType<typeof createPluginLog>,
) {
  setActivePluginRegistry(reg);
  return createGatewayPluginRequestHandler({ registry: reg, log: log ?? createPluginLog() });
}

function createSecurePluginRouteHandler(params: {
  exactPluginHandler: () => boolean | Promise<boolean>;
  prefixGatewayHandler: () => boolean | Promise<boolean>;
}) {
  const reg = createTestRegistry({
    httpRoutes: [
      createRoute({
        path: "/plugin/secure/report",
        match: "exact",
        auth: "plugin",
        handler: params.exactPluginHandler,
      }),
      createRoute({
        path: "/plugin/secure",
        match: "prefix",
        auth: "gateway",
        handler: params.prefixGatewayHandler,
      }),
    ],
  });
  return createHandlerWithActiveRegistry(reg);
}

describe("createGatewayPluginRequestHandler", () => {
  it("caps unauthenticated plugin routes to non-admin subagent scopes", async () => {
    loadOpenClawPlugins.mockReset();
    handleGatewayRequest.mockReset();
    handleGatewayRequest.mockImplementation(async (opts: HandleGatewayRequestOptions) => {
      const scopes = opts.client?.connect.scopes ?? [];
      if (opts.req.method === "sessions.delete" && !scopes.includes("operator.admin")) {
        opts.respond(false, undefined, {
          code: "invalid_request",
          message: "missing scope: operator.admin",
        });
        return;
      }
      opts.respond(true, {});
    });

    const subagent = await createSubagentRuntime();
    const log = createPluginLog();
    const reg = createTestRegistry({
      httpRoutes: [
        createRoute({
          path: "/hook",
          auth: "plugin",
          handler: async (_req, _res) => {
            await subagent.deleteSession({ sessionKey: "agent:main:subagent:child" });
            return true;
          },
        }),
      ],
    });
    setActivePluginRegistry(reg);
    const handler = createGatewayPluginRequestHandler({ registry: reg, log });

    const { res, setHeader, end } = makeMockHttpResponse();
    const handled = await handler({ url: "/hook" } as IncomingMessage, res, undefined, {
      gatewayAuthSatisfied: false,
    });

    expect(handled).toBe(true);
    expect(handleGatewayRequest).toHaveBeenCalledTimes(1);
    expect(handleGatewayRequest.mock.calls[0]?.[0]?.client?.connect.scopes).toEqual([
      "operator.write",
    ]);
    expect(res.statusCode).toBe(500);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
    expect(end).toHaveBeenCalledWith("Internal Server Error");
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("missing scope: operator.admin"));
  });

  it("returns false when no routes are registered", async () => {
    const log = createPluginLog();
    const handler = createGatewayPluginRequestHandler({
      registry: createTestRegistry(),
      log,
    });
    const { res } = makeMockHttpResponse();
    const handled = await handler({} as IncomingMessage, res);
    expect(handled).toBe(false);
  });

  it("handles exact route matches", async () => {
    const routeHandler = vi.fn(async (_req, res: ServerResponse) => {
      res.statusCode = 200;
    });
    const reg = createTestRegistry({
      httpRoutes: [createRoute({ path: "/demo", handler: routeHandler })],
    });
    const handler = createHandlerWithActiveRegistry(reg);

    const { res } = makeMockHttpResponse();
    const handled = await handler({ url: "/demo" } as IncomingMessage, res);
    expect(handled).toBe(true);
    expect(routeHandler).toHaveBeenCalledTimes(1);
  });

  it("prefers exact matches before prefix matches", async () => {
    const exactHandler = vi.fn(async (_req, res: ServerResponse) => {
      res.statusCode = 200;
    });
    const prefixHandler = vi.fn(async () => true);
    const reg = createTestRegistry({
      httpRoutes: [
        createRoute({ path: "/api", match: "prefix", handler: prefixHandler }),
        createRoute({ path: "/api/demo", match: "exact", handler: exactHandler }),
      ],
    });
    const handler = createHandlerWithActiveRegistry(reg);

    const { res } = makeMockHttpResponse();
    const handled = await handler({ url: "/api/demo" } as IncomingMessage, res);
    expect(handled).toBe(true);
    expect(exactHandler).toHaveBeenCalledTimes(1);
    expect(prefixHandler).not.toHaveBeenCalled();
  });

  it("supports route fallthrough when handler returns false", async () => {
    const first = vi.fn(async () => false as const);
    const second = vi.fn(async () => true);
    const reg = createTestRegistry({
      httpRoutes: [
        createRoute({ path: "/hook", match: "exact", handler: first }),
        createRoute({ path: "/hook", match: "prefix", handler: second }),
      ],
    });
    const handler = createHandlerWithActiveRegistry(reg);

    const { res } = makeMockHttpResponse();
    const handled = await handler({ url: "/hook" } as IncomingMessage, res);
    expect(handled).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a matched gateway route reaches dispatch without auth", async () => {
    const exactPluginHandler = vi.fn(async () => false);
    const prefixGatewayHandler = vi.fn(async () => true);
    const handler = createSecurePluginRouteHandler({
      exactPluginHandler,
      prefixGatewayHandler,
    });

    const { res } = makeMockHttpResponse();
    const handled = await handler(
      { url: "/plugin/secure/report" } as IncomingMessage,
      res,
      undefined,
      {
        gatewayAuthSatisfied: false,
      },
    );
    expect(handled).toBe(false);
    expect(exactPluginHandler).not.toHaveBeenCalled();
    expect(prefixGatewayHandler).not.toHaveBeenCalled();
  });

  it("allows gateway route fallthrough only after gateway auth succeeds", async () => {
    const exactPluginHandler = vi.fn(async () => false);
    const prefixGatewayHandler = vi.fn(async () => true);
    const handler = createSecurePluginRouteHandler({
      exactPluginHandler,
      prefixGatewayHandler,
    });

    const { res } = makeMockHttpResponse();
    const handled = await handler(
      { url: "/plugin/secure/report" } as IncomingMessage,
      res,
      undefined,
      {
        gatewayAuthSatisfied: true,
      },
    );
    expect(handled).toBe(true);
    expect(exactPluginHandler).toHaveBeenCalledTimes(1);
    expect(prefixGatewayHandler).toHaveBeenCalledTimes(1);
  });

  it("matches canonicalized route variants", async () => {
    const routeHandler = vi.fn(async (_req, res: ServerResponse) => {
      res.statusCode = 200;
    });
    const reg = createTestRegistry({
      httpRoutes: [createRoute({ path: "/api/demo", handler: routeHandler })],
    });
    const handler = createHandlerWithActiveRegistry(reg);

    const { res } = makeMockHttpResponse();
    const handled = await handler({ url: "/API//demo" } as IncomingMessage, res);
    expect(handled).toBe(true);
    expect(routeHandler).toHaveBeenCalledTimes(1);
  });

  it("logs and responds with 500 when a route throws", async () => {
    const log = createPluginLog();
    const reg = createTestRegistry({
      httpRoutes: [
        createRoute({
          path: "/boom",
          handler: async () => {
            throw new Error("boom");
          },
        }),
      ],
    });
    setActivePluginRegistry(reg);
    const handler = createGatewayPluginRequestHandler({ registry: reg, log });

    const { res, setHeader, end } = makeMockHttpResponse();
    const handled = await handler({ url: "/boom" } as IncomingMessage, res);
    expect(handled).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("boom"));
    expect(res.statusCode).toBe(500);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
    expect(end).toHaveBeenCalledWith("Internal Server Error");
  });

  it("resolves routes from the active registry after a swap (#45445)", async () => {
    // Simulate the bug: handler is created with an empty registry,
    // then routes are registered on a new active registry.
    const emptyReg = createTestRegistry();
    setActivePluginRegistry(emptyReg);
    const handler = createGatewayPluginRequestHandler({
      registry: emptyReg,
      log: createPluginLog(),
    });

    // Initially returns false (no routes).
    const { res: res1 } = makeMockHttpResponse();
    expect(await handler({ url: "/googlechat" } as IncomingMessage, res1)).toBe(false);

    // Swap the active registry to one with a route (simulates plugin registration).
    const routeHandler = vi.fn(async (_req, res: ServerResponse) => {
      res.statusCode = 200;
    });
    const newReg = createTestRegistry({
      httpRoutes: [createRoute({ path: "/googlechat", handler: routeHandler })],
    });
    setActivePluginRegistry(newReg);

    // Same handler should now resolve the route from the new active registry.
    const { res: res2 } = makeMockHttpResponse();
    expect(await handler({ url: "/googlechat" } as IncomingMessage, res2)).toBe(true);
    expect(routeHandler).toHaveBeenCalledTimes(1);
  });
});

describe("plugin HTTP route auth checks", () => {
  const deeplyEncodedChannelPath =
    "/api%2525252fchannels%2525252fnostr%2525252fdefault%2525252fprofile";
  const decodeOverflowPublicPath = `/googlechat${buildRepeatedEncodedSlash(40)}public`;

  it("detects registered route paths", () => {
    const registry = createTestRegistry({
      httpRoutes: [createRoute({ path: "/demo" })],
    });
    expect(isRegisteredPluginHttpRoutePath(registry, "/demo")).toBe(true);
    expect(isRegisteredPluginHttpRoutePath(registry, "/missing")).toBe(false);
  });

  it("matches canonicalized variants of registered route paths", () => {
    const registry = createTestRegistry({
      httpRoutes: [createRoute({ path: "/api/demo" })],
    });
    expect(isRegisteredPluginHttpRoutePath(registry, "/api//demo")).toBe(true);
    expect(isRegisteredPluginHttpRoutePath(registry, "/API/demo")).toBe(true);
    expect(isRegisteredPluginHttpRoutePath(registry, "/api/%2564emo")).toBe(true);
  });

  it("enforces auth for protected and gateway-auth routes", () => {
    const registry = createTestRegistry({
      httpRoutes: [
        createRoute({ path: "/googlechat", match: "prefix", auth: "plugin" }),
        createRoute({ path: "/api/demo", auth: "gateway" }),
      ],
    });
    expect(shouldEnforceGatewayAuthForPluginPath(registry, "/api//demo")).toBe(true);
    expect(shouldEnforceGatewayAuthForPluginPath(registry, "/googlechat/public")).toBe(false);
    expect(shouldEnforceGatewayAuthForPluginPath(registry, "/api/channels/status")).toBe(true);
    expect(shouldEnforceGatewayAuthForPluginPath(registry, deeplyEncodedChannelPath)).toBe(true);
    expect(shouldEnforceGatewayAuthForPluginPath(registry, decodeOverflowPublicPath)).toBe(true);
    expect(shouldEnforceGatewayAuthForPluginPath(registry, "/not-plugin")).toBe(false);
  });

  it("enforces auth when any overlapping matched route requires gateway auth", () => {
    const registry = createTestRegistry({
      httpRoutes: [
        createRoute({ path: "/plugin/secure/report", match: "exact", auth: "plugin" }),
        createRoute({ path: "/plugin/secure", match: "prefix", auth: "gateway" }),
      ],
    });
    expect(shouldEnforceGatewayAuthForPluginPath(registry, "/plugin/secure/report")).toBe(true);
  });
});
