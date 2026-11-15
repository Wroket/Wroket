import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

export interface RemoteCaretPeer {
  uid: string;
  displayName: string;
  from: number;
  to: number;
}

const remoteCaretsKey = new PluginKey<DecorationSet>("noteRemoteCarets");

const PALETTE = [
  { caret: "#2563eb", sel: "rgba(37, 99, 235, 0.18)", labelBg: "#2563eb" },
  { caret: "#db2777", sel: "rgba(219, 39, 119, 0.18)", labelBg: "#db2777" },
  { caret: "#059669", sel: "rgba(5, 150, 105, 0.18)", labelBg: "#059669" },
  { caret: "#d97706", sel: "rgba(217, 119, 6, 0.18)", labelBg: "#d97706" },
  { caret: "#7c3aed", sel: "rgba(124, 58, 237, 0.18)", labelBg: "#7c3aed" },
  { caret: "#0891b2", sel: "rgba(8, 145, 178, 0.18)", labelBg: "#0891b2" },
] as const;

/**
 * Stable color for a peer uid (short palette).
 */
export function colorForUid(uid: string): (typeof PALETTE)[number] {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function shortLabel(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "?";
  const local = trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  const first = local.split(/\s+/)[0] ?? local;
  return first.length > 18 ? `${first.slice(0, 16)}…` : first;
}

function clampPos(doc: PmNode, pos: number): number {
  const max = doc.content.size;
  if (max <= 0) return 0;
  return Math.max(0, Math.min(pos, max));
}

/**
 * Build caret widgets + selection highlights for remote peers in one text block.
 */
export function buildRemoteCaretDecorations(
  doc: PmNode,
  peers: RemoteCaretPeer[],
  cursorAriaLabel: (name: string) => string,
): DecorationSet {
  const decos: ReturnType<typeof Decoration.inline>[] = [];
  for (const peer of peers) {
    const color = colorForUid(peer.uid);
    let from = clampPos(doc, peer.from);
    let to = clampPos(doc, peer.to);
    if (to < from) {
      const swap = from;
      from = to;
      to = swap;
    }
    if (from !== to) {
      decos.push(
        Decoration.inline(from, to, {
          style: `background-color: ${color.sel}`,
          class: "note-remote-sel",
        }),
      );
    }
    const caretAt = to;
    const name = shortLabel(peer.displayName);
    const aria = cursorAriaLabel(peer.displayName);
    decos.push(
      Decoration.widget(
        caretAt,
        () => {
          const root = document.createElement("span");
          root.className = "note-remote-caret";
          root.setAttribute("contenteditable", "false");
          root.setAttribute("aria-label", aria);
          root.title = aria;
          root.style.cssText = [
            "position:relative",
            "display:inline-block",
            "width:0",
            "height:1.15em",
            "vertical-align:text-bottom",
            "pointer-events:none",
            "user-select:none",
          ].join(";");

          const bar = document.createElement("span");
          bar.setAttribute("aria-hidden", "true");
          bar.style.cssText = [
            "position:absolute",
            "left:0",
            "top:0",
            "bottom:0",
            "width:2px",
            `background:${color.caret}`,
            "border-radius:1px",
          ].join(";");
          root.appendChild(bar);

          const label = document.createElement("span");
          label.setAttribute("aria-hidden", "true");
          label.textContent = name;
          label.style.cssText = [
            "position:absolute",
            "left:0",
            "top:-1.15em",
            "z-index:2",
            "white-space:nowrap",
            "padding:0 4px",
            "border-radius:3px",
            "font-size:10px",
            "line-height:1.4",
            "font-weight:600",
            "color:#fff",
            `background:${color.labelBg}`,
            "box-shadow:0 1px 2px rgba(0,0,0,0.12)",
            "transform:translateX(-2px)",
          ].join(";");
          root.appendChild(label);

          return root;
        },
        { side: 1, key: `remote-caret-${peer.uid}` },
      ),
    );
  }
  return DecorationSet.create(doc, decos);
}

/**
 * TipTap extension: decorations updated via `setRemoteCarets(editor, peers)`.
 */
export const RemoteCaretsExtension = Extension.create<{
  cursorAriaLabel: (name: string) => string;
}>({
  name: "noteRemoteCarets",

  addOptions() {
    return {
      cursorAriaLabel: (name: string) => name,
    };
  },

  addProseMirrorPlugins() {
    const ariaLabel = this.options.cursorAriaLabel;
    return [
      new Plugin({
        key: remoteCaretsKey,
        state: {
          init: (_, state) => DecorationSet.create(state.doc, []),
          apply(tr, old, _oldState, newState) {
            const meta = tr.getMeta(remoteCaretsKey) as RemoteCaretPeer[] | undefined;
            if (meta) {
              return buildRemoteCaretDecorations(newState.doc, meta, ariaLabel);
            }
            if (tr.docChanged) {
              return old.map(tr.mapping, newState.doc);
            }
            return old;
          },
        },
        props: {
          decorations(state) {
            return remoteCaretsKey.getState(state) ?? null;
          },
        },
      }),
    ];
  },
});

/**
 * Push latest remote peer cursors into the editor (no-op if unchanged empty).
 */
export function setRemoteCarets(editor: Editor, peers: RemoteCaretPeer[]): void {
  const { tr } = editor.state;
  tr.setMeta(remoteCaretsKey, peers);
  editor.view.dispatch(tr);
}
