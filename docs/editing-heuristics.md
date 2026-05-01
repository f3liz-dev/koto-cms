# Editing heuristics for Koto

Research notes on UX patterns from git-backed CMS, markdown WYSIWYG editors,
and writing tools — translated into principles and prioritized recommendations
for Koto.

## Context

Koto is a markdown CMS with:

- **Target editor**: non-developer contributors; writes more than structures
- **Source of truth**: GitHub repo; every save is a commit, editorial flow
  is PR-based
- **Dialect**: Markdoc (`{% tag %}…{% /tag %}`) → converted to VitePress
  markdown by the target repo's CI
- **Surface**: Svelte + Tiptap WYSIWYG + separate frontmatter pane
- **Identity**: Fediverse MiAuth login

Heuristics below are filtered through this context. "Good for Notion" or
"good for Obsidian" isn't automatically good for Koto.

---

## Core heuristics

### 1. Round-trip is sacred

If the editor parses something and re-emits it, the output must equal the
input byte-for-byte for unchanged regions. When true lossless isn't possible,
preserve the construct as opaque rather than reformatting it.

- Koto: already wraps Markdoc tags in `\`\`\`markdoc` fences on the way in and
  unwraps on the way out, so tags survive even though Tiptap doesn't natively
  understand them. This is the right pattern.
- Implication: **keep a golden round-trip test corpus** of real-world docs.
  Any change to Tiptap config, `tiptap-markdown` version, or encoding helpers
  should be gated on these.

### 2. Frontmatter belongs in its own pane

Mixing YAML editing into the visual flow is how you get writers saving invalid
front matter. GitLab's Static Site Editor, Front Matter CMS (VSCode), and
Decap CMS all separate it.

- Koto: already does this. ✓
- Next step: **typed fields, not raw YAML textarea**. Read the shape from
  `.koto.json` (declare fields for `title`, `date`, `description`, etc.) and
  render as form inputs, with a "raw YAML" escape hatch. This is the #1
  removal of "save-broken-frontmatter" incidents.

### 3. Drafting mode ≠ editing mode ≠ review mode

iA Writer's distinction: Focus mode is for producing words; turn it off when
you're shaping what's there. A good CMS acknowledges the phases:

- **Drafting**: focus on current sentence/paragraph (dim rest, no chrome)
- **Editing**: full document, outline visible, can scan
- **Review**: diff view, annotations, comments

Koto: has focus mode toggle. ✓ Gap: no outline/TOC view; no review/diff mode
on editor side (relies on GitHub PR review). Low priority for now, but
outline view is cheap to add (scan headings, render nav).

### 4. Two input modalities: markdown shortcuts **and** slash commands

Power users type `# `, `- `, `>`; newcomers want a discoverable menu.
Supporting both costs little — Tiptap StarterKit already provides the input
rules; a slash menu is a separable extension.

- Koto: shortcuts ✓ (via StarterKit), slash menu ✗.
- Recommendation: **add `@tiptap/suggestion`-based slash menu** with 10–15
  items (heading levels, bullet/ordered list, blockquote, code block, divider,
  Markdoc callout variants, image). Medium value, ~1 day of work.

### 5. Paste is the single highest-leverage feature

Contributors paste from Google Docs, Notion, Confluence, Slack, browser
address bar. Broken paste makes the whole editor feel broken.

Must-have behaviors:

- **URL paste on selection** → wrap in `[text](url)` link
- **URL paste on caret** → insert as clickable link (not bare text)
- **Image paste** → upload or at least inline as dataURI with a warning
- **HTML paste** → convert to markdown; strip inline styles; keep structure
- **Plain-text paste with markdown syntax** → option to "paste as markdown"
  (parses `*bold*`, etc.) via a keyboard modifier

