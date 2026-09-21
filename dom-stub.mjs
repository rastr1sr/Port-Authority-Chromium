// Minimal DOM; avoids a jsdom dependency.

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.attributes = {};
        this.className = "";
        this.textContent = "";
        this.value = "";
        this.disabled = false;
        this.listeners = {};
    }
    appendChild(child) { this.children.push(child); return child; }
    prepend(child) { this.children.unshift(child); return child; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    classList = { add: (...c) => { this.className = [this.className, ...c].join(" ").trim(); },
                  remove: (c) => { this.className = this.className.replace(c, "").trim(); } };
}

export function installDOM() {
    const byId = new Map();
    globalThis.document = {
        documentElement: new FakeElement("html"),
        body: new FakeElement("body"),
        createElement: (tag) => new FakeElement(tag),
        getElementById: (id) => {
            if (!byId.has(id)) byId.set(id, new FakeElement("div"));
            return byId.get(id);
        },
        querySelector: () => new FakeElement("div")
    };
    return { element: (id) => document.getElementById(id) };
}

// Returns the tree as indented "tag.class[text]".
export function serialize(element, depth = 0) {
    const label = element.tagName
        + (element.className ? "." + element.className.trim().replace(/\s+/g, ".") : "")
        + (element.textContent ? `[${element.textContent}]` : "");
    return [
        "  ".repeat(depth) + label,
        ...element.children.map((child) => serialize(child, depth + 1))
    ].join("\n");
}
