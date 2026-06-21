import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "./json-store";
import type { RollingOptionsPtDePositionRecord } from "./rolling-options-strangle-position-store";

const gTempClosedPositionsFile = path.resolve(process.cwd(), "data", "rolling-options-strangle", "temp-closed-positions.json");
const gMaxTempClosedPositions = 1000;

async function loadAllTempClosedPositions(): Promise<RollingOptionsPtDePositionRecord[]> {
    return readJsonFile<RollingOptionsPtDePositionRecord[]>(gTempClosedPositionsFile, []);
}

export async function listRollingOptionsStrangleTempClosedPositions(
    pUserId: string,
    pFilters?: { fromDate?: string; toDate?: string; }
): Promise<RollingOptionsPtDePositionRecord[]> {
    const vFromDate = String(pFilters?.fromDate || "").trim();
    const vToDate = String(pFilters?.toDate || "").trim();
    const objRows = await loadAllTempClosedPositions();

    return objRows
        .filter((objRow) => {
            if (objRow.userId !== pUserId) {
                return false;
            }

            const vClosedAt = String(objRow.closedAt || "");
            if (vFromDate && vClosedAt && vClosedAt < vFromDate) {
                return false;
            }
            if (vToDate && vClosedAt && vClosedAt > vToDate) {
                return false;
            }
            return true;
        })
        .sort((objA, objB) => String(objB.closedAt).localeCompare(String(objA.closedAt)));
}

export async function saveRollingOptionsStrangleTempClosedPositions(
    pPositions: RollingOptionsPtDePositionRecord[]
): Promise<RollingOptionsPtDePositionRecord[]> {
    const arrPositions = (Array.isArray(pPositions) ? pPositions : [])
        .filter((objPosition) => String(objPosition?.userId || "").trim() && String(objPosition?.positionId || "").trim());
    if (arrPositions.length <= 0) {
        return [];
    }

    const objRows = await loadAllTempClosedPositions();
    const objByPositionId = new Map<string, RollingOptionsPtDePositionRecord>();
    for (const objRow of objRows) {
        objByPositionId.set(String(objRow.positionId || ""), objRow);
    }
    for (const objPosition of arrPositions) {
        objByPositionId.set(String(objPosition.positionId || ""), objPosition);
    }

    const objNextRows = Array.from(objByPositionId.values())
        .sort((objA, objB) => String(objB.closedAt || objB.updatedAt || "").localeCompare(String(objA.closedAt || objA.updatedAt || "")))
        .slice(0, gMaxTempClosedPositions);
    await writeJsonFileAtomic(gTempClosedPositionsFile, objNextRows);
    return arrPositions;
}

export async function clearRollingOptionsStrangleTempClosedPositions(pUserId: string): Promise<number> {
    const objRows = await loadAllTempClosedPositions();
    const vBeforeCount = objRows.length;
    const objRemainingRows = objRows.filter((objRow) => objRow.userId !== pUserId);
    await writeJsonFileAtomic(gTempClosedPositionsFile, objRemainingRows);
    return vBeforeCount - objRemainingRows.length;
}
