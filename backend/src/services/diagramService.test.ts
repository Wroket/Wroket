/**
 * Diagram capture stays off by default and never returns more than 25 nodes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetDiagramQuota, proposeDiagramForUser, sanitizeDiagramProposal } from "./diagramService";
import * as teamService from "./teamService";

beforeEach(() => {
  __resetDiagramQuota();
  delete process.env.DIAGRAM_ENABLED;
  delete process.env.DIAGRAM_PROVIDER;
  delete process.env.DIAGRAM_BETA_EMAILS;
  vi.spyOn(teamService, "getEffectiveEntitlementsForUid").mockReturnValue({
    integrations: true,
    teamReporting: true,
    clientPortal: true,
    workCapture: true,
  });
});

describe("diagramService", () => {
  it("is disabled unless DIAGRAM_ENABLED=true", async () => {
    await expect(
      proposeDiagramForUser({
        uid: "u1",
        email: "a@test.com",
        buffer: Buffer.from("x"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "DIAGRAM_DISABLED" });
  });

  it("stays off for a plan without work capture", async () => {
    process.env.DIAGRAM_ENABLED = "true";
    vi.mocked(teamService.getEffectiveEntitlementsForUid).mockReturnValue({
      integrations: true,
      teamReporting: false,
      clientPortal: false,
      workCapture: false,
    });
    await expect(
      proposeDiagramForUser({
        uid: "u1",
        email: "a@test.com",
        buffer: Buffer.from("x"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "DIAGRAM_DISABLED" });
  });

  it("returns a mock graph when the provider is mock", async () => {
    process.env.DIAGRAM_ENABLED = "true";
    process.env.DIAGRAM_PROVIDER = "mock";
    const graph = await proposeDiagramForUser({
      uid: "u1",
      email: "a@test.com",
      buffer: Buffer.from("x"),
      mimeType: "image/png",
    });
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.provider).toBe("mock");
    expect(graph.edges[0]).toEqual({ from: "n1", to: "n2" });
  });

  it("drops dangling edges and caps labels", () => {
    const graph = sanitizeDiagramProposal({
      nodes: [
        { id: "a", label: "  Préparer  " },
        { id: "b", label: "x".repeat(300) },
      ],
      edges: [
        { from: "a", to: "missing" },
        { from: "a", to: "b" },
      ],
    });
    expect(graph.nodes[1]?.label).toHaveLength(200);
    expect(graph.edges).toEqual([{ from: "a", to: "b" }]);
  });

  it("keeps a box drawn on the photo and drops a tiny one", () => {
    const graph = sanitizeDiagramProposal({
      nodes: [
        { id: "a", label: "Scan", x: 0.1, y: 0.2, w: 0.3, h: 0.2 },
        { id: "b", label: "Note", x: 0.5, y: 0.2, w: 0.01, h: 0.2 },
      ],
      edges: [],
    });
    expect(graph.nodes[0]).toMatchObject({ x: 0.1, y: 0.2, w: 0.3, h: 0.2 });
    expect(graph.nodes[1]).not.toHaveProperty("x");
  });

  it("keeps a known shape and the text written outside the boxes", () => {
    const graph = sanitizeDiagramProposal({
      nodes: [
        { id: "a", label: "Scan", shape: "ellipse", color: "rose" },
        { id: "b", label: "Other", shape: "star", color: "red" },
      ],
      edges: [],
      aside: "  Titre de la page\nÀ faire  ",
    });
    expect(graph.nodes[0]).toMatchObject({ shape: "ellipse", color: "rose" });
    expect(graph.nodes[1]).not.toHaveProperty("shape");
    expect(graph.nodes[1]).not.toHaveProperty("color");
    expect(graph.aside).toBe("Titre de la page\nÀ faire");
  });
});