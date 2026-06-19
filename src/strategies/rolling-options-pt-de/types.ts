export interface RollingOptionsPtDeConfig {
    symbol: string;
    contractName: string;
    lotSize: number;
    futureQty: number;
    futureOrderType: "limit_order" | "market_order";
    futureAction?: "BUY" | "SELL";
    demoBalance?: number;
    action: "buy" | "sell";
    legSide: "ce" | "pe" | "both";
    expiryMode: "1" | "2" | "4" | "5" | "6" | "7";
    expiryDate: string;
    optionQty: number;
    redOptionQtyPct: number;
    redOptionQty?: number;
    greenOptionQtyPct: number;
    greenOptionQty?: number;
    newDelta: number;
    redReDelta?: number;
    redDeltaTakeProfit?: number;
    redDeltaStopLoss?: number;
    redTakeProfitPct?: number;
    redStopLossPct?: number;
    greenReDelta?: number;
    greenDeltaTakeProfit?: number;
    greenDeltaStopLoss?: number;
    greenTakeProfitPct?: number;
    greenStopLossPct?: number;
    reDelta: number;
    deltaTakeProfit: number;
    deltaStopLoss: number;
    reEnter: boolean;
    addOneLotFuture: boolean;
    renkoEnabled: boolean;
    renkoStepPoints: number;
    renkoPriceSource: "mark_price" | "spot_price" | "best_bid" | "best_ask";
    loopSeconds: number;
}

export interface RollingOptionsPtDeOptionLookupMeta {
    requestedExpiryDate: string;
    resolvedExpiryDate: string;
    usedNextDayFallback: boolean;
}

export interface RollingOptionsPtDeRenkoState {
    anchor: number | null;
    lastDir: -1 | 0 | 1;
    lastColor: "" | "R" | "G";
}

export interface RollingOptionsPtDeMarketSnapshot {
    symbol: string;
    contractName: string;
    spotPrice: number;
    futuresPrice: number;
    bestBidPrice: number;
    bestAskPrice: number;
    priceSource: "public" | "simulated";
    ts: string;
}

export type RollingOptionsPtDeEmaTimeframe = "1m" | "5m" | "15m" | "1h";

export interface RollingOptionsPtDeEmaState {
    enabled: boolean;
    timeframe: RollingOptionsPtDeEmaTimeframe;
    period: number;
    trend: "UP" | "DOWN" | "FLAT";
    signalTrend: "UP" | "DOWN" | "FLAT";
    value: number | null;
    close: number | null;
    candleCount: number;
    calculatedAt: string;
    error: string;
}

export interface RollingOptionsPtDeEngineState {
    userId: string;
    running: boolean;
    isBusy: boolean;
    timerRef: NodeJS.Timeout | null;
    cycleCount: number;
    consecutiveFailures: number;
    lastError: string;
    lastCycleAt: string | null;
    manualCloseBlocksOptionEntry?: boolean;
    positionMismatchDetected?: boolean;
    tradingViewEmaTrend?: "UP" | "DOWN" | "FLAT";
    ema: RollingOptionsPtDeEmaState;
    renko: RollingOptionsPtDeRenkoState;
    market: {
        lastSpotPrice: number | null;
        lastFuturesPrice: number | null;
        lastSource: "public" | "simulated";
    };
    sourcePositiveCycleCountByPositionId: Map<string, number>;
}
