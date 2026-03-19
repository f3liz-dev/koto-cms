(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Restore scroll position baked in by PreviewPane on content rebuild.
  // Runs synchronously before first paint so there is no visible flash.
  if (window.__initialScrollY > 0) {
    window.scrollTo(0, window.__initialScrollY);
  }

  const getIndexedBlocks = () =>
    Array.from(document.body.querySelectorAll("[data-sync-index]"))
      .filter((el) => el instanceof HTMLElement)
      .sort((a, b) =>
        parseInt(a.dataset.syncIndex, 10) - parseInt(b.dataset.syncIndex, 10),
      );

  const isHidden = (el) => el.hidden || el.hasAttribute("hidden");

  const nearestVisible = (blocks, idx) => {
    for (let i = idx; i < blocks.length; i++) {
      if (!isHidden(blocks[i])) return i;
    }
    return idx;
  };

  const maxPreviewScroll = () =>
    Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);

  /**
   * Blend between block-based position and preview's own scroll bottom.
   *
   * When editorScrollRatio is 1 (editor at bottom), preview scrolls to its
   * own bottom regardless of content length difference.
   * For ratios below 1, we interpolate between the block-based target and
   * the preview bottom using the last 20% of the editor scroll range, so
   * the preview glides smoothly to its bottom as the editor approaches its end.
   */
  const resolveTarget = ({ syncIndex, blockProgress, editorScrollRatio }) => {
    const max = maxPreviewScroll();
    const blocks = getIndexedBlocks();
    if (!blocks.length) return editorScrollRatio >= 1 ? max : 0;

    let idx = blocks.findIndex(
      (b) => parseInt(b.dataset.syncIndex, 10) === syncIndex,
    );
    if (idx === -1) idx = Math.min(syncIndex, blocks.length - 1);

    // Block-based target (skip hidden placeholders)
    let blockTarget;
    if (isHidden(blocks[idx])) {
      const vi = nearestVisible(blocks, idx + 1);
      blockTarget = blocks[vi] ? blocks[vi].offsetTop : max;
    } else {
      const blockTop = blocks[idx].offsetTop;
      const nextVisibleIdx = nearestVisible(blocks, idx + 1);
      const nextTop = nextVisibleIdx < blocks.length && nextVisibleIdx !== idx
        ? blocks[nextVisibleIdx].offsetTop
        : document.documentElement.scrollHeight;
      const span = nextTop - blockTop;
      blockTarget = clamp(blockTop + span * clamp(blockProgress ?? 0, 0, 1), 0, max);
    }

    // In the last 20% of the editor scroll range, blend block target → preview bottom.
    // This ensures the preview always reaches its own bottom when the editor does.
    const blendStart = 0.8;
    if (editorScrollRatio >= blendStart) {
      const t = (editorScrollRatio - blendStart) / (1 - blendStart); // 0→1
      return blockTarget + (max - blockTarget) * t;
    }

    return blockTarget;
  };

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  let animFrom = 0;
  let animTo = 0;
  let animStart = 0;
  let animDuration = 120;
  let animFrame = 0;
  const BASE_DURATION = 120;
  const PX_PER_MS = 3;

  const animStep = (now) => {
    const elapsed = now - animStart;
    const t = clamp(elapsed / animDuration, 0, 1);
    window.scrollTo(0, animFrom + (animTo - animFrom) * easeOut(t));
    if (t < 1) {
      animFrame = requestAnimationFrame(animStep);
    } else {
      // Animation complete — report final scrollY so parent can bake it
      // into the next srcDoc rebuild, preventing flash-to-top.
      window.parent.postMessage({ type: "cms:preview-scroll-y", y: window.scrollY }, "*");
    }
  };

  const smoothScrollTo = (destY) => {
    cancelAnimationFrame(animFrame);
    const from = window.scrollY;
    const dist = Math.abs(destY - from);
    animDuration = clamp(dist / PX_PER_MS, BASE_DURATION, 400);
    animFrom = from;
    animTo = destY;
    animStart = performance.now();
    animFrame = requestAnimationFrame(animStep);
  };

  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "cms:sync-editor-block") return;

    const dest = resolveTarget({
      syncIndex: data.syncIndex ?? 0,
      blockProgress: data.blockProgress ?? 0,
      editorScrollRatio: data.editorScrollRatio ?? 0,
    });

    if (Math.abs(dest - animTo) >= 2) smoothScrollTo(dest);
  });

  // Sync is editor → preview only. No scroll events emitted back.
})();