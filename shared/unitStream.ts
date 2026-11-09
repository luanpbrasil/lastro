/**
 * Incremental parser for a streamed `{"units": [ {...}, {...} ], "notes": [...]}` JSON document.
 * Feed it text deltas; it returns each element of the array under `key` as soon as its closing brace arrives.
 */
export class UnitStreamParser {
  constructor(private readonly key = "units") {}
  private buf = "";
  private pos = 0;
  private inArray = false;
  private depth = 0; // depth inside the array: 0 = between elements
  private inString = false;
  private escape = false;
  private start = -1;

  push(delta: string): unknown[] {
    this.buf += delta;
    const out: unknown[] = [];
    for (; this.pos < this.buf.length; this.pos++) {
      const c = this.buf[this.pos];
      if (!this.inArray) {
        // wait for the '[' that follows the key
        if (c === "[" && new RegExp(`"${this.key}"\\s*:\\s*$`).test(this.buf.slice(0, this.pos))) this.inArray = true;
        continue;
      }
      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (c === "\\") this.escape = true;
        else if (c === '"') this.inString = false;
        continue;
      }
      if (c === '"') this.inString = true;
      else if (c === "{") {
        if (this.depth === 0) this.start = this.pos;
        this.depth++;
      } else if (c === "}") {
        this.depth--;
        if (this.depth === 0 && this.start >= 0) {
          const slice = this.buf.slice(this.start, this.pos + 1);
          try {
            out.push(JSON.parse(slice));
          } catch {
            /* malformed element: skip it */
          }
          this.start = -1;
        }
      } else if (c === "]" && this.depth === 0) {
        this.inArray = false;
      }
    }
    return out;
  }
}