Koto gap: using Tiptap defaults, which cover HTML→markdown imperfectly. URL-
on-selection works via the `link` mark. Image paste is the biggest gap
(see #6).

### 6. Images need a declared policy, then automate it

Three honest options:

| Policy | Where images live | Tradeoff |
|---|---|---|
| **Same-repo** | `docs/foo/image.png` | Fully versioned; bloats git; best for small volumes |
| **External bucket** | R2 / S3 / Cloudflare Images | Keeps git lean; adds moving part; URL refs decouple |
| **Base64 inline** | inside the markdown | Only ok for tiny icons; don't use for photos |

For a VitePress-targeted site with contributor volume ≤ low hundreds of
images, **same-repo** is usually right. That means:

- Drag-drop or paste → `POST /api/asset` to DO → DO commits the binary to
  GitHub (base64 encoded, on the working branch) → returns the path → editor
  inserts `![alt](relative-path.png)`

Koto gap: no image ingest at all. This is the **single biggest "feels
incomplete" gap** for non-technical editors.

### 7. Save boundaries should map to user mental models

Users think in two grains:

1. "I'm actively working on this piece" — needs **not-losing-work**, not
   every keystroke in git
2. "I'm done for now" or "this is ready to look at" — needs **an explicit
   checkpoint**

Good mapping:

- **Local draft** (per-file, persisted to `localStorage` + periodic IndexedDB
  snapshot): autosave every 5–15s
- **Commit to git** (a branch on the user's PR): explicit action OR on
  focus-loss after N minutes of inactivity
- **Mark PR ready** (move from draft PR to reviewable): explicit action only

Koto: only has explicit save (commit). No local draft persistence — so if the
browser crashes mid-edit, work is lost until the last commit.

Recommendation: **add local draft persistence** keyed by `repo + branch +
path`. On re-open, if the on-disk file matches what we committed but the
local draft is newer, show a "restore draft?" banner. ~½ day.

### 8. Make the git model invisible when possible

Every "branch", "PR", "ready for review" button forces the editor to learn a
model they don't have.

Tier 1 — editors should see:

- "You have unsaved changes"
- "Your edits are saved"
- "Submit for review" / "Your changes are in review"
- "Your changes are live" (when PR merged)

Tier 2 — power affordances, hidden behind a menu:

- Branch name, PR number, diff view, raw file history

Koto: currently exposes branches/PRs at Tier 1. Mostly OK because the
current audience is still "editors who understand git". Rename the labels to
task language as a cheap win:

- "New Branch" → "Start new edits"
- "Commit" → "Save to review branch"
- "Mark PR Ready" → "Submit for review"

### 9. Detect conflicts, don't resolve them in-browser

Three-way merge in a browser WYSIWYG is a bad experience. Better:

1. Every GET returns a SHA
2. Every PUT sends the SHA
3. On 409 conflict: stop, show the user "this file was changed by someone
   else; you can overwrite, or discard your edits and reload"

Koto: already sends SHA on save. ✓ Gap: the 409 path in the frontend isn't
surfaced with clear recovery actions; today it just bubbles as an error toast.

### 10. Cross-document links need autocomplete

VitePress uses `[text](./path.md)`. Obsidian uses `[[Note Name]]` with
auto-complete from the vault and auto-backlinks.

For Koto's VitePress target, the right primitive is the markdown link, but
with an **autocomplete** that scans the tree (we already have `/api/tree`)
and suggests paths when the user types `](` or `[[`.

Koto gap: no suggestion. Medium value for docs-heavy repos, low for
small sites.

### 11. Keep a "view source" escape hatch

When the WYSIWYG hides a bug or fails a round-trip, writers need to see the
markdown. The escape can be simple:

- A small "{}" button in the toolbar that toggles the main surface between
  Tiptap and a plain `<textarea>`/CodeMirror with the raw markdoc text
- Saves reach the same `draftContent` state; switching back re-parses

Koto gap: no raw view. ~2h to add, huge debuggability payoff.

### 12. Keyboard contracts are invariants

Writers across tools expect:

- `Cmd+S` — save (never "navigate to Save menu")
- `Cmd+B/I/U` — bold/italic/underline
- `Cmd+K` — insert link
- `Cmd+Z/Shift+Z` — undo/redo
- `Cmd+F` — find

Koto: Cmd+S wired ✓, StarterKit gives the formatting shortcuts ✓, no
find/replace. Find is a common ask once docs get long; defer until writers
complain.

### 13. Don't surprise the user with auto-transforms

Tiptap input rules can silently rewrite text (smart quotes, em-dashes,
ellipsis). Useful for some audiences, alarming for others (e.g., technical
writers copy-pasting code examples).

Koto: StarterKit defaults are mild. Decision: **no additional auto-transforms
by default**. If writers want smart punctuation, make it an opt-in.

---

## Tool comparison (at a glance)

| Aspect | Koto (today) | iA Writer | Decap | Tina | Obsidian |
|---|---|---|---|---|---|
| Primary surface | WYSIWYG (Tiptap) | plain markdown | WYSIWYG | inline live-preview | dual (source + preview) |
| Frontmatter | separate pane | inline YAML | form fields | form fields | inline |
| Slash menu | ✗ | ✗ | ✗ | ✗ | ✓ (palette, not inline) |
| Image upload | ✗ | drag-drop (local) | Git commit | Git commit | paste to vault |
| Autosave (local) | ✗ | continuous | continuous | continuous | continuous |
| Git commit grain | per save | n/a | per save | per save | per-interval batch |
| Conflict detect | SHA check | n/a | SHA check | SHA check | filesystem mtime |
| Cross-link autocomplete | ✗ | ✗ | ✗ | partial | ✓ wikilinks |
| Raw source view | ✗ | n/a (is the view) | toggle | toggle | ✓ |
| Focus mode | ✓ | ✓ | ✗ | ✗ | ✗ |

---

## Gap analysis for Koto

Ranked by (user-pain × frequency) / (cost to fix):

| # | Gap | Pain | Freq | Cost | Score |
|---|---|---|---|---|---|
| 1 | **No image upload** | high | high | medium | 🔴 |
| 2 | **No local draft persistence** | high (when it strikes) | rare but catastrophic | low | 🔴 |
| 3 | **Raw YAML frontmatter, no typed fields** | medium | high | medium | 🟠 |
| 4 | **No "view source" toggle** | medium | medium | low | 🟠 |
| 5 | **No slash menu** | medium (non-tech writers) | medium | medium | 🟠 |
| 6 | **409 conflict UX unclear** | medium | rare | low | 🟡 |
| 7 | **Git labels surface too much model** | low | ambient | very low | 🟡 |
| 8 | **No cross-document link autocomplete** | low–medium | depends on site size | medium | 🟡 |
| 9 | **No outline/TOC nav** | low | medium | low | 🟢 |
| 10 | **No paste-from-Google-Docs normalizer** | medium | varies | high | 🟢 |

---

## Recommended next moves, ordered

1. **Local draft persistence** (½ day) — single file `useDraftPersistence.svelte.ts`, keyed by `repo+branch+path`, uses `localStorage`, restore-or-discard banner on file open.
2. **"View source" toggle** (2h) — textarea alternative for the editor body, toggle button, same `draftContent` state.
3. **Image upload policy + endpoint** (1–2d) — `POST /api/asset` in DO that base64-commits to the working branch, frontend paste/drop handler, asset path inferred from current file's directory.
4. **Typed frontmatter fields** (1d for basic schema support) — read a `frontmatter` section from `.koto.json` declaring fields; fall back to raw YAML if not declared.
5. **Slash menu** (1d) — Tiptap suggestion extension, 10–15 items including Markdoc callouts.
6. **Rename git-surface labels** (30min) — cosmetic but meaningful for non-dev editors.
7. **Better 409 UX** (½d) — dedicated modal with reload/overwrite/discard choices.

Items 8–10 are nice-to-haves and can wait until a content-heavy pilot surfaces their need.

---

## Progress & deferrals — 2026-04-24

Everything 🔴 🟠 🟡 from the gap table above has been built. Both 🟢 items
(**Outline/TOC** and **Google Docs paste normalizer**) are **deliberately
deferred** — not because they'd be bad, but because the right trigger for
building them is a real user with a concrete example, not speculation:

- **Outline/TOC** is low-cost (~1 day) but only pays off on 2000+ line docs.
  Add on first legitimate ask — that ask will double as the test case.
- **Google Docs paste normalizer** is high-cost (weeks + ongoing maintenance
  as Google changes its clipboard format) and only benefits a narrow
  population (enterprise marketing/comm). Never build preemptively. Only
  build when a specific user surfaces broken paste *with their actual HTML
  sample* so it drives the test corpus.

Stance: **don't decide the next editor feature in a vacuum. Ship what's
built, watch what real users hit first, let their pain rank the backlog.**

## What to explicitly **not** do (yet)

- **No three-way merge in browser.** Detect conflicts; ask the human.
- **No real-time co-editing.** CRDT layer is a massive ongoing cost for a
  low-concurrency editorial workflow. Draft PRs + GitHub review is fine.
- **No AI features in-editor until the base is solid.** Writing assistance
  is tempting but it's the last 10%, not the first.
- **No custom DSL on top of Markdoc.** Markdoc tags are already enough of a
  deviation from pure markdown; adding more syntax is how you end up with
  something only your team understands.

---

## Sources

- [Tina CMS — visual editing CMS](https://tina.io/)
- [Decap CMS — open-source Git-based CMS](https://decapcms.org/)
- [9 best Git-based CMS platforms — LogRocket](https://blog.logrocket.com/9-best-git-based-cms-platforms/)
- [iA Writer — Focus Mode docs](https://ia.net/writer/support/editor/focus-mode)
- [iA Writer — design philosophy](https://ia.net/writer)
- [Tiptap — ProseMirror concepts](https://tiptap.dev/docs/editor/core-concepts/prosemirror)
- [Tiptap — Markdown introduction](https://tiptap.dev/docs/editor/markdown)
- [tiptap-markdown serializer](https://github.com/aguingand/tiptap-markdown)
- [GitLab — rich text editor development guidelines](https://docs.gitlab.com/development/fe_guide/content_editor/)
- [Front Matter CMS (VS Code)](https://github.com/estruyf/vscode-front-matter)
- [CKEditor — slash commands UX](https://ckeditor.com/blog/slash-commands/)
- [MDXEditor — images](https://mdxeditor.dev/editor/docs/images)
- [EasyMDE — image upload](https://github.com/Ionaru/easy-markdown-editor)
- [Obsidian — internal links & backlinks](https://help.obsidian.md/links)
- [Autosaving patterns in modern web apps — Medium](https://medium.com/@brooklyndippo/to-save-or-to-autosave-autosaving-patterns-in-modern-web-applications-39c26061aa6b)
- [Offline sync & conflict resolution patterns (2026)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/)
