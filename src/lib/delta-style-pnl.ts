export function calculateDeltaStylePnl(
    pSide: unknown,
    pQty: number,
    pLotSize: number,
    pEntryPrice: number,
    pMarkPrice: number,
    pFallbackPnl = 0
): number {
    const vLotSize = Math.max(0, Number(pLotSize || 0));
    const vQty = Math.max(0, Number(pQty || 0));
    const vEntryPrice = Number(pEntryPrice || 0);
    const vMarkPrice = Number(pMarkPrice || 0);
    if (!(vLotSize > 0) || !(vQty > 0) || !Number.isFinite(vEntryPrice) || !Number.isFinite(vMarkPrice)) {
        return Number(pFallbackPnl || 0);
    }

    const vSignedMove = String(pSide || "").trim().toUpperCase() === "BUY"
        ? (vMarkPrice - vEntryPrice)
        : (vEntryPrice - vMarkPrice);
    return Number((vSignedMove * vQty * vLotSize).toFixed(2));
}
