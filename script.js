// ---------------------------
// Emoji Mosaic Generator (WASM powered)
// ---------------------------

// === DOM elements ===
const fileInput = document.getElementById("imageUpload"); // <input type="file" id="imageUpload">
const inputCanvas = document.getElementById("inputCanvas"); // <canvas id="inputCanvas"></canvas>
const inputCtx = inputCanvas.getContext("2d");
const outputContainer = document.getElementById("mosaicContainer"); // <div id="mosaicContainer"></div>

// === Settings ===
const tileSize = 8; // adjust tile size if needed
let imageLoaded = false;

// STEP 2 — Convert emoji file names → actual emoji characters
function filenameToEmoji(name) {
  const hexes = name
    .toLowerCase()
    .split('/').pop()          // "emoji_u1f602.svg"
    .replace(/^emoji_u/, '')   // "1f602.svg"
    .replace(/\.svg$/, '')     // "1f602"
    .split('_');               // handles multi-part emojis too (like family emojis)

  return String.fromCodePoint(...hexes.map(h => parseInt(h, 16)));
}

// === Step 1: initialize WASM and KD-tree ===
(async function initWasmAndTree() {
  try {
    console.log("⏳ Initializing WebAssembly + KD-tree...");
    await loadWasmModule("build/full_mosaic.wasm");
    await loadKDTreeIntoWasm("kd_tree.json");
    console.log("✅ WASM and KD-tree ready.");
  } catch (e) {
    console.error("❌ WASM init failed:", e);
  }
})();

// === Step 2: image upload handler ===
// === Upload handler: PREPROCESS (crop + warm tone + HDR) -> MOSAIC ===
fileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    // 1) Run your preprocessor (defined in index-1.html)
    //    This opens the crop modal, applies warm tone + GLFX unsharpMask,
    //    and returns a Canvas with the processed result.
    const processedCanvas = await window.preprocessEmojiEnhance(file, {
      portraitWidth: 1080,
      portraitHeight: 1354,
      toneBrightness: 0.8,
      toneRGBA: 'rgba(244,233,50,0.26)',
      unsharpRadius: 53,
      unsharpStrength: 2.9,
      finalFilter: 'brightness(1.18) contrast(1.05)',
      overlaySrc: true // set to 'overlay.png' if you want to blend an overlay
    });

    // 2) Draw processed image into the hidden inputCanvas (feeds your pipeline)
    inputCanvas.width = processedCanvas.width;
    inputCanvas.height = processedCanvas.height;
    inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
    inputCtx.drawImage(processedCanvas, 0, 0);
    imageLoaded = true;

    // 3) Ensure WASM + KD-tree are ready (same as before)
    if (!window.wasmReady) {
      console.log("WASM not ready yet, reloading...");
      await loadWasmModule("build/full_mosaic.wasm");
      await loadKDTreeIntoWasm("kd_tree.json");
    }

    console.log("🖼️ Preprocessed image ready, generating mosaic...");

    // 4) Compute tile colors (unchanged)
    const { colors, cols, rows } = calculateTileColorsFromCanvas(inputCanvas, tileSize);

    // 5) Run KD-tree matching (unchanged)
    console.time("🧩 Mosaic matching time");
    let results = runMatchingAndGetResults(colors);
    console.timeEnd("🧩 Mosaic matching time");

    // 6) Convert filenames → real emoji characters (unchanged)
    results = results.map(filenameToEmoji);

    // 7) Render mosaic (unchanged)
    await renderFromResults(results, cols, rows, tileSize, 0.83);

    console.log("✅ Mosaic generated successfully (with preprocess)!");
  } catch (err) {
    console.error("Preprocess/mosaic failed:", err);
    alert("Could not process image. Check WebGL permissions (for GLFX) or try another image.");
  }
});



async function renderFromResults(results, cols, rows, tileSize, scale = 1.00) {
  outputContainer.innerHTML = "";

  let canvas = document.getElementById("mosaicCanvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "mosaicCanvas";
    outputContainer.appendChild(canvas);
  }

  const scaleOutput = 4; // 4x = Maximum resolution (was 3)
  
  canvas.width = cols * tileSize * scaleOutput;
  canvas.height = rows * tileSize * scaleOutput;
  
  console.log(`Canvas: ${canvas.width}x${canvas.height}px`);
  console.log(`Megapixels: ${(canvas.width * canvas.height / 1000000).toFixed(1)}MP`);
  
  canvas.style.width = (cols * tileSize) + "px";
  canvas.style.height = (rows * tileSize) + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(scaleOutput, scaleOutput);

  await document.fonts.load(`${tileSize * scale}px NotoEmoji`);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `${tileSize * scale}px NotoEmoji`;
  ctx.textBaseline = "top";

  const offset = (tileSize - (tileSize * scale)) / 2;

  let index = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, index++) {
      const emoji = results[index] || "⬜";
      ctx.fillText(emoji, x * tileSize + offset, y * tileSize + offset);
    }
  }

  console.log("✅ Mosaic rendered at 4K resolution");
}

// === Optional: reset button ===
function resetMosaic() {
  outputContainer.innerHTML = "";
  inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
  fileInput.value = "";
  imageLoaded = false;
  console.log("🔁 Mosaic reset.");
}



// === Optional: export 

// === Ultra HD Download (Perfect Zoom, No Blur) ===
// === Ultra HD Download (MAXIMUM Quality & Resolution) ===
// === Ultra HD Download (MAXIMUM Quality & Resolution) ===
function downloadUltraHD() {
  const canvas = document.getElementById("mosaicCanvas");
  if (!canvas) return alert("Please generate the mosaic first!");
  
  console.log(`Ultra HD: ${canvas.width}x${canvas.height}px`);

  const link = document.createElement("a");
  link.download = "mosaic-ultra-hd.png";
  link.href = canvas.toDataURL("image/png");
  link.click();

  console.log("✅ Ultra HD PNG Downloaded (perfect quality)");
}

// === Standard Quality Download (Smaller Resolution + File) ===
// === Standard Quality Download (Adjustable) ===
function downloadStandard() {
  const canvas = document.getElementById("mosaicCanvas");
  if (!canvas) return alert("Please generate the mosaic first!");
  
  // Create a smaller canvas
  const smallCanvas = document.createElement("canvas");
  smallCanvas.width = canvas.width * 0.62; // 65% size (adjust this)
  smallCanvas.height = canvas.height * 0.62; // 65% size (adjust this)
  
  const ctx = smallCanvas.getContext("2d");
  ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
  
  console.log(`Standard: ${smallCanvas.width}x${smallCanvas.height}px`);

  const link = document.createElement("a");
  link.download = "mosaic-standard.jpg";
  link.href = smallCanvas.toDataURL("image/jpeg", 0.85); // 90% quality (adjust this)
  link.click();

  console.log("✅ Standard JPEG Downloaded");
}

document.getElementById("downloadUltraHD").addEventListener("click", downloadUltraHD);
document.getElementById("downloadStandard").addEventListener("click", downloadStandard);


