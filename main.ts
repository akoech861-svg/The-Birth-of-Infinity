import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

const WIDTH = 1024;
const HEIGHT = 1024;

// CRC32 table for PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function calculateCRC(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  
  // Length
  chunk[0] = (len >>> 24) & 0xff;
  chunk[1] = (len >>> 16) & 0xff;
  chunk[2] = (len >>> 8) & 0xff;
  chunk[3] = len & 0xff;
  
  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  
  // Data
  chunk.set(data, 8);
  
  // CRC (type + data)
  const crcBuf = new Uint8Array(4 + len);
  for (let i = 0; i < 4; i++) {
    crcBuf[i] = type.charCodeAt(i);
  }
  crcBuf.set(data, 4);
  const crc = calculateCRC(crcBuf);
  
  const crcOffset = 8 + len;
  chunk[crcOffset] = (crc >>> 24) & 0xff;
  chunk[crcOffset + 1] = (crc >>> 16) & 0xff;
  chunk[crcOffset + 2] = (crc >>> 8) & 0xff;
  chunk[crcOffset + 3] = crc & 0xff;
  
  return chunk;
}

function encodePNG(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdrData = new Uint8Array(13);
  ihdrData[0] = (width >>> 24) & 0xff;
  ihdrData[1] = (width >>> 16) & 0xff;
  ihdrData[2] = (width >>> 8) & 0xff;
  ihdrData[3] = width & 0xff;
  ihdrData[4] = (height >>> 24) & 0xff;
  ihdrData[5] = (height >>> 16) & 0xff;
  ihdrData[6] = (height >>> 8) & 0xff;
  ihdrData[7] = height & 0xff;
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  const rowSize = width * 4;
  const filteredData = new Uint8Array(height * (rowSize + 1));
  for (let y = 0; y < height; y++) {
    filteredData[y * (rowSize + 1)] = 0; // filter type 0
    filteredData.set(rgba.subarray(y * rowSize, (y + 1) * rowSize), y * (rowSize + 1) + 1);
  }
  
  const compressed = zlib.deflateSync(filteredData, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', new Uint8Array(0));
  
  const totalLength = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(totalLength);
  let offset = 0;
  png.set(signature, offset); offset += signature.length;
  png.set(ihdrChunk, offset); offset += ihdrChunk.length;
  png.set(idatChunk, offset); offset += idatChunk.length;
  png.set(iendChunk, offset);
  
  return png;
}

function hash(n: number): number {
  return Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
}

function noise2D(x: number, y: number): number {
  const X = Math.floor(x);
  const Y = Math.floor(y);
  const fx = x - X;
  const fy = y - Y;
  
  const n00 = hash(X + Y * 57);
  const n10 = hash(X + 1 + Y * 57);
  const n01 = hash(X + (Y + 1) * 57);
  const n11 = hash(X + 1 + (Y + 1) * 57);
  
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return val;
}

function renderImage(): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y++) {
    const py = (y - 512) / 512;
    
    for (let x = 0; x < WIDTH; x++) {
      const nx = (x - 512) / 512;
      const idx = (y * WIDTH + x) * 4;
      
      // 1. Background Space & Nebulae
      const distFromCenter = Math.sqrt(nx * nx + py * py);
      const bgAngle = Math.atan2(py, nx);
      
      const n1 = fbm(nx * 3 + 10, py * 3 + 10, 4);
      const n2 = fbm(nx * 6 - 5, py * 6 + 5, 3);
      
      let r = 5 + n1 * 35 + Math.max(0, 1 - distFromCenter * 1.2) * 20;
      let g = 2 + n2 * 25 + Math.sin(bgAngle * 3) * 10;
      let b = 15 + n1 * 70 + n2 * 50;
      
      const nebulaGlow = Math.pow(n1, 1.5) * (1.2 - distFromCenter * 0.5);
      r += nebulaGlow * 120;
      g += nebulaGlow * 40;
      b += nebulaGlow * 220;
      
      // Star field
      const starHash = hash(x * 12.9898 + y * 78.233);
      if (starHash > 0.995) {
        const starBrightness = (starHash - 0.995) / 0.005;
        const isGold = hash(x * 3.14 + y * 2.71) > 0.7;
        r += starBrightness * (isGold ? 255 : 200);
        g += starBrightness * (isGold ? 215 : 220);
        b += starBrightness * (isGold ? 100 : 255);
      } else if (starHash > 0.985) {
        const starBrightness = ((starHash - 0.985) / 0.01) * 0.4;
        r += starBrightness * 180;
        g += starBrightness * 180;
        b += starBrightness * 255;
      }

      // 2. Shattered Planet
      const planetCy = 0.55;
      const planetDist = Math.sqrt(nx * nx + (py - planetCy) * (py - planetCy));
      const planetRadius = 0.42;
      
      if (planetDist < planetRadius) {
        const pAngle = Math.atan2(py - planetCy, nx);
        const surfaceNoise = fbm(nx * 8 + pAngle * 2, (py - planetCy) * 8, 4);
        
        const lightDot = (-nx * 0.5 - (py - planetCy) * 0.8) / planetDist;
        const lighting = Math.max(0.1, lightDot * 0.8 + 0.3);
        
        r = 20 + surfaceNoise * 40;
        g = 18 + surfaceNoise * 35;
        b = 30 + surfaceNoise * 60;
        
        r *= lighting;
        g *= lighting;
        b *= lighting;
        
        const chasmPattern = Math.sin(pAngle * 8 + surfaceNoise * 10) * Math.sin(planetDist * 15);
        if (chasmPattern > 0.7 || (planetDist > 0.35 && surfaceNoise > 0.6)) {
          const glowIntensity = Math.min(1, (chasmPattern - 0.7) * 3.3 + (surfaceNoise > 0.6 ? 0.8 : 0));
          r = r * (1 - glowIntensity) + glowIntensity * 255;
          g = g * (1 - glowIntensity) + glowIntensity * 185;
          b = b * (1 - glowIntensity) + glowIntensity * 50;
        }
        
        const rim = Math.pow((planetRadius - planetDist) / planetRadius, 0.5);
        r += rim * 80;
        g += rim * 120;
        b += rim * 200;
      }

      // Floating debris shards
      const debrisAngle = Math.atan2(py - 0.45, nx);
      const debrisDist = Math.sqrt(nx * nx + (py - 0.45) * (py - 0.45));
      if (debrisDist > 0.38 && debrisDist < 0.65) {
        const chunkHash = hash(Math.floor(debrisAngle * 10) + Math.floor(debrisDist * 20));
        if (chunkHash > 0.85) {
          const chunkIntensity = (chunkHash - 0.85) / 0.15;
          r += chunkIntensity * 200;
          g += chunkIntensity * 140;
          b += chunkIntensity * 250;
        }
      }

      // 3. Cosmic Phoenix Emerging
      const phxY = py + 0.15;
      
      const bodyWidth = 0.08 * (1.2 + phxY);
      const isBody = Math.abs(nx) < bodyWidth && phxY >= -0.5 && phxY <= 0.4;
      
      const wingDistLeft = Math.sqrt((-nx - 0.05) * (-nx - 0.05) + (phxY + 0.1) * (phxY + 0.1));
      const wingShapeLeft = wingDistLeft < 0.48 && phxY < 0.2 && phxY > -0.65 && (-nx) > 0.02;
      
      const wingDistRight = Math.sqrt((nx - 0.05) * (nx - 0.05) + (phxY + 0.1) * (phxY + 0.1));
      const wingShapeRight = wingDistRight < 0.48 && phxY < 0.2 && phxY > -0.65 && nx > 0.02;
      
      const headDist = Math.sqrt(nx * nx + (py + 0.55) * (py + 0.55));
      const isHead = headDist < 0.09;
      const isCrown = py >= -0.75 && py <= -0.55 && Math.abs(nx) < 0.06 + (py + 0.55) * 0.2;

      const tailWidth = 0.06 + (phxY - 0.1) * 0.15;
      const isTail = Math.abs(nx) < tailWidth && phxY >= 0.2 && phxY <= 0.55;

      if (isBody || wingShapeLeft || wingShapeRight || isHead || isCrown || isTail) {
        const featherPattern = Math.sin(nx * 60 + py * 40) * 0.5 + 0.5;
        const plasmaFlow = fbm(nx * 15, py * 15, 3);
        
        let phoenixR = 255;
        let phoenixG = 215;
        let phoenixB = 100;
        
        if (isBody || isHead) {
          phoenixR = 255;
          phoenixG = 240 + plasmaFlow * 15;
          phoenixB = 150 + featherPattern * 100;
        } else if (wingShapeLeft || wingShapeRight) {
          phoenixR = 50 + plasmaFlow * 100 + featherPattern * 50;
          phoenixG = 150 + plasmaFlow * 105;
          phoenixB = 240 + featherPattern * 15;
          
          if (featherPattern > 0.75) {
            phoenixR = 255;
            phoenixG = 215;
            phoenixB = 100;
          }
        } else if (isCrown) {
          phoenixR = 255;
          phoenixG = 220;
          phoenixB = 255;
        } else if (isTail) {
          phoenixR = 200 + plasmaFlow * 55;
          phoenixG = 100 + featherPattern * 100;
          phoenixB = 255;
        }
        
        const intensity = 1.2 + plasmaFlow * 0.3 + featherPattern * 0.2;
        r = Math.min(255, phoenixR * intensity);
        g = Math.min(255, phoenixG * intensity);
        b = Math.min(255, phoenixB * intensity);
      }
      
      const haloDist = Math.sqrt(nx * nx + (py + 0.2) * (py + 0.2));
      if (haloDist > 0.25 && haloDist < 0.65) {
        const haloAngle = Math.atan2(py + 0.2, nx);
        const haloRays = Math.sin(haloAngle * 12 + fbm(nx * 5, py * 5, 2) * 5) * 0.5 + 0.5;
        const haloAlpha = Math.max(0, (0.65 - haloDist) / 0.4) * haloRays * 0.5;
        
        r += haloAlpha * 120;
        g += haloAlpha * 80;
        b += haloAlpha * 220;
      }

      rgba[idx] = Math.max(0, Math.min(255, Math.round(r)));
      rgba[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      rgba[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      rgba[idx + 3] = 255;
    }
  }

  return encodePNG(WIDTH, HEIGHT, rgba);
}

function main() {
  try {
    console.log('Running generator run 1...');
    const run1 = renderImage();
    
    console.log('Running generator run 2...');
    const run2 = renderImage();
    
    // 1. Verify determinism (Run 1 and Run 2 identical byte-for-byte)
    if (!run1 || !run2 || run1.length !== run2.length || Buffer.compare(run1, run2) !== 0) {
      console.error('ERROR: Generator runs are not deterministic!');
      process.exit(1);
    }
    console.log('✓ Determinism verified: Run 1 and Run 2 are identical byte-for-byte.');

    // 2. Default output directory must be "/output", using process.env.MAKEFUN_OUTPUT_DIR || '/output'
    const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
    fs.mkdirSync(outputDir, { recursive: true });

    // 3. Write only "entry.png" to the selected output directory
    const outputPath = `${outputDir.replace(/\/+$/, '')}/entry.png`;
    fs.writeFileSync(outputPath, run1);

    // 4. Verify file size (must be no larger than 1 MiB)
    const stats = fs.statSync(outputPath);
    const maxSizeBytes = 1024 * 1024;
    const fileSizeMiB = stats.size / (1024 * 1024);
    console.log(`✓ File size: ${stats.size} bytes (${fileSizeMiB.toFixed(2)} MiB)`);
    if (stats.size > maxSizeBytes) {
      console.error(`ERROR: File size (${stats.size} bytes) exceeds 1 MiB limit!`);
      process.exit(1);
    }

    // 5. Verify PNG signature & header (magic bytes)
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (run1.length < 8 || Buffer.compare(run1.subarray(0, 8), pngSignature) !== 0) {
      console.error('ERROR: Generated file is not a valid PNG (invalid signature)!');
      process.exit(1);
    }
    console.log('✓ PNG signature verified.');

    // 6. Verify image dimensions and metadata from IHDR chunk (requires at least 26 bytes for bit depth and color type at offsets 24 and 25)
    if (run1.length < 26) {
      console.error('ERROR: PNG file too short to contain IHDR chunk, bit depth, and color type (less than 26 bytes)!');
      process.exit(1);
    }
    const width = (run1[16] << 24) | (run1[17] << 16) | (run1[18] << 8) | run1[19];
    const height = (run1[20] << 24) | (run1[21] << 16) | (run1[22] << 8) | run1[23];
    const bitDepth = run1[24];
    const colorType = run1[25];

    console.log(`✓ Image dimensions: ${width}x${height}`);
    console.log(`✓ PNG metadata: bit depth = ${bitDepth}, color type = ${colorType}`);

    if (width !== WIDTH || height !== HEIGHT) {
      console.error(`ERROR: Dimensions mismatch! Expected ${WIDTH}x${HEIGHT}, got ${width}x${height}`);
      process.exit(1);
    }
    if (width > 1024 || height > 1024) {
      console.error(`ERROR: Dimensions exceed maximum allowed 1024x1024 (${width}x${height})!`);
      process.exit(1);
    }

    console.log(`SUCCESS: entry.png successfully generated and verified at ${outputPath}.`);
  } catch (err) {
    console.error('ERROR: Uncaught exception during generation or verification:', err);
    process.exit(1);
  }
}

main();
