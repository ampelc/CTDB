(function (Scratch) {
  "use strict";

  class CTDBExtension {
    getInfo() {
      return {
        id: "ampctdbapi",
        name: "CTDBAPI",
        color1: "#4f7cff",
        color2: "#2f5fe0",
        blocks: [
          {
            opcode: "setKey",
            blockType: Scratch.BlockType.COMMAND,
            text: "set key [KEY] to [VALUE]",
            arguments: {
              KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "key" },
              VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "hello" }
            }
          },
          {
            opcode: "getKey",
            blockType: Scratch.BlockType.REPORTER,
            text: "get key [KEY]",
            arguments: {
              KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "key" }
            }
          },
          {
            opcode: "deleteKey",
            blockType: Scratch.BlockType.COMMAND,
            text: "delete key [KEY]",
            arguments: {
              KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "key" }
            }
          }
        ]
      };
    }

    async setKey(args) {
      const key = encodeURIComponent(args.KEY);

      await fetch(`https://ctdbapi.funstrangeegg.workers.dev/api/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.VALUE)
      });
    }

    async getKey(args) {
      const key = encodeURIComponent(args.KEY);

      try {
        const res = await fetch(
          `https://ctdbapi.funstrangeegg.workers.dev/api/${key}`
        );

        if (!res.ok) return "";

        const text = await res.text();

        try {
          const json = JSON.parse(text);
          return typeof json === "object"
            ? JSON.stringify(json)
            : json;
        } catch {
          return text;
        }
      } catch (e) {
        return "";
      }
    }

    async deleteKey(args) {
      const key = encodeURIComponent(args.KEY);

      await fetch(`https://ctdbapi.funstrangeegg.workers.dev/api/${key}`, {
        method: "DELETE"
      });
    }
  }

  Scratch.extensions.register(new CTDBExtension());
})(Scratch);
