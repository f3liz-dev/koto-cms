import { useMemo } from "preact/hooks";
import previewFrameTemplate from "../preview/preview.frame.inc.html?raw";
import previewRuntime from "../preview/preview.runtime.inc.js?raw";

/**
 * Sanitize rendered HTML before injecting into the preview frame.
 * Uses the browser's built-in DOMParser — no extra dependencies needed.
 *
 * Removes: <script>, <meta http-equiv>, on* event attributes,
 * and javascript: URIs from href/src/action.
 *
 * We do NOT need to strip <style> or external <link> tags because the
 * iframe has no allow-same-origin, so it runs in an opaque origin and
 * cannot exfiltrate anything back to the parent page anyway.
 */
function sanitizeHtml(html) {
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove all <script> elements (belt-and-suspenders on top of no allow-scripts
  // for injected content — the runtime script is injected separately after this)
  doc.querySelectorAll("script").forEach((el) => el.remove());

  // Remove <meta http-equiv> (redirect / CSP override attempts)
  doc.querySelectorAll("meta[http-equiv]").forEach((el) => el.remove());

  // Walk every element and strip dangerous attributes
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      // Strip all on* event handlers (onclick, onload, onerror, …)
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
    // Strip javascript: URIs
    for (const attr of ["href", "src", "action", "formaction", "data"]) {
      const val = el.getAttribute(attr);
      if (val && /^\s*javascript\s*:/i.test(val)) {
        el.removeAttribute(attr);
      }
    }
  });

  return doc.body.innerHTML;
}

/**
 * Build the full srcdoc string.
 * initialScrollY is baked in as an inline script that runs synchronously
 * before first paint — eliminating the flash-to-top on content updates.
 */
function buildPreviewSrcDoc(html, initialScrollY = 0) {
  const safe = sanitizeHtml(html);
  // Inline restore script runs before the runtime so scroll is set on first paint
  const restoreScript = initialScrollY > 0
    ? `<script>window.__initialScrollY=${Math.round(initialScrollY)};</script>`
    : "";
  const frame = previewFrameTemplate.replace("<!-- PREVIEW_HTML -->", safe);
  return frame.replace(
    "<!-- PREVIEW_RUNTIME -->",
    `${restoreScript}<script>${previewRuntime}</script>`,
  );
}

export function PreviewPane({ frameRef, previewResult, initialScrollY }) {
  const srcDoc = useMemo(
    () => buildPreviewSrcDoc(previewResult?.html, initialScrollY ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewResult?.html, initialScrollY],
  );

  return (
    <aside class="preview-pane" aria-label="VitePress preview">
      <div class="preview-pane-head">VitePress Preview (Mocked)</div>
      {previewResult?.warnings?.length ? (
        <ul class="preview-warnings">
          {previewResult.warnings.map((warning) => (
            <li>{warning}</li>
          ))}
        </ul>
      ) : null}
      <iframe
        ref={frameRef}
        class="preview-frame"
        title="VitePress preview frame"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
      />
    </aside>
  );
}