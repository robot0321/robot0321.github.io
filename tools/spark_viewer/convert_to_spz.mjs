import { readFile, writeFile } from "node:fs/promises";
import { transcodeSpz } from "@sparkjsdev/spark";

const args = process.argv.slice(2);
const [inputPath, outputPath] = args;

if (!inputPath || !outputPath) {
  console.error("Usage: node tools/spark_viewer/convert_to_spz.mjs input.ply output.spz [--preset identity|rotate-x-180|rotate-y-180|rotate-z-180] [--quaternion x,y,z,w] [--scale n] [--translate x,y,z]");
  process.exit(2);
}

const presets = {
  identity: [0, 0, 0, 1],
  "flip-polar": [1, 0, 0, 0],
  "rotate-x-180": [1, 0, 0, 0],
  "rotate-y-180": [0, 1, 0, 0],
  "rotate-z-180": [0, 0, 1, 0],
};

function getOption(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseVector(value, length, name) {
  const parsed = value.split(",").map(Number);
  if (parsed.length !== length || parsed.some((v) => !Number.isFinite(v))) {
    throw new Error(`${name} must be ${length} comma-separated numbers`);
  }
  return parsed;
}

const preset = getOption("--preset") ?? "identity";
if (!(preset in presets)) {
  throw new Error(`Unknown preset: ${preset}`);
}

const transform = {
  quaternion: presets[preset],
};

const quaternion = getOption("--quaternion");
if (quaternion) {
  transform.quaternion = parseVector(quaternion, 4, "--quaternion");
}

const scale = getOption("--scale");
if (scale) {
  transform.scale = Number(scale);
  if (!Number.isFinite(transform.scale)) {
    throw new Error("--scale must be a number");
  }
}

const translate = getOption("--translate");
if (translate) {
  transform.translate = parseVector(translate, 3, "--translate");
}

const fileBytes = new Uint8Array(await readFile(inputPath));
const { fileBytes: spzBytes, clippedCount } = await transcodeSpz({
  inputs: [{ fileBytes, pathOrUrl: inputPath, transform }],
  maxSh: 0,
});

await writeFile(outputPath, spzBytes);
console.log(`Wrote ${outputPath} (${spzBytes.byteLength} bytes, clipped=${clippedCount}, preset=${preset})`);
