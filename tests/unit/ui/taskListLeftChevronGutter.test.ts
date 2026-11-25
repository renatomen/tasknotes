import fs from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");

const TOKENS = new Map(
	Array.from(
		read("styles/tokens.css").matchAll(/(--tn-[\w-]+):\s*(?:var\([^,;\n]+,\s*)?(-?[\d.]+)px\)?;/g),
		([, name, px]) => [name, Number(px)] as const
	)
);

function evaluate(tokens: string[]): number {
	let position = 0;
	const factor = (): number => {
		const token = tokens[position++];
		if (token !== "(") return Number(token);
		const value = sum();
		position++;
		return value;
	};
	const product = (): number => {
		let value = factor();
		while (tokens[position] === "*") {
			position++;
			value *= factor();
		}
		return value;
	};
	const sum = (): number => {
		let value = product();
		while (tokens[position] === "+" || tokens[position] === "-") {
			const sign = tokens[position++] === "+" ? 1 : -1;
			value += sign * product();
		}
		return value;
	};
	return sum();
}

function toPixels(value: string): number {
	const resolved = value.replace(/var\((--tn-[\w-]+)\)/g, (_, name: string) => String(TOKENS.get(name)));
	return evaluate(resolved.match(/-?\d+(?:\.\d+)?|[-+*()]/g) ?? []);
}

function declared(css: string, selector: RegExp, property: string): string {
	const rule = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
	const value = rule && new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(rule)?.[1];
	if (!value) throw new Error(`No ${property} declared for ${selector.source}`);
	return value;
}

describe("a reorderable task list card with its subtask chevron on the left", () => {
	const css = read("styles/task-card-bem.css");
	const card = /\.task-card--reorderable\.task-card--chevron-left:not\(\.task-card--layout-inline\)/;
	const handle = new RegExp(`${card.source} > \\.task-card__main-row > \\.task-card__drag-handle`);
	const chevron = new RegExp(`${card.source} \\.task-card__badges \\.task-card__chevron`);

	it("gives the chevron and the drag handle separate places in the gutter", () => {
		const gutter = toPixels(declared(css, card, "padding-left"));
		const chevronStart = gutter + toPixels(declared(css, chevron, "left"));
		const chevronEnd = chevronStart + toPixels("var(--tn-control-sm)");
		const handleStart = gutter + toPixels(declared(css, handle, "left"));
		const handleEnd = handleStart + toPixels(declared(css, /\.tasknotes-plugin \.task-card__drag-handle/, "width"));

		expect(chevronStart).toBeGreaterThanOrEqual(0);
		expect(handleStart).toBeGreaterThanOrEqual(chevronEnd);
		expect(handleEnd).toBeLessThanOrEqual(gutter);
	});

	it("extends the hover highlight over the widened gutter", () => {
		const gutter = toPixels(declared(css, card, "padding-left"));
		const highlight = new RegExp(`${card.source} > \\.task-card__main-row::before`);
		const start = toPixels(declared(read("styles/task-list-view.css"), highlight, "inset-inline-start"));

		expect(-start).toBeGreaterThanOrEqual(gutter);
	});
});
