// wasm_glue.js (non-module, attach functions to window)
(function () {
  let wasmInstance = null;
  let wasmExports = null;
  window.emojiSrcs = []; // global list of sprite filenames used by wasm
  window.wasmReady = false;

async function loadWasmModule(wasmUrl = "build/full_mosaic.wasm") {
  const resp = await fetch(wasmUrl);
  if (!resp.ok) throw new Error("Failed to fetch wasm: " + resp.statusText);
  const bytes = await resp.arrayBuffer();

  // ✅ Add minimal env imports AssemblyScript needs
  const imports = {
    env: {
      abort(_msg, _file, line, column) {
        console.error("abort called at index.ts:" + line + ":" + column);
      },
      seed: Date.now, // optional
    }
  };

  const { instance } = await WebAssembly.instantiate(bytes, imports);
  wasm = instance;
  wasmExports = instance.exports;
  window.wasmReady = true;
  console.log("WASM module loaded ✅");
  return wasmExports;
}
  
  async function loadKDTreeIntoWasm(kdJsonUrl = "kd_tree.json") {
    if (!wasmExports) throw new Error("WASM not loaded");
    const resp = await fetch(kdJsonUrl);
    if (!resp.ok) throw new Error("Failed to fetch kd_tree.json: " + resp.statusText);
    const tree = await resp.json();

    const nodes = [];
    const srcMap = new Map();
    window.emojiSrcs = [];

    function flatten(node) {
      if (!node) return -1;
      const leftIdx = node.left ? flatten(node.left) : -1;
      const rightIdx = node.right ? flatten(node.right) : -1;
      let srcIndex = -1;
      if (node.point && node.point.src) {
        const s = node.point.src;
        if (srcMap.has(s)) srcIndex = srcMap.get(s);
        else {
          srcIndex = window.emojiSrcs.length;
          window.emojiSrcs.push(s);
          srcMap.set(s, srcIndex);
        }
      }
      const avg = (node.point && node.point.avg) ? node.point.avg : [0,0,0];
      const axis = (typeof node.axis === "number") ? node.axis : 0;
      const idx = nodes.length;
      nodes.push({ avg: avg, left: leftIdx, right: rightIdx, axis: axis, srcIndex: srcIndex });
      return idx;
    }

    const rootIndex = flatten(tree);

    wasmExports.initNodeCount(nodes.length | 0);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      // setNodeAt(index, r,g,b, left,right, axis, srcIndex)
      wasmExports.setNodeAt(
        i | 0,
        n.avg[0] || 0, n.avg[1] || 0, n.avg[2] || 0,
        (n.left | 0), (n.right | 0),
        (n.axis | 0),
        (n.srcIndex | 0)
      );
    }
    wasmExports.setRootIndex(rootIndex | 0);

    console.log("KD-tree uploaded to WASM:", nodes.length, "nodes,", window.emojiSrcs.length, "emoji files");
    return { nodesCount: nodes.length, rootIndex, emojiSrcs: window.emojiSrcs };
  }

  // compute tile averages from a canvas (copy of the method described earlier)
  function calculateTileColorsFromCanvas(inputCanvas, tileSize = 16) {
    const ctx = inputCanvas.getContext("2d");
    const width = inputCanvas.width, height = inputCanvas.height;
    const cols = Math.floor(width / tileSize);
    const rows = Math.floor(height / tileSize);
    const colors = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = col * tileSize;
        const sy = row * tileSize;
        const imd = ctx.getImageData(sx, sy, tileSize, tileSize);
        const data = imd.data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let p = 0; p < data.length; p += 4) {
          const a = data[p + 3];
          if (a === 0) continue;
          rSum += data[p];
          gSum += data[p + 1];
          bSum += data[p + 2];
          count++;
        }
        if (count === 0) { colors.push([0,0,0]); }
        else { colors.push([rSum / count, gSum / count, bSum / count]); }
      }
    }
    return { colors, cols, rows };
  }

  function runMatchingAndGetResults(colors) {
    if (!wasmExports) throw new Error("WASM not loaded");
    const tileCount = colors.length | 0;
    wasmExports.initTileCount(tileCount);
    for (let i = 0; i < tileCount; i++) {
      const c = colors[i];
      wasmExports.setTileColorAt(i | 0, c[0], c[1], c[2]);
    }
    wasmExports.processAll();
    const out = new Array(tileCount);
    for (let i = 0; i < tileCount; i++) {
      const srcIdx = wasmExports.getResultAt(i | 0);
      out[i] = (srcIdx >= 0 && srcIdx < window.emojiSrcs.length) ? window.emojiSrcs[srcIdx] : null;
    }
    return out;
  }

  // expose as globals
  window.loadWasmModule = loadWasmModule;
  window.loadKDTreeIntoWasm = loadKDTreeIntoWasm;
  window.calculateTileColorsFromCanvas = calculateTileColorsFromCanvas;
  window.runMatchingAndGetResults = runMatchingAndGetResults;
})();