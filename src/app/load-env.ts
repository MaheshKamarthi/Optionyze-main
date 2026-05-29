import fs from "node:fs";
import path from "node:path";

export function loadLocalEnv(): void {
    const vEnvPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(vEnvPath)) {
        return;
    }

    const vFileText = fs.readFileSync(vEnvPath, "utf8");
    const arrLines = vFileText.split(/\r?\n/);

    for (const vRawLine of arrLines) {
        const vLine = vRawLine.trim();
        if (!vLine || vLine.startsWith("#")) {
            continue;
        }

        const vIndex = vLine.indexOf("=");
        if (vIndex <= 0) {
            continue;
        }

        const vKey = vLine.slice(0, vIndex).trim();
        if (!vKey) {
            continue;
        }

        const vExistingValue = Object.prototype.hasOwnProperty.call(process.env, vKey)
            ? process.env[vKey]
            : undefined;
        if (vExistingValue !== undefined && String(vExistingValue).trim().length > 0) {
            continue;
        }

        let vValue = vLine.slice(vIndex + 1).trim();
        if ((vValue.startsWith('"') && vValue.endsWith('"')) || (vValue.startsWith("'") && vValue.endsWith("'"))) {
            vValue = vValue.slice(1, -1);
        }

        process.env[vKey] = vValue;
    }
}
