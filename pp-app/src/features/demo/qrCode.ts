const qrVersion = 4;
const qrSize = 17 + qrVersion * 4;
const qrDataCodewords = 80;
const qrEcCodewords = 20;
const qrMaxBytes = 78;

type QrCell = boolean | null;

export function createQrMatrix(value: string): boolean[][] {
  const data = encodeData(value);
  const ec = createErrorCorrection(data, qrEcCodewords);
  const codewordBits = [...data, ...ec].flatMap((codeword) => toBits(codeword, 8));
  const modules: QrCell[][] = Array.from({ length: qrSize }, () => Array.from({ length: qrSize }, () => null));
  const reserved: boolean[][] = Array.from({ length: qrSize }, () => Array.from({ length: qrSize }, () => false));

  function setFunctionModule(row: number, col: number, dark: boolean) {
    if (row < 0 || row >= qrSize || col < 0 || col >= qrSize) return;
    modules[row][col] = dark;
    reserved[row][col] = true;
  }

  drawFinder(modules, reserved, 0, 0);
  drawFinder(modules, reserved, qrSize - 7, 0);
  drawFinder(modules, reserved, 0, qrSize - 7);
  drawAlignment(setFunctionModule, 26, 26);
  drawTiming(setFunctionModule);
  reserveFormatAreas(setFunctionModule);
  setFunctionModule(qrSize - 8, 8, true);

  let bitIndex = 0;
  let upward = true;
  for (let right = qrSize - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < qrSize; vertical += 1) {
      const row = upward ? qrSize - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        if (reserved[row][col]) continue;
        let dark = bitIndex < codewordBits.length ? codewordBits[bitIndex] === 1 : false;
        bitIndex += 1;
        if ((row + col) % 2 === 0) dark = !dark;
        modules[row][col] = dark;
      }
    }
    upward = !upward;
  }

  drawFormatBits(setFunctionModule);
  return modules.map((row) => row.map(Boolean));
}

export function createQrSvgPath(matrix: boolean[][]) {
  return matrix
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1H${x}z` : '')).filter(Boolean))
    .join('');
}

export function getQrSize() {
  return qrSize;
}

function encodeData(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > qrMaxBytes) throw new Error('二维码链接太长，请使用更短的访问地址');

  const bits = [...toBits(0b0100, 4), ...toBits(bytes.length, 8), ...bytes.flatMap((byte) => toBits(byte, 8))];
  const capacityBits = qrDataCodewords * 8;
  const terminatorLength = Math.min(4, capacityBits - bits.length);
  bits.push(...Array.from({ length: terminatorLength }, () => 0));
  while (bits.length % 8 !== 0) bits.push(0);

  const data = bitsToCodewords(bits);
  const pads = [0xec, 0x11];
  for (let index = 0; data.length < qrDataCodewords; index += 1) {
    data.push(pads[index % pads.length]);
  }
  return data;
}

function drawFinder(modules: QrCell[][], reserved: boolean[][], top: number, left: number) {
  for (let row = -1; row <= 7; row += 1) {
    for (let col = -1; col <= 7; col += 1) {
      const y = top + row;
      const x = left + col;
      if (y < 0 || y >= qrSize || x < 0 || x >= qrSize) continue;
      const inPattern = row >= 0 && row <= 6 && col >= 0 && col <= 6;
      const dark = inPattern && (row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
      modules[y][x] = dark;
      reserved[y][x] = true;
    }
  }
}

function drawAlignment(setFunctionModule: (row: number, col: number, dark: boolean) => void, centerRow: number, centerCol: number) {
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      const distance = Math.max(Math.abs(row), Math.abs(col));
      setFunctionModule(centerRow + row, centerCol + col, distance === 2 || distance === 0);
    }
  }
}

function drawTiming(setFunctionModule: (row: number, col: number, dark: boolean) => void) {
  for (let index = 8; index < qrSize - 8; index += 1) {
    const dark = index % 2 === 0;
    setFunctionModule(6, index, dark);
    setFunctionModule(index, 6, dark);
  }
}

function reserveFormatAreas(setFunctionModule: (row: number, col: number, dark: boolean) => void) {
  for (let index = 0; index <= 8; index += 1) {
    if (index !== 6) {
      setFunctionModule(8, index, false);
      setFunctionModule(index, 8, false);
    }
  }
  for (let col = qrSize - 8; col < qrSize; col += 1) setFunctionModule(8, col, false);
  for (let row = qrSize - 7; row < qrSize; row += 1) setFunctionModule(row, 8, false);
}

function drawFormatBits(setFunctionModule: (row: number, col: number, dark: boolean) => void) {
  const bits = getFormatBits();
  for (let index = 0; index <= 5; index += 1) setFunctionModule(8, index, getBit(bits, index));
  setFunctionModule(8, 7, getBit(bits, 6));
  setFunctionModule(8, 8, getBit(bits, 7));
  setFunctionModule(7, 8, getBit(bits, 8));
  for (let index = 9; index < 15; index += 1) setFunctionModule(14 - index, 8, getBit(bits, index));
  for (let index = 0; index < 8; index += 1) setFunctionModule(qrSize - 1 - index, 8, getBit(bits, index));
  for (let index = 8; index < 15; index += 1) setFunctionModule(8, qrSize - 15 + index, getBit(bits, index));
  setFunctionModule(qrSize - 8, 8, true);
}

function getFormatBits() {
  const data = 0b01000;
  let bits = data << 10;
  const generator = 0b10100110111;
  for (let index = bitLength(bits) - 1; index >= 10; index -= 1) {
    if (((bits >> index) & 1) !== 0) bits ^= generator << (index - 10);
  }
  return ((data << 10) | bits) ^ 0b101010000010010;
}

function createErrorCorrection(data: number[], degree: number) {
  const generator = createGenerator(degree);
  const result = Array.from({ length: degree }).fill(0) as number[];
  data.forEach((byte) => {
    const factor = byte ^ result.shift()!;
    result.push(0);
    generator.slice(1).forEach((coefficient, index) => {
      result[index] ^= gfMultiply(coefficient, factor);
    });
  });
  return result;
}

function createGenerator(degree: number) {
  let result = [1];
  for (let degreeIndex = 0; degreeIndex < degree; degreeIndex += 1) {
    const next = Array.from({ length: result.length + 1 }).fill(0) as number[];
    result.forEach((coefficient, index) => {
      next[index] ^= gfMultiply(coefficient, 1);
      next[index + 1] ^= gfMultiply(coefficient, gfExp[degreeIndex]);
    });
    result = next;
  }
  return result;
}

const { gfExp, gfLog } = createGaloisTables();

function createGaloisTables() {
  const exp = Array.from({ length: 512 }).fill(0) as number[];
  const log = Array.from({ length: 256 }).fill(0) as number[];
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if ((value & 0x100) !== 0) value ^= 0x11d;
  }
  for (let index = 255; index < exp.length; index += 1) exp[index] = exp[index - 255];
  return { gfExp: exp, gfLog: log };
}

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) return 0;
  return gfExp[gfLog[left] + gfLog[right]];
}

function bitsToCodewords(bits: number[]) {
  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(Number.parseInt(bits.slice(index, index + 8).join(''), 2));
  }
  return codewords;
}

function toBits(value: number, length: number) {
  return Array.from({ length }, (_, index) => (value >> (length - 1 - index)) & 1);
}

function getBit(value: number, index: number) {
  return ((value >> index) & 1) !== 0;
}

function bitLength(value: number) {
  return value.toString(2).length;
}
