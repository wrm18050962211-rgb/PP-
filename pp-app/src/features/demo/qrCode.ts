const qrVersion = 4;
const qrSize = 17 + qrVersion * 4;
const dataCodewordCount = 80;
const errorCorrectionCodewordCount = 20;
const formatErrorCorrectionBits = 1;
const maskPattern = 0;

export function createQrSvgDataUri(text: string) {
  const modules = createQrModules(text);
  const border = 4;
  const viewBoxSize = modules.length + border * 2;
  const path = modules
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + border},${y + border}h1v1h-1z` : '')))
    .filter(Boolean)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createQrModules(text: string) {
  const modules = createMatrix(false);
  const functionModules = createMatrix(false);

  const setFunctionModule = (x: number, y: number, isDark: boolean) => {
    if (x < 0 || y < 0 || x >= qrSize || y >= qrSize) return;
    modules[y][x] = isDark;
    functionModules[y][x] = true;
  };

  drawFinderPattern(3, 3, setFunctionModule);
  drawFinderPattern(qrSize - 4, 3, setFunctionModule);
  drawFinderPattern(3, qrSize - 4, setFunctionModule);
  drawAlignmentPattern(26, 26, setFunctionModule);
  drawTimingPatterns(setFunctionModule);
  drawFormatBits(setFunctionModule);
  setFunctionModule(8, qrSize - 8, true);

  const codewords = createCodewords(text);
  drawCodewords(modules, functionModules, codewords);
  applyMask(modules, functionModules);
  drawFormatBits(setFunctionModule);

  return modules;
}

function createMatrix(value: boolean) {
  return Array.from({ length: qrSize }, () => Array<boolean>(qrSize).fill(value));
}

function drawFinderPattern(centerX: number, centerY: number, setModule: (x: number, y: number, isDark: boolean) => void) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setModule(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPattern(centerX: number, centerY: number, setModule: (x: number, y: number, isDark: boolean) => void) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setModule(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawTimingPatterns(setModule: (x: number, y: number, isDark: boolean) => void) {
  for (let i = 8; i < qrSize - 8; i += 1) {
    const isDark = i % 2 === 0;
    setModule(6, i, isDark);
    setModule(i, 6, isDark);
  }
}

function drawFormatBits(setModule: (x: number, y: number, isDark: boolean) => void) {
  const bits = getFormatBits();

  for (let i = 0; i <= 5; i += 1) setModule(8, i, getBit(bits, i));
  setModule(8, 7, getBit(bits, 6));
  setModule(8, 8, getBit(bits, 7));
  setModule(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i += 1) setModule(qrSize - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i += 1) setModule(8, qrSize - 15 + i, getBit(bits, i));
}

function getFormatBits() {
  const data = (formatErrorCorrectionBits << 3) | maskPattern;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function createCodewords(text: string) {
  const dataBytes = [...new TextEncoder().encode(text)];
  const dataBits: boolean[] = [];

  appendBits(dataBits, 0x4, 4);
  appendBits(dataBits, dataBytes.length, 8);
  dataBytes.forEach((value) => appendBits(dataBits, value, 8));

  const dataCapacityBits = dataCodewordCount * 8;
  appendBits(dataBits, 0, Math.min(4, dataCapacityBits - dataBits.length));
  while (dataBits.length % 8 !== 0) dataBits.push(false);

  for (let padByteIndex = 0; dataBits.length < dataCapacityBits; padByteIndex += 1) {
    appendBits(dataBits, padByteIndex % 2 === 0 ? 0xec : 0x11, 8);
  }

  const dataCodewords = bitsToBytes(dataBits);
  return [...dataCodewords, ...reedSolomonRemainder(dataCodewords, errorCorrectionCodewordCount)];
}

function appendBits(target: boolean[], value: number, length: number) {
  if (length < 0) throw new Error('QR payload is too long for the demo code.');
  for (let i = length - 1; i >= 0; i -= 1) {
    target.push(getBit(value, i));
  }
}

function bitsToBytes(bits: boolean[]) {
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] ? 1 : 0);
    result.push(value);
  }
  return result;
}

function drawCodewords(modules: boolean[][], functionModules: boolean[][], codewords: number[]) {
  const bits = codewords.flatMap((codeword) => Array.from({ length: 8 }, (_, bitIndex) => getBit(codeword, 7 - bitIndex)));
  let bitIndex = 0;
  let upward = true;

  for (let right = qrSize - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;

    for (let vertical = 0; vertical < qrSize; vertical += 1) {
      const y = upward ? qrSize - 1 - vertical : vertical;
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx;
        if (!functionModules[y][x]) {
          modules[y][x] = bitIndex < bits.length ? bits[bitIndex] : false;
          bitIndex += 1;
        }
      }
    }

    upward = !upward;
  }
}

function applyMask(modules: boolean[][], functionModules: boolean[][]) {
  for (let y = 0; y < qrSize; y += 1) {
    for (let x = 0; x < qrSize; x += 1) {
      if (!functionModules[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
    }
  }
}

function reedSolomonRemainder(data: number[], degree: number) {
  const generator = reedSolomonGenerator(degree);
  const result = Array<number>(degree).fill(0);

  data.forEach((value) => {
    const factor = value ^ result.shift()!;
    result.push(0);
    generator.forEach((coefficient, index) => {
      result[index] ^= reedSolomonMultiply(coefficient, factor);
    });
  });

  return result;
}

function reedSolomonGenerator(degree: number) {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }

  return result;
}

function reedSolomonMultiply(x: number, y: number) {
  let result = 0;
  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((y >>> i) & 1) * x;
  }
  return result;
}

function getBit(value: number, index: number) {
  return ((value >>> index) & 1) !== 0;
}
