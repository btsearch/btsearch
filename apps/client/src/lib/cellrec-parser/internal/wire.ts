const MAX_VALUE_VARINT_BYTES = 8;
const MAX_VARINT_BYTES = 10;
const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;
const MAX_FIELD_NUMBER = 2 ** 31 - 1;

export class MalformedWireError extends Error {}

type RawField = { wireType: typeof WIRE_VARINT | typeof WIRE_LENGTH_DELIMITED; start: number; end: number };

const utf8 = new TextDecoder("utf-8");

export class WireReader {
  position: number;

  constructor(
    readonly bytes: Uint8Array,
    start = 0,
    readonly end = bytes.length,
  ) {
    this.position = start;
  }

  get done(): boolean {
    return this.position >= this.end;
  }

  private nextByte(): number {
    if (this.position >= this.end) throw new MalformedWireError("A varint runs past the end of its body");
    return this.bytes[this.position++];
  }

  varint(maxBytes = MAX_VALUE_VARINT_BYTES): number {
    let value = 0;
    for (let index = 0; index < maxBytes; index++) {
      const byte = this.nextByte();
      value += (byte & 0x7f) * 2 ** (7 * index);
      if (byte < 0x80) {
        if (value > Number.MAX_SAFE_INTEGER) throw new MalformedWireError("A varint is larger than a safe integer");
        return value;
      }
    }
    throw new MalformedWireError("A varint is too long");
  }

  signedVarint(): number {
    let magnitude = 0;
    let isNegative = false;
    for (let index = 0; index < MAX_VALUE_VARINT_BYTES; index++) {
      const byte = this.nextByte();
      const bits = byte & 0x7f;
      if (index === 0) {
        isNegative = (bits & 1) === 1;
        magnitude = bits >>> 1;
      } else magnitude += bits * 2 ** (7 * index - 1);
      if (byte < 0x80) {
        if (magnitude + (isNegative ? 1 : 0) > Number.MAX_SAFE_INTEGER) throw new MalformedWireError("A signed varint is larger than a safe integer");
        return isNegative ? -(magnitude + 1) : magnitude;
      }
    }
    throw new MalformedWireError("A signed varint is too long");
  }

  flag(): boolean {
    let isSet = false;
    for (let index = 0; index < MAX_VARINT_BYTES; index++) {
      const byte = this.nextByte();
      if ((byte & 0x7f) !== 0) isSet = true;
      if (byte < 0x80) return isSet;
    }
    throw new MalformedWireError("A boolean varint is too long");
  }

  length(): number {
    const length = this.varint(MAX_VARINT_BYTES);
    if (length > this.end - this.position) throw new MalformedWireError("A length runs past the end of its body");
    return length;
  }

  skip(byteCount: number): void {
    if (byteCount > this.end - this.position) throw new MalformedWireError("A fixed-width field runs past the end of its body");
    this.position += byteCount;
  }
}

export class WireMessage {
  private readonly fields = new Map<number, RawField[]>();

  constructor(
    readonly bytes: Uint8Array,
    start = 0,
    end = bytes.length,
  ) {
    const reader = new WireReader(bytes, start, end);
    while (!reader.done) {
      const tag = reader.varint(MAX_VARINT_BYTES);
      const number = Math.floor(tag / 8);
      const wireType = tag % 8;
      if (number === 0 || number > MAX_FIELD_NUMBER) return;
      const fieldStart = reader.position;
      if (wireType === WIRE_VARINT) {
        reader.varint(MAX_VARINT_BYTES);
        this.add(number, { wireType, start: fieldStart, end: reader.position });
      } else if (wireType === WIRE_LENGTH_DELIMITED) {
        const length = reader.length();
        this.add(number, { wireType, start: reader.position, end: reader.position + length });
        reader.skip(length);
      } else if (wireType === WIRE_FIXED64) reader.skip(8);
      else if (wireType === WIRE_FIXED32) reader.skip(4);
      else return;
    }
  }

  private add(number: number, field: RawField): void {
    const list = this.fields.get(number);
    if (list) list.push(field);
    else this.fields.set(number, [field]);
  }

  private last(number: number, wireType: RawField["wireType"]): RawField | undefined {
    const fields = this.fields.get(number) ?? [];
    for (let index = fields.length - 1; index >= 0; index--) if (fields[index].wireType === wireType) return fields[index];
    return undefined;
  }

  private reader(field: RawField): WireReader {
    return new WireReader(this.bytes, field.start, field.end);
  }

  uint(number: number): number | undefined {
    const field = this.last(number, WIRE_VARINT);
    return field === undefined ? undefined : this.reader(field).varint();
  }

  sint(number: number): number | undefined {
    const field = this.last(number, WIRE_VARINT);
    return field === undefined ? undefined : this.reader(field).signedVarint();
  }

  bool(number: number): boolean | undefined {
    const field = this.last(number, WIRE_VARINT);
    return field === undefined ? undefined : this.reader(field).flag();
  }

  string(number: number): string | undefined {
    const field = this.last(number, WIRE_LENGTH_DELIMITED);
    return field === undefined ? undefined : utf8.decode(this.bytes.subarray(field.start, field.end));
  }

  strings(number: number): string[] {
    return (this.fields.get(number) ?? [])
      .filter((field) => field.wireType === WIRE_LENGTH_DELIMITED)
      .map((field) => utf8.decode(this.bytes.subarray(field.start, field.end)));
  }

  message(number: number): WireMessage | undefined {
    const field = this.last(number, WIRE_LENGTH_DELIMITED);
    return field === undefined ? undefined : new WireMessage(this.bytes, field.start, field.end);
  }

  messages(number: number): WireMessage[] {
    return (this.fields.get(number) ?? [])
      .filter((field) => field.wireType === WIRE_LENGTH_DELIMITED)
      .map((field) => new WireMessage(this.bytes, field.start, field.end));
  }

  packedUints(number: number): number[] | undefined {
    const fields = this.fields.get(number);
    if (fields === undefined) return undefined;
    const values: number[] = [];
    for (const field of fields) {
      const reader = this.reader(field);
      if (field.wireType === WIRE_VARINT) values.push(reader.varint());
      else while (!reader.done) values.push(reader.varint());
    }
    return values;
  }
}
