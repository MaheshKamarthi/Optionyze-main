import {
    loadRollingOptionsPtDeProfile,
    saveRollingOptionsPtDeProfile
} from "../../storage/rolling-options-pt-de-profile-store";
import { listRollingOptionsPtDeClosedPositions } from "../../storage/rolling-options-pt-de-position-store";
import type { RollingOptionsPtDePositionRecord } from "../../storage/rolling-options-pt-de-position-store";

export async function syncOptionsPnlWithClosedPositions(pUserId: string): Promise<number> {
    const objClosedPositions = await listRollingOptionsPtDeClosedPositions(pUserId);
    const vOptionsPnl = objClosedPositions.reduce((pSum, objPosition) => {
        if (objPosition.instrumentType !== "OPTION") {
            return pSum;
        }
        const vPnl = Number(objPosition.pnl || 0);
        return pSum + (Number.isFinite(vPnl) ? vPnl : 0);
    }, 0);

    const vNormalized = Number((Number.isFinite(vOptionsPnl) ? vOptionsPnl : 0).toFixed(3));
    const objProfile = await loadRollingOptionsPtDeProfile(pUserId);
    const objUiState = {
        ...(objProfile?.uiState || {})
    };
    await saveRollingOptionsPtDeProfile({
        userId: pUserId,
        uiState: {
            ...objUiState,
            optionsPnl: vNormalized
        },
        updatedAt: ""
    });

    return vNormalized;
}

export async function applyClosedOptionPnlToProfile(
    pUserId: string,
    pPositions: RollingOptionsPtDePositionRecord[]
): Promise<number> {
    void pPositions;
    return syncOptionsPnlWithClosedPositions(pUserId);
}
