export type DeltaPositionSide = "BUY" | "SELL";
export type DeltaTrailKind = "stop-loss" | "take-profit";

export function clampDelta(pValue: number): number {
    return Math.min(1, Math.max(0, Number(pValue) || 0));
}

export function getDeltaTrailGap(pEntryDelta: number, pInitialTargetDelta: number): number {
    return Math.abs(clampDelta(pInitialTargetDelta) - clampDelta(pEntryDelta));
}

export function getTrailedDeltaTarget(
    pSide: DeltaPositionSide,
    pKind: DeltaTrailKind,
    pBestDelta: number,
    pGap: number
): number {
    const vBestDelta = clampDelta(pBestDelta);
    const vGap = Math.max(0, Number(pGap) || 0);
    const bAddGap = (pKind === "stop-loss" && pSide === "SELL")
        || (pKind === "take-profit" && pSide === "BUY");
    return clampDelta(bAddGap ? vBestDelta + vGap : vBestDelta - vGap);
}
