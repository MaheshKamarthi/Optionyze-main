import crypto from "node:crypto";
import { RunnerManager } from "../../runners/runner-manager";
import {
    listRollingOptionsPtDeClosedPositions,
    listRollingOptionsPtDeOpenPositions,
    saveRollingOptionsPtDePosition,
    type RollingOptionsPtDePositionRecord
} from "../../storage/rolling-options-strangle-position-store";
import { loadRollingOptionsPtDeProfile } from "../../storage/rolling-options-strangle-profile-store";
import {
    listRollingOptionsPtDeRuntime,
    saveRollingOptionsPtDeRuntime,
    type RollingOptionsPtDeRuntimeRecord
} from "../../storage/rolling-options-strangle-runtime-store";
import {
    buildConfigFromUiState,
    estimatePositionCharges,
    getOpenPositionsSummary,
    getPositionPnl,
    shouldTriggerOption,
    updateRenkoState
} from "../rolling-options-pt-de/engine";
import { logRollingOptionsPtDeEvent } from "./event-logger";
import {
    ensureLiveTickerSymbols,
    findBestLiveOptionContract,
    getLiveMarketSnapshot,
    getCachedOptionTicker,
    getLiveOptionTicker
} from "../rolling-options-pt-de/market-data";
import { syncOptionsPnlWithClosedPositions } from "./options-pnl";
import type {
    RollingOptionsPtDeConfig,
    RollingOptionsPtDeEngineState,
    RollingOptionsPtDeMarketSnapshot
} from "../rolling-options-pt-de/types";

export class RollingOptionsStrangleService {
    private readonly stateByUserId = new Map<string, RollingOptionsPtDeEngineState>();
    private static readonly RE_DELTA_TOLERANCE = 0.05;

    public constructor(private readonly runnerManager: RunnerManager) {}

    private async loadUiState(pUserId: string): Promise<Record<string, unknown>> {
        const objProfile = await loadRollingOptionsPtDeProfile(pUserId);
        const objUiState = {
            symbol: "BTC",
            manualFutQty: 1,
            manualFutOrderType: "market_order",
            manualFutAction: "SELL",
            futuresEnabled: true,
            action1: "sell",
            legSide1: "ce",
            expiryMode1: "1",
            expiryDate1: "",
            manualOptQty1: 1,
            reDelta1: 0.53,
            deltaTp1: 0.15,
            deltaSl1: 0.85,
            reEnter1: false,
            redOptQty: 1,
            greenOptQty: 1,
            greenReDelta: 0.53,
            greenTpDelta: 0.15,
            greenSlDelta: 0.85,
            greenTpPct: 15,
            greenSlPct: 85,
            redTpPct: 15,
            redSlPct: 85,
            targetOpenPnl: 0,
            closeAllLegsOnAnyClose: false,
            skipRenkoEntryNoOpenOptions: false,
            trailGreenTp1Enabled: true,
            trailGreenSl1Enabled: true,
            trailRedTp1Enabled: true,
            trailRedSl1Enabled: true,
            renkoFeedEnabled: true,
            trailGreenTp2Enabled: true,
            trailGreenSl2Enabled: true,
            trailRedTp2Enabled: true,
            trailRedSl2Enabled: true,
            renkoFeedPts: 10,
            renkoFeedPriceSrc: "spot_price",
            action2: "none",
            legSide2: "pe",
            expiryMode2: "1",
            expiryDate2: "",
            manualOptQty2: 1,
            reEnter2: false,
            greenOptQty2: 1,
            greenReDelta2: 0.53,
            greenTpPct2: 15,
            greenSlPct2: 85,
            redOptQty2: 1,
            redReDelta2: 0.53,
            redTpPct2: 15,
            redSlPct2: 85,
            ...(objProfile?.uiState || {})
        } as Record<string, unknown>;

        (objUiState as any).addOneLotFuture = false;
        return objUiState;
    }

    private buildRuleSetConfig(pUiState: Record<string, unknown>, pRuleSet: 1 | 2): RollingOptionsPtDeConfig {
        const objState = { ...(pUiState || {}) } as Record<string, unknown>;

        if (pRuleSet === 2) {
            objState.action1 = (pUiState as any).action2;
            objState.legSide1 = (pUiState as any).legSide2;
            objState.expiryMode1 = (pUiState as any).expiryMode2;
            objState.expiryDate1 = (pUiState as any).expiryDate2;
            objState.manualOptQty1 = (pUiState as any).manualOptQty2;
            objState.reEnter1 = (pUiState as any).reEnter2;

            objState.greenOptQty = (pUiState as any).greenOptQty2;
            objState.greenReDelta = (pUiState as any).greenReDelta2;
            objState.greenTpPct = (pUiState as any).greenTpPct2;
            objState.greenSlPct = (pUiState as any).greenSlPct2;

            objState.redOptQty = (pUiState as any).redOptQty2;
            objState.redTpPct = (pUiState as any).redTpPct2;
            objState.redSlPct = (pUiState as any).redSlPct2;
            objState.reRedDelta = (pUiState as any).redReDelta2;
            objState.reDelta1 = (pUiState as any).redReDelta2;
        }

        const objConfig = buildConfigFromUiState(objState);
        (objConfig as any).futuresEnabled = Boolean((pUiState as any).futuresEnabled ?? true);
        (objConfig as any).ruleSet = pRuleSet;
        if (pRuleSet === 2) {
            (objConfig as any).ruleSetGreenTpPct = Number((pUiState as any).greenTpPct2);
            (objConfig as any).ruleSetGreenSlPct = Number((pUiState as any).greenSlPct2);
            (objConfig as any).ruleSetRedTpPct = Number((pUiState as any).redTpPct2);
            (objConfig as any).ruleSetRedSlPct = Number((pUiState as any).redSlPct2);
        }
        objConfig.newDelta = 0.53;
        return objConfig;
    }

    private createInitialState(pUserId: string): RollingOptionsPtDeEngineState {
        return {
            userId: pUserId,
            running: false,
            isBusy: false,
            timerRef: null,
            cycleCount: 0,
            consecutiveFailures: 0,
            lastError: "",
            lastCycleAt: null,
            renko: {
                anchor: null,
                lastDir: 0,
                lastColor: ""
            },
            market: {
                lastSpotPrice: null,
                lastFuturesPrice: null,
                lastSource: "simulated"
            }
        };
    }

    private getOrCreateState(pUserId: string): RollingOptionsPtDeEngineState {
        const vUserId = String(pUserId || "").trim() || "demo-paper";
        let objState = this.stateByUserId.get(vUserId);
        if (!objState) {
            objState = this.createInitialState(vUserId);
            this.stateByUserId.set(vUserId, objState);
        }
        return objState;
    }

    public async hydrate(): Promise<void> {
        const objRuntimeRows = await listRollingOptionsPtDeRuntime();
        for (const objRuntime of objRuntimeRows) {
            if (!objRuntime.autoTraderEnabled || objRuntime.status !== "running") {
                continue;
            }

            const objState = this.getOrCreateState(objRuntime.userId);
            objState.running = true;
            objState.cycleCount = Number((objRuntime.state?.cycleCount as number) || 0);
            objState.consecutiveFailures = Number((objRuntime.state?.consecutiveFailures as number) || 0);
            objState.lastError = String(objRuntime.lastError || "");
            objState.lastCycleAt = objRuntime.lastCycleAt || null;
            objState.renko.anchor = Number.isFinite(Number(objRuntime.state?.renkoAnchor))
                ? Number(objRuntime.state?.renkoAnchor)
                : null;
            objState.renko.lastDir = Number(objRuntime.state?.renkoLastDir || 0) as -1 | 0 | 1;
            objState.renko.lastColor = String(objRuntime.state?.renkoLastColor || "") as "" | "R" | "G";
            objState.market.lastSpotPrice = objRuntime.lastSpotPrice;
            objState.market.lastFuturesPrice = objRuntime.lastFuturesPrice;
            objState.market.lastSource = String(objRuntime.state?.marketSource || "simulated") === "public" ? "public" : "simulated";
            this.armTimer(objState);
        }
    }

    private armTimer(pState: RollingOptionsPtDeEngineState, pLoopSeconds = 8): void {
        if (pState.timerRef) {
            clearInterval(pState.timerRef);
        }

        pState.timerRef = setInterval(() => {
            void this.runCycle(pState.userId);
        }, Math.max(5, pLoopSeconds) * 1000);
    }

    private async loadConfig(pUserId: string): Promise<RollingOptionsPtDeConfig> {
        const objUiState = await this.loadUiState(pUserId);
        const objConfig = this.buildRuleSetConfig(objUiState, 1);
        (objConfig as any).__uiState = objUiState;
        return objConfig;
    }

    public async ensureFutureForOpenOptions(
        pUserId: string,
        pReason: string
    ): Promise<RollingOptionsPtDePositionRecord | null> {
        const objConfig = await this.loadConfig(pUserId);
        const bFuturesEnabled = Boolean((objConfig as any).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            return null;
        }

        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objSummary = getOpenPositionsSummary(arrOpenPositions);
        if (!objSummary.hasOpenOption) {
            return null;
        }

        const objExistingFuture = arrOpenPositions.find((objRow) => objRow.status === "OPEN" && objRow.instrumentType === "FUTURE") || null;
        if (objExistingFuture) {
            return objExistingFuture;
        }

        const vQty = Math.max(1, Math.floor(Number(objConfig.futureQty || 1)));
        return await this.openFuturePosition(pUserId, objConfig, vQty, pReason);
    }

    private getSimulatedSnapshot(pState: RollingOptionsPtDeEngineState, pConfig: RollingOptionsPtDeConfig): RollingOptionsPtDeMarketSnapshot {
        const vBase = pConfig.symbol === "ETH" ? 3200 : 64000;
        const vLastSpot = Number(pState.market.lastSpotPrice || vBase);
        const vBias = pState.renko.lastColor === "R" ? -1 : 1;
        const vRandomMove = ((Date.now() % 11) - 5) * (pConfig.renkoStepPoints / 4);
        const vTrendMove = vBias * (pConfig.renkoStepPoints / 5);
        const vSpotPrice = Number(Math.max(1, vLastSpot + vRandomMove + vTrendMove).toFixed(2));
        const vFuturesPrice = Number((vSpotPrice * 1.0012).toFixed(2));
        const vBestBidPrice = Number((vFuturesPrice * 0.9998).toFixed(2));
        const vBestAskPrice = Number((vFuturesPrice * 1.0002).toFixed(2));

        return {
            symbol: pConfig.symbol,
            contractName: pConfig.contractName,
            spotPrice: vSpotPrice,
            futuresPrice: vFuturesPrice,
            bestBidPrice: vBestBidPrice,
            bestAskPrice: vBestAskPrice,
            priceSource: "simulated",
            ts: new Date().toISOString()
        };
    }

    private getRuleValues(
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G"
    ): {
        colorCode: "R" | "G";
        reDelta: number;
        takeProfitDelta: number;
        stopLossDelta: number;
    } {
        if (pColorCode === "G") {
            return {
                colorCode: "G",
                reDelta: Number(pConfig.greenReDelta ?? pConfig.reDelta ?? 0.53),
                takeProfitDelta: Number(pConfig.greenDeltaTakeProfit ?? pConfig.deltaTakeProfit ?? 0.15),
                stopLossDelta: Number(pConfig.greenDeltaStopLoss ?? pConfig.deltaStopLoss ?? 0.85)
            };
        }

        return {
            colorCode: "R",
            reDelta: Number(pConfig.redReDelta ?? pConfig.reDelta ?? 0.53),
            takeProfitDelta: Number(pConfig.redDeltaTakeProfit ?? pConfig.deltaTakeProfit ?? 0.15),
            stopLossDelta: Number(pConfig.redDeltaStopLoss ?? pConfig.deltaStopLoss ?? 0.85)
        };
    }

    private async getMarketSnapshot(pState: RollingOptionsPtDeEngineState, pConfig: RollingOptionsPtDeConfig): Promise<RollingOptionsPtDeMarketSnapshot> {
        ensureLiveTickerSymbols([pConfig.contractName]);
        let objLastError: unknown = null;
        for (let vAttempt = 0; vAttempt < 3; vAttempt += 1) {
            try {
                return await getLiveMarketSnapshot(pConfig);
            }
            catch (objError) {
                objLastError = objError;
                if (vAttempt < 2) {
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 250 * (vAttempt + 1));
                    });
                }
            }
        }

        const vSpot = Number(pState.market.lastSpotPrice ?? NaN);
        const vFutures = Number(pState.market.lastFuturesPrice ?? NaN);
        const vFallbackSpot = Number.isFinite(vSpot) && vSpot > 0 ? vSpot : (Number.isFinite(vFutures) && vFutures > 0 ? vFutures : 0);
        const vFallbackFutures = Number.isFinite(vFutures) && vFutures > 0 ? vFutures : vFallbackSpot;
        if (vFallbackSpot > 0 && vFallbackFutures > 0) {
            return {
                symbol: pConfig.symbol,
                contractName: pConfig.contractName,
                spotPrice: vFallbackSpot,
                futuresPrice: vFallbackFutures,
                bestBidPrice: vFallbackFutures,
                bestAskPrice: vFallbackFutures,
                priceSource: pState.market.lastSource,
                ts: new Date().toISOString()
            };
        }

        if (pConfig.renkoEnabled) {
            throw (objLastError instanceof Error ? objLastError : new Error("Unable to load live market snapshot."));
        }
        return this.getSimulatedSnapshot(pState, pConfig);
    }

    private async buildRuntimeRecord(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pOverrides: Partial<RollingOptionsPtDeRuntimeRecord> = {}
    ): Promise<RollingOptionsPtDeRuntimeRecord> {
        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const vLastSignal = pOverrides.lastSignal
            || (pState.renko.lastColor === "R" ? "RED" : (pState.renko.lastColor === "G" ? "GREEN" : "IDLE"));

        return {
            userId: pUserId,
            status: pOverrides.status || (pState.running ? "running" : "stopped"),
            autoTraderEnabled: pOverrides.autoTraderEnabled ?? pState.running,
            currentSymbol: pConfig.symbol,
            currentContractName: pConfig.contractName,
            currentExpiryMode: pConfig.expiryMode,
            currentExpiryDate: pConfig.expiryDate,
            renkoEnabled: pConfig.renkoEnabled,
            renkoPoints: pConfig.renkoStepPoints,
            renkoSource: pConfig.renkoPriceSource,
            lastSpotPrice: pOverrides.lastSpotPrice ?? pState.market.lastSpotPrice,
            lastFuturesPrice: pOverrides.lastFuturesPrice ?? pState.market.lastFuturesPrice,
            lastSignal: vLastSignal,
            lastCycleAt: pOverrides.lastCycleAt ?? pState.lastCycleAt ?? "",
            lastError: pOverrides.lastError ?? pState.lastError,
            state: {
                cycleCount: pState.cycleCount,
                consecutiveFailures: pState.consecutiveFailures,
                renkoAnchor: pState.renko.anchor,
                renkoLastDir: pState.renko.lastDir,
                renkoLastColor: pState.renko.lastColor,
                marketSource: pState.market.lastSource,
                openPositions: objOpenPositions.length
            },
            updatedAt: ""
        };
    }

    private async syncRuntime(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pOverrides: Partial<RollingOptionsPtDeRuntimeRecord> = {}
    ): Promise<RollingOptionsPtDeRuntimeRecord> {
        const objRuntime = await this.buildRuntimeRecord(pUserId, pConfig, pState, pOverrides);
        await this.runnerManager.setState({
            userId: pUserId,
            strategyType: "rolling-options-strangle",
            status: objRuntime.status === "running" ? "running" : "stopped",
            updatedAt: new Date().toISOString(),
            message: objRuntime.lastError || objRuntime.lastSignal || "Rolling Option Strangle Demo",
            state: objRuntime.state
        });
        return saveRollingOptionsPtDeRuntime(objRuntime);
    }

    private getDemoBalanceLimit(pConfig: RollingOptionsPtDeConfig): number | null {
        const vBalance = Number(pConfig.demoBalance);
        if (!Number.isFinite(vBalance) || vBalance <= 0) {
            return null;
        }
        return vBalance;
    }

    private calculatePaperNotional(pQty: number, pLotSize: number, pPrice: number): number {
        const vQty = Math.max(0, Number(pQty || 0));
        const vLotSize = Math.max(0, Number(pLotSize || 0));
        const vPrice = Math.max(0, Number(pPrice || 0));
        if (!(vQty > 0) || !(vLotSize > 0) || !(vPrice > 0)) {
            return 0;
        }
        return vQty * vLotSize * vPrice;
    }

    private calculateBlockedMarginFromPositions(pPositions: RollingOptionsPtDePositionRecord[]): number {
        const arrPositions = Array.isArray(pPositions) ? pPositions : [];
        return arrPositions.reduce((sum, objRow) => {
            if (!objRow || objRow.status !== "OPEN") {
                return sum;
            }
            const vPrice = Number(objRow.entryPrice ?? objRow.markPrice ?? 0);
            return sum + this.calculatePaperNotional(Number(objRow.qty || 0), Number(objRow.lotSize || 0), vPrice);
        }, 0);
    }

    private async hasSufficientDemoBalance(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pAdditionalBlockedMargin: number,
        pReason: string
    ): Promise<boolean> {
        const vDemoBalance = this.getDemoBalanceLimit(pConfig);
        if (vDemoBalance === null) {
            return true;
        }

        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const vBlockedMargin = this.calculateBlockedMarginFromPositions(objOpenPositions);
        const vRequired = vBlockedMargin + Math.max(0, Number(pAdditionalBlockedMargin || 0));
        if (vRequired <= vDemoBalance) {
            return true;
        }

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "warning",
            title: "Insufficient Demo Balance",
            message: `Skipped ${pReason} because required margin ${vRequired.toFixed(3)} exceeds demo balance ${vDemoBalance.toFixed(3)}.`,
            payload: {
                symbol: pConfig.symbol,
                reason: "insufficient_demo_balance",
                requiredMargin: vRequired,
                blockedMargin: vBlockedMargin,
                demoBalance: vDemoBalance,
                additionalMargin: Math.max(0, Number(pAdditionalBlockedMargin || 0))
            }
        });
        return false;
    }

    private async openFuturePosition(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number,
        pReason: string
    ): Promise<RollingOptionsPtDePositionRecord | null> {
        const bFuturesEnabled = Boolean((pConfig as any).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Futures Disabled",
                message: `Skipped futures entry (${pReason}) because FUT Enabled is OFF.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "futures_disabled"
                }
            });
            return null;
        }

        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objOpenFutures = objOpenPositions.filter((objRow) => objRow.instrumentType === "FUTURE" && objRow.status === "OPEN");
        if (objOpenFutures.length > 0) {
            const vDesiredAction = pConfig.futureAction ?? (pConfig.action === "sell" ? "BUY" : "SELL");
            const vExisting = objOpenFutures[0];
            const vExistingQty = Math.max(0, Math.floor(Number(vExisting.qty || 0)));
            const vDesiredQty = Math.max(0, Math.floor(Number(pQty || 0)));
            const vMismatch = (String(vExisting.action || "").trim().toUpperCase() !== vDesiredAction) || (vDesiredQty > 0 && vExistingQty !== vDesiredQty);
            if (vMismatch) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "warning",
                    title: "Future Mismatch",
                    message: "Future position already open, and it does not match the requested qty/action.",
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "future_already_open_mismatch",
                        existingAction: vExisting.action,
                        existingQty: vExistingQty,
                        desiredAction: vDesiredAction,
                        desiredQty: vDesiredQty
                    }
                });
            }
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Future Already Open",
                message: `Skipped futures entry (${pReason}) because a future position is already open.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "future_already_open",
                    openFutures: objOpenFutures.length
                }
            });
            return objOpenFutures[0];
        }

        const objSnapshot = await this.getMarketSnapshot(this.getOrCreateState(pUserId), pConfig);
        const vAdditionalMargin = this.calculatePaperNotional(pQty, pConfig.lotSize, objSnapshot.futuresPrice);
        if (!(await this.hasSufficientDemoBalance(pUserId, pConfig, vAdditionalMargin, pReason))) {
            return null;
        }
        const objPosition = await saveRollingOptionsPtDePosition({
            positionId: crypto.randomUUID(),
            userId: pUserId,
            groupId: `group_${Date.now()}`,
            cycleId: `cycle_${Date.now()}`,
            status: "OPEN",
            symbol: pConfig.symbol,
            contractName: `${pConfig.contractName} FUT`,
            instrumentType: "FUTURE",
            optionSide: "",
            action: pConfig.futureAction ?? (pConfig.action === "sell" ? "BUY" : "SELL"),
            strike: null,
            expiryDate: pConfig.expiryDate,
            qty: pQty,
            lotSize: pConfig.lotSize,
            entryPrice: objSnapshot.futuresPrice,
            exitPrice: null,
            markPrice: objSnapshot.futuresPrice,
            entryDelta: null,
            exitDelta: null,
            charges: estimatePositionCharges("FUTURE", pQty, pConfig.lotSize, objSnapshot.futuresPrice),
            pnl: 0,
            openedReason: pReason,
            closedReason: "",
            openedAt: objSnapshot.ts,
            closedAt: "",
            metadata: {
                orderType: pConfig.futureOrderType,
                source: "server-strategy"
            },
            createdAt: objSnapshot.ts,
            updatedAt: objSnapshot.ts
        });

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: pReason === "SL add one future" ? "extra_future_added" : "future_opened",
            severity: "success",
            title: pReason === "SL add one future" ? "Extra Future Added" : "Future Opened",
            message: `${objPosition.action} future paper position opened.`,
            payload: {
                symbol: pConfig.symbol,
                contractName: objPosition.contractName,
                qty: pQty,
                reason: pReason
            }
        });

        return objPosition;
    }

    private async openOptionPositions(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number,
        pReason: string,
        pColorCode: "R" | "G",
        pUseReEntryDelta = false,
        pRuleSet: 1 | 2 = 1,
        pOptionSidesOverride?: Array<"CE" | "PE">
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const objSnapshot = await this.getMarketSnapshot(this.getOrCreateState(pUserId), pConfig);
        const vOptionSides: Array<"CE" | "PE"> = Array.isArray(pOptionSidesOverride) && pOptionSidesOverride.length > 0
            ? pOptionSidesOverride
            : (pConfig.legSide === "both"
                ? ["CE", "PE"]
                : [pConfig.legSide === "pe" ? "PE" : "CE"]);
        const objRuleValues = this.getRuleValues(pConfig, pColorCode);
        const vAction = pConfig.action === "buy" ? "BUY" : "SELL";
        const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
        const vTargetDelta = pUseReEntryDelta ? objRuleValues.reDelta : pConfig.newDelta;
        const vStrike = Math.round(objSnapshot.spotPrice / 100) * 100;
        const objSaved: RollingOptionsPtDePositionRecord[] = [];

        const objPlannedLegs: Array<{
            optionSide: "CE" | "PE";
            contractName: string;
            strike: number;
            expiryDate: string;
            markPrice: number;
            entryDelta: number;
            takeProfitDelta: number;
            stopLossDelta: number;
            productSymbol: string;
            productDelta: number;
            productGamma: number;
            productTheta: number;
            productVega: number;
            usedNextDayExpiryFallback: boolean;
        }> = [];

        for (const vOptionSide of vOptionSides) {
            const objLiveContract = await findBestLiveOptionContract(
                pConfig,
                vOptionSide,
                vTargetDelta,
                false,
                pUseReEntryDelta ? RollingOptionsStrangleService.RE_DELTA_TOLERANCE : undefined
            );
            if (pUseReEntryDelta && !objLiveContract?.contractSymbol) {
                return [];
            }
            if (objLiveContract?.contractSymbol) {
                ensureLiveTickerSymbols([objLiveContract.contractSymbol]);
            }
            const vMark = objLiveContract?.markPrice || Number((objSnapshot.spotPrice * Math.max(0.002, Math.abs(vTargetDelta) * 0.012)).toFixed(2));
            const vEntryDelta = objLiveContract ? Math.abs(objLiveContract.delta) : vTargetDelta;
            const vBaseDelta = Math.abs(Number(vEntryDelta || 0));
            let vTakeProfitDelta = Number(objRuleValues.takeProfitDelta || 0);
            let vStopLossDelta = Number(objRuleValues.stopLossDelta || 0);

            if (pColorCode === "G" || pColorCode === "R") {
                const getPctValue = (pValue: unknown, pFallback: number): number => {
                    const vNum = Number(pValue);
                    return Number.isFinite(vNum) ? Math.max(0, Math.min(100, vNum)) : pFallback;
                };
                const bIsRuleSet2 = Number((pConfig as any)?.ruleSet || 1) === 2;
                const vTpPct = bIsRuleSet2
                    ? (pColorCode === "G"
                        ? getPctValue((pConfig as any).ruleSetGreenTpPct, 15)
                        : getPctValue((pConfig as any).ruleSetRedTpPct, 15))
                    : getPctValue((pColorCode === "G" ? pConfig.greenTakeProfitPct : pConfig.redTakeProfitPct), 15);
                const vSlPct = bIsRuleSet2
                    ? (pColorCode === "G"
                        ? getPctValue((pConfig as any).ruleSetGreenSlPct, 85)
                        : getPctValue((pConfig as any).ruleSetRedSlPct, 85))
                    : getPctValue((pColorCode === "G" ? pConfig.greenStopLossPct : pConfig.redStopLossPct), 85);

                const vTpMove = clamp01(vTpPct / 100);
                const vSlMove = clamp01(vSlPct / 100);
                if (vAction === "BUY") {
                    vTakeProfitDelta = clamp01(vBaseDelta + vTpMove);
                    vStopLossDelta = clamp01(vBaseDelta - vSlMove);
                }
                else {
                    vTakeProfitDelta = clamp01(vBaseDelta - vTpMove);
                    const vRawStopLoss = vBaseDelta + vSlMove;
                    const vAbsoluteStopLoss = clamp01(vSlPct / 100);
                    vStopLossDelta = vRawStopLoss > 1 ? vAbsoluteStopLoss : clamp01(vRawStopLoss);
                }
            }

            if (!pUseReEntryDelta && this.wouldOptionTriggerImmediately({
                takeProfitDelta: vTakeProfitDelta,
                stopLossDelta: vStopLossDelta
            }, vAction, vBaseDelta)) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "warning",
                    title: "Option Re-entry Skipped",
                    message: `Skipped ${pReason} because the replacement delta ${vEntryDelta.toFixed(4)} already violates TP/SL settings.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "replacement_option_immediate_trigger_skip",
                        contractName: objLiveContract?.contractSymbol || `${pConfig.contractName} ${vOptionSide}`,
                        delta: vEntryDelta
                    }
                });
                continue;
            }

            objPlannedLegs.push({
                optionSide: vOptionSide,
                contractName: objLiveContract?.contractSymbol || `${pConfig.contractName} ${vOptionSide}`,
                strike: objLiveContract?.strike || vStrike,
                expiryDate: objLiveContract?.expiryDate || pConfig.expiryDate,
                markPrice: vMark,
                entryDelta: vEntryDelta,
                takeProfitDelta: vTakeProfitDelta,
                stopLossDelta: vStopLossDelta,
                productSymbol: objLiveContract?.contractSymbol || "",
                productDelta: objLiveContract?.delta || vTargetDelta,
                productGamma: objLiveContract?.gamma || 0,
                productTheta: objLiveContract?.theta || 0,
                productVega: objLiveContract?.vega || 0,
                usedNextDayExpiryFallback: Boolean(objLiveContract?.usedNextDayFallback)
            });
        }

        if (objPlannedLegs.length === 0) {
            return [];
        }

        const vAdditionalMargin = objPlannedLegs.reduce((sum, objLeg) => {
            return sum + this.calculatePaperNotional(pQty, pConfig.lotSize, objLeg.markPrice);
        }, 0);
        if (!(await this.hasSufficientDemoBalance(pUserId, pConfig, vAdditionalMargin, pReason))) {
            return [];
        }

        for (const objLeg of objPlannedLegs) {
            objSaved.push(await saveRollingOptionsPtDePosition({
                positionId: crypto.randomUUID(),
                userId: pUserId,
                groupId: `group_${Date.now()}`,
                cycleId: `cycle_${Date.now()}`,
                status: "OPEN",
                symbol: pConfig.symbol,
                contractName: objLeg.contractName,
                instrumentType: "OPTION",
                optionSide: objLeg.optionSide,
                action: vAction,
                strike: objLeg.strike,
                expiryDate: objLeg.expiryDate,
                qty: pQty,
                lotSize: pConfig.lotSize,
                entryPrice: objLeg.markPrice,
                exitPrice: null,
                markPrice: objLeg.markPrice,
                entryDelta: objLeg.entryDelta,
                exitDelta: objLeg.entryDelta,
                charges: estimatePositionCharges("OPTION", pQty, pConfig.lotSize, objLeg.markPrice, objSnapshot.spotPrice),
                pnl: 0,
                openedReason: pReason,
                closedReason: "",
                openedAt: objSnapshot.ts,
                closedAt: "",
                metadata: {
                    deltaTakeProfit: objLeg.takeProfitDelta,
                    deltaStopLoss: objLeg.stopLossDelta,
                    takeProfitDelta: objLeg.takeProfitDelta,
                    stopLossDelta: objLeg.stopLossDelta,
                    reEntryDelta: objRuleValues.reDelta,
                    reEnter: pConfig.reEnter,
                    ruleColor: objRuleValues.colorCode,
                    ruleSet: pRuleSet,
                    entrySpotPrice: objSnapshot.spotPrice,
                    productSymbol: objLeg.productSymbol,
                    productDelta: objLeg.productDelta,
                    productGamma: objLeg.productGamma,
                    productTheta: objLeg.productTheta,
                    productVega: objLeg.productVega,
                    expiryMode: pConfig.expiryMode,
                    requestedExpiryDate: pConfig.expiryDate,
                    resolvedExpiryDate: objLeg.expiryDate,
                    usedNextDayExpiryFallback: objLeg.usedNextDayExpiryFallback,
                    source: objSnapshot.priceSource === "public" ? "server-strategy-live" : "server-strategy-simulated"
                },
                createdAt: objSnapshot.ts,
                updatedAt: objSnapshot.ts
            }));
        }

        const objFallbackPositions = objSaved.filter((objRow) => Boolean(objRow.metadata?.usedNextDayExpiryFallback));
        if (objFallbackPositions.length > 0) {
            const objFirstFallback = objFallbackPositions[0];
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Next-Day Expiry Fallback Used",
                message: `Used next-day expiry fallback for ${objFallbackPositions.length} option leg(s).`,
                payload: {
                    symbol: pConfig.symbol,
                    qty: objFallbackPositions.length,
                    reason: "next_day_expiry_fallback",
                    requestedExpiryDate: String(objFirstFallback.metadata?.requestedExpiryDate || pConfig.expiryDate),
                    resolvedExpiryDate: String(objFirstFallback.metadata?.resolvedExpiryDate || objFirstFallback.expiryDate || pConfig.expiryDate)
                }
            });
        }

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: pReason.toLowerCase().includes("re-entry") || pReason.toLowerCase().includes("replacement")
                ? "reentry_opened"
                : "option_opened",
            severity: "success",
            title: pReason.toLowerCase().includes("re-entry") || pReason.toLowerCase().includes("replacement")
                ? "Replacement Option Opened"
                : "Option Opened",
            message: `Opened ${objSaved.length} option paper leg(s).`,
            payload: {
                symbol: pConfig.symbol,
                qty: pQty,
                reason: pReason
            }
        });

        return objSaved;
    }

    private wouldOptionTriggerImmediately(
        pRuleValues: {
            takeProfitDelta: number;
            stopLossDelta: number;
        },
        pAction: "BUY" | "SELL",
        pDelta: number
    ): boolean {
        const vAbsDelta = Math.abs(Number(pDelta || 0));
        const vDeltaSl = Number(pRuleValues.stopLossDelta || 0);
        const vDeltaTp = Number(pRuleValues.takeProfitDelta || 0);
        const bHasSl = Number.isFinite(vDeltaSl) && vDeltaSl > 0;
        const bHasTp = Number.isFinite(vDeltaTp) && vDeltaTp > 0;

        if (!Number.isFinite(vAbsDelta)) {
            return false;
        }

        if (pAction === "SELL") {
            if (bHasSl && vAbsDelta >= vDeltaSl) {
                return true;
            }
            if (bHasTp && vAbsDelta <= vDeltaTp) {
                return true;
            }
            return false;
        }

        if (bHasSl && vAbsDelta <= vDeltaSl) {
            return true;
        }
        if (bHasTp && vAbsDelta >= vDeltaTp) {
            return true;
        }
        return false;
    }

    private async closePositions(
        pPositions: RollingOptionsPtDePositionRecord[],
        pConfig: RollingOptionsPtDeConfig,
        pReason: string
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const objSnapshot = await this.getMarketSnapshot(this.getOrCreateState(pPositions[0]?.userId || "demo-paper"), pConfig);
        const objClosed: RollingOptionsPtDePositionRecord[] = [];

        for (const objPosition of pPositions) {
            const vProductSymbol = String(objPosition.metadata?.productSymbol || "").trim();
            const objLiveTicker = objPosition.instrumentType === "OPTION" && vProductSymbol
                ? await getLiveOptionTicker(vProductSymbol)
                : null;
            const vCurrentDelta = objPosition.instrumentType === "OPTION"
                ? Math.abs(Number(objLiveTicker?.delta || objPosition.exitDelta || objPosition.entryDelta || 0.53))
                : null;
            const vExitPrice = objPosition.instrumentType === "OPTION"
                ? Number(objLiveTicker?.markPrice || objPosition.markPrice || objPosition.entryPrice || 0)
                : objSnapshot.futuresPrice;
            const vExitCharges = estimatePositionCharges(
                objPosition.instrumentType,
                objPosition.qty,
                objPosition.lotSize,
                vExitPrice,
                objPosition.instrumentType === "OPTION" ? objSnapshot.spotPrice : undefined
            );
            objClosed.push(await saveRollingOptionsPtDePosition({
                ...objPosition,
                status: "CLOSED",
                exitPrice: vExitPrice,
                markPrice: vExitPrice,
                exitDelta: vCurrentDelta,
                charges: Number((Number(objPosition.charges || 0) + vExitCharges).toFixed(4)),
                pnl: getPositionPnl(objPosition, vExitPrice),
                closedReason: pReason,
                closedAt: objSnapshot.ts,
                updatedAt: ""
            }));
        }

        if (objClosed.length > 0) {
            await syncOptionsPnlWithClosedPositions(objClosed[0].userId);
            await logRollingOptionsPtDeEvent({
                userId: objClosed[0].userId,
                eventType: pReason.toLowerCase().includes("sl")
                    ? "sl_triggered"
                    : (pReason.toLowerCase().includes("tp") ? "tp_triggered" : "option_closed"),
                severity: pReason.toLowerCase().includes("sl") ? "warning" : "info",
                title: pReason.toLowerCase().includes("sl")
                    ? "SL Triggered"
                    : (pReason.toLowerCase().includes("tp") ? "TP Triggered" : "Position Closed"),
                message: `Closed ${objClosed.length} paper position(s).`,
                payload: {
                    symbol: pConfig.symbol,
                    qty: objClosed.length,
                    reason: pReason
                }
            });
        }

        return objClosed;
    }

    private getRenkoOptionQty(pFutureQty: number, pQtyPct: number): number {
        const vBaseQty = Math.max(0, Number(pFutureQty || 0));
        const vPercent = Math.max(0, Number(pQtyPct || 0));

        if (!(vBaseQty > 0) || !(vPercent > 0)) {
            return 0;
        }

        return Math.max(1, Math.round(vBaseQty * vPercent / 100));
    }

    private async openGreenRenkoFuturePosition(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pReason: string
    ): Promise<void> {
        const bFuturesEnabled = Boolean((pConfig as any).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Futures Disabled",
                message: "Skipped GREEN Renko future entry because FUT Enabled is OFF.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "futures_disabled"
                }
            });
            return;
        }

        const objSummary = getOpenPositionsSummary(await listRollingOptionsPtDeOpenPositions(pUserId));
        const vFutureQty = pConfig.greenOptionQty !== undefined
            ? Math.max(0, Math.floor(Number(pConfig.greenOptionQty || 0)))
            : this.getRenkoOptionQty(objSummary.futureQty, pConfig.greenOptionQtyPct);

        if (!(vFutureQty > 0)) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Renko GREEN Futures Skipped",
                message: "Skipped GREEN Renko future entry because Green Opt Qty is 0.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_green_future_skipped_zero_qty"
                }
            });
            return;
        }

        await this.openFuturePosition(pUserId, pConfig, vFutureQty, pReason);
    }

    public async executeStrategy(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const bFuturesEnabled = Boolean((objConfig as any).futuresEnabled ?? true);
        const objSummary = getOpenPositionsSummary(await listRollingOptionsPtDeOpenPositions(pUserId));

        if (bFuturesEnabled && objSummary.futureQty <= 0) {
            await this.openFuturePosition(pUserId, objConfig, objConfig.futureQty, "Strategy initial future");
        }

        const objPositionsAfterFuture = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objNextSummary = getOpenPositionsSummary(objPositionsAfterFuture);
        const arrOpenOptions = objPositionsAfterFuture.filter((objRow) => objRow.instrumentType === "OPTION" && objRow.status === "OPEN");
        const bHasRuleSet1 = arrOpenOptions.some((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) !== 2);
        const bHasRuleSet2 = arrOpenOptions.some((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) === 2);

        if (((bAction1Enabled && !bHasRuleSet1) || (bAction2Enabled && !bHasRuleSet2))
            && (bFuturesEnabled ? objNextSummary.futureQty > 0 : true)) {
            const vCurrentRenkoColor = String(objState.renko.lastColor || "").trim().toUpperCase();
            const vRuleColor: "R" | "G" = objConfig.renkoEnabled && vCurrentRenkoColor === "G" ? "G" : "R";

            const readRuleSetQty = (pRuleSet: 1 | 2): number => {
                if (pRuleSet !== 2) {
                    return 0;
                }
                const vRaw = vRuleColor === "G"
                    ? Number((objUiState as any).greenOptQty2)
                    : Number((objUiState as any).redOptQty2);
                return Number.isFinite(vRaw) ? Math.max(0, Math.floor(vRaw)) : 0;
            };

            const computeQty = (pCfg: RollingOptionsPtDeConfig, pRuleSet: 1 | 2): number => {
                if (pRuleSet === 2) {
                    return readRuleSetQty(2);
                }
                if (bFuturesEnabled) {
                    return vRuleColor === "G"
                        ? (pCfg.greenOptionQty !== undefined
                            ? Math.max(0, Math.floor(Number(pCfg.greenOptionQty || 0)))
                            : this.getRenkoOptionQty(objNextSummary.futureQty, pCfg.greenOptionQtyPct))
                        : (pCfg.redOptionQty !== undefined
                            ? Math.max(0, Math.floor(Number(pCfg.redOptionQty || 0)))
                            : this.getRenkoOptionQty(objNextSummary.futureQty, pCfg.redOptionQtyPct));
                }

                return vRuleColor === "G"
                    ? Math.max(0, Math.floor(Number(pCfg.greenOptionQty ?? 1)))
                    : Math.max(0, Math.floor(Number(pCfg.redOptionQty ?? 1)));
            };

            if (bAction1Enabled && !bHasRuleSet1) {
                const vQty1 = computeQty(objConfig, 1);
                if (vQty1 > 0) {
                    await this.openOptionPositions(
                        pUserId,
                        objConfig,
                        vQty1,
                        "Strategy initial option entry (Action 1)",
                        vRuleColor,
                        true,
                        1
                    );
                }
            }

            if (bAction2Enabled && !bHasRuleSet2) {
                const vQty2 = computeQty(objConfig2, 2);
                if (vQty2 > 0) {
                    await this.openOptionPositions(
                        pUserId,
                        objConfig2,
                        vQty2,
                        "Strategy initial option entry (Action 2)",
                        vRuleColor,
                        true,
                        2
                    );
                }
            }
        }

        await this.syncRuntime(pUserId, objConfig, objState, {
            status: objState.running ? "running" : "stopped",
            lastSignal: "STRATEGY_EXECUTED",
            lastCycleAt: new Date().toISOString(),
            lastError: ""
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "strategy_executed",
            severity: "success",
            title: "Strategy Executed",
            message: "Initial futures and option entry flow executed.",
            payload: {
                symbol: objConfig.symbol,
                reason: "strategy_execute"
            }
        });

        return { status: "success", message: "Strategy executed." };
    }

    public async start(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.running) {
            return { status: "warning", message: "Auto trader already running." };
        }

        const objConfig = await this.loadConfig(pUserId);
        objState.running = true;
        objState.lastError = "";
        this.armTimer(objState, objConfig.loopSeconds);
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "running",
            autoTraderEnabled: true,
            lastSignal: "AUTO_TRADER_ON",
            lastCycleAt: new Date().toISOString()
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "engine_started",
            severity: "success",
            title: "Auto Trader Started",
            message: "Server-side auto trader started.",
            payload: {
                symbol: objConfig.symbol,
                reason: "engine_started"
            }
        });
        void this.runCycle(pUserId);
        return { status: "success", message: "Auto trader started." };
    }

    public async stop(pUserId: string, pReason = "Manual stop"): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.timerRef) {
            clearInterval(objState.timerRef);
            objState.timerRef = null;
        }
        objState.running = false;
        const objConfig = await this.loadConfig(pUserId);
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "stopped",
            autoTraderEnabled: false,
            lastSignal: pReason === "Manual stop" ? "AUTO_TRADER_OFF" : "ENGINE_STOPPED"
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "engine_stopped",
            severity: "info",
            title: "Auto Trader Stopped",
            message: "Server-side auto trader stopped.",
            payload: {
                symbol: objConfig.symbol,
                reason: pReason
            }
        });
        return { status: "success", message: "Auto trader stopped." };
    }

    private async handleRenkoOptionEntry(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G"
    ): Promise<void> {
        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objSummary = getOpenPositionsSummary(objOpenPositions);
        const vColorLabel = pColorCode === "R" ? "RED" : "GREEN";
        const objUiState = await this.loadUiState(pUserId);
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const objOpenOptions = objOpenPositions.filter((objRow) => objRow.instrumentType === "OPTION" && objRow.status === "OPEN");
        const objOpenOptions1 = objOpenOptions.filter((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) !== 2);
        const objOpenOptions2 = objOpenOptions.filter((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) === 2);
        const bSkipRenkoEntryNoOpenOptions = Boolean((objUiState as any).skipRenkoEntryNoOpenOptions);

        if (bSkipRenkoEntryNoOpenOptions && objOpenOptions.length <= 0) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: `Renko ${vColorLabel} Skipped`,
                message: `Skipped ${vColorLabel} Renko option entry because Skip entry (0 open opts) is enabled and no option leg is running.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_option_skipped_no_open_option_leg_switch",
                    skipRenkoEntryNoOpenOptions: true
                }
            });
            return;
        }

        const readRuleSetQty = (pRuleSet: 1 | 2): number => {
            if (pRuleSet !== 2) {
                return 0;
            }
            const vRaw = pColorCode === "G"
                ? Number((objUiState as any).greenOptQty2)
                : Number((objUiState as any).redOptQty2);
            return Number.isFinite(vRaw) ? Math.max(0, Math.floor(vRaw)) : 0;
        };

        const computeQty = (pCfg: RollingOptionsPtDeConfig, pRuleSet: 1 | 2): number => {
            if (pRuleSet === 2) {
                return readRuleSetQty(2);
            }
            const vExplicitQty = pColorCode === "R"
                ? Number(pCfg.redOptionQty)
                : Number(pCfg.greenOptionQty);
            if (Number.isFinite(vExplicitQty)) {
                return Math.max(0, Math.floor(vExplicitQty));
            }
            const vPctQty = pColorCode === "R"
                ? this.getRenkoOptionQty(objSummary.futureQty, pCfg.redOptionQtyPct)
                : this.getRenkoOptionQty(objSummary.futureQty, pCfg.greenOptionQtyPct);
            return vPctQty > 0 ? vPctQty : 1;
        };

        const bShouldOpen1 = bAction1Enabled && objOpenOptions1.length === 0;
        const bShouldOpen2 = bAction2Enabled && objOpenOptions2.length === 0;
        if (!bShouldOpen1 && !bShouldOpen2) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: `Renko ${vColorLabel} Skipped`,
                message: `Skipped ${vColorLabel} Renko option entry because an option position is already open for the enabled rule set(s).`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_option_skipped_option_already_open",
                    openOptionLegsRuleSet1: objOpenOptions1.length,
                    openOptionLegsRuleSet2: objOpenOptions2.length,
                    action1Enabled: bAction1Enabled,
                    action2Enabled: bAction2Enabled
                }
            });
            return;
        }

        if (bShouldOpen1) {
            const vFallbackQty = computeQty(objConfig1, 1);
            const vQty = vFallbackQty;
            if (!(vQty > 0)) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "info",
                    title: `Renko ${vColorLabel} Skipped`,
                    message: `Skipped ${vColorLabel} Renko option entry for Action 1 because qty resolved to 0.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "renko_option_skipped_zero_qty_action_1"
                    }
                });
            }
            else {
                await this.openOptionPositions(
                    pUserId,
                    objConfig1,
                    vQty,
                    pColorCode === "R" ? "Renko RED option entry (Action 1)" : "Renko GREEN option entry (Action 1)",
                    pColorCode,
                    false,
                    1
                );
            }
        }
        if (bShouldOpen2) {
            const vFallbackQty = computeQty(objConfig2, 2);
            const vQty = vFallbackQty;
            if (!(vQty > 0)) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "info",
                    title: `Renko ${vColorLabel} Skipped`,
                    message: `Skipped ${vColorLabel} Renko option entry for Action 2 because qty resolved to 0.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "renko_option_skipped_zero_qty_action_2"
                    }
                });
            }
            else {
                await this.openOptionPositions(
                    pUserId,
                    objConfig2,
                    vQty,
                    pColorCode === "R" ? "Renko RED option entry (Action 2)" : "Renko GREEN option entry (Action 2)",
                    pColorCode,
                    false,
                    2
                );
            }
        }
    }

    private async handleRenkoRedFlow(pUserId: string, pConfig: RollingOptionsPtDeConfig): Promise<void> {
        await this.handleRenkoOptionEntry(pUserId, pConfig, "R");
    }

    private async handleRenkoGreenFlow(pUserId: string, pConfig: RollingOptionsPtDeConfig): Promise<void> {
        await this.handleRenkoOptionEntry(pUserId, pConfig, "G");
        const objSummary = getOpenPositionsSummary(await listRollingOptionsPtDeOpenPositions(pUserId));

        if (objSummary.futureQty <= 0) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Renko GREEN Skipped",
                message: "Skipped GREEN Renko future entry because no futures position is open.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_green_future_skipped_no_open_future"
                }
            });
            return;
        }

        if (objSummary.hasOpenOption) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Renko GREEN Skipped",
                message: "Skipped GREEN Renko future entry because an option position is already open.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_green_future_skipped_option_already_open"
                }
            });
            return;
        }

        await this.openGreenRenkoFuturePosition(pUserId, pConfig, "Renko GREEN future entry");
    }

    private async handleOptionTrigger(
        pUserId: string,
        _pConfig: RollingOptionsPtDeConfig,
        pPosition: RollingOptionsPtDePositionRecord,
        pReason: "sl" | "tp"
    ): Promise<void> {
        const objUiState = await this.loadUiState(pUserId);
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const bFuturesEnabled = Boolean((objConfig1 as any).futuresEnabled ?? true);
        const vCurrentRenkoColor = String(this.getOrCreateState(pUserId).renko.lastColor || "").trim().toUpperCase();
        const vStoredRuleColor = String(pPosition.metadata?.ruleColor || "").trim().toUpperCase();
        const vTriggeredRuleSet = Math.floor(Number((pPosition.metadata as any)?.ruleSet ?? 1)) === 2 ? 2 : 1;
        const objTriggeredConfig = vTriggeredRuleSet === 2 ? objConfig2 : objConfig1;
        const bTriggeredActionEnabled = vTriggeredRuleSet === 2 ? bAction2Enabled : bAction1Enabled;
        const vActiveRuleColor = objConfig1.renkoEnabled
            ? (vCurrentRenkoColor === "G" ? "G" : "R")
            : (vStoredRuleColor === "G" ? "G" : "R");
        const vCloseReason = pReason === "sl" ? "SL triggered" : "TP triggered";

        const objClosedPositions = await this.closePositions([pPosition], objTriggeredConfig, vCloseReason);
        const bShouldCloseAllLegs = objClosedPositions.some((objClosedPosition) => {
            return objClosedPosition.instrumentType === "OPTION" && Number(objClosedPosition.pnl || 0) < 0;
        });
        if (Boolean((objUiState as any).closeAllLegsOnAnyClose) && bShouldCloseAllLegs) {
            const objRemaining = await listRollingOptionsPtDeOpenPositions(pUserId);
            if (objRemaining.length > 0) {
                await this.closePositions(objRemaining, objTriggeredConfig, "Close all legs switch");
            }
        }
        return;
    }

    public async runCycle(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.isBusy) {
            return { status: "warning", message: "Cycle already in progress." };
        }

        objState.isBusy = true;
        try {
            const objConfig = await this.loadConfig(pUserId);
            const objCurrentOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
            ensureLiveTickerSymbols([
                objConfig.contractName,
                ...objCurrentOpenPositions
                    .map((objRow) => String(objRow.metadata?.productSymbol || "").trim())
                    .filter(Boolean)
            ]);
            const objSnapshot = await this.getMarketSnapshot(objState, objConfig);
            objState.market.lastSpotPrice = objSnapshot.spotPrice;
            objState.market.lastFuturesPrice = objSnapshot.futuresPrice;
            objState.market.lastSource = objSnapshot.priceSource;

            const objRenkoSignals = objConfig.renkoEnabled
                ? updateRenkoState(objState, objSnapshot, objConfig)
                : [];

            if (objRenkoSignals.length > 0) {
                const vLast = objRenkoSignals.at(-1) === "R" ? "R" : "G";
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "renko_change_detected",
                    severity: "info",
                    title: "Renko Change Detected",
                    message: `Server detected ${objRenkoSignals.length} renko brick(s).`,
                    payload: {
                        symbol: objConfig.symbol,
                        reason: "renko_bricks",
                        renkoColor: vLast,
                        bricks: objRenkoSignals.length
                    }
                });
            }

            for (const vRenkoSignal of objRenkoSignals) {
                if (!objState.running) {
                    break;
                }

                if (vRenkoSignal === "R") {
                    await this.handleRenkoRedFlow(pUserId, objConfig);
                    continue;
                }

                await this.handleRenkoGreenFlow(pUserId, objConfig);
            }

            const objOpenFutures = objCurrentOpenPositions
                .filter((objRow) => objRow.instrumentType === "FUTURE");
            const objOpenOptions = objCurrentOpenPositions
                .filter((objRow) => objRow.instrumentType === "OPTION");

            const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
            const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
            const bTrailGreenTp1Enabled = Boolean((objUiState as any).trailGreenTp1Enabled ?? true);
            const bTrailGreenSl1Enabled = Boolean((objUiState as any).trailGreenSl1Enabled ?? true);
            const bTrailRedTp1Enabled = Boolean((objUiState as any).trailRedTp1Enabled ?? true);
            const bTrailRedSl1Enabled = Boolean((objUiState as any).trailRedSl1Enabled ?? true);
            const bTrailGreenTp2Enabled = Boolean((objUiState as any).trailGreenTp2Enabled ?? true);
            const bTrailGreenSl2Enabled = Boolean((objUiState as any).trailGreenSl2Enabled ?? true);
            const bTrailRedTp2Enabled = Boolean((objUiState as any).trailRedTp2Enabled ?? true);
            const bTrailRedSl2Enabled = Boolean((objUiState as any).trailRedSl2Enabled ?? true);

            for (const objPosition of objOpenFutures) {
                const vNextPnl = getPositionPnl(objPosition, objSnapshot.futuresPrice);
                const bShouldSave = Number(objPosition.markPrice ?? NaN) !== objSnapshot.futuresPrice
                    || Number(objPosition.pnl ?? NaN) !== vNextPnl;
                if (bShouldSave) {
                    await saveRollingOptionsPtDePosition({
                        ...objPosition,
                        markPrice: objSnapshot.futuresPrice,
                        pnl: vNextPnl,
                        updatedAt: ""
                    });
                }
            }

            for (const objPosition of objOpenOptions) {
                const vProductSymbol = String(objPosition.metadata?.productSymbol || "").trim();
                const objCachedTicker = vProductSymbol ? getCachedOptionTicker(vProductSymbol) : null;
                const vCurrentDelta = Math.abs(Number(objCachedTicker?.delta || objPosition.exitDelta || objPosition.entryDelta || 0.53));
                const vMarkPrice = Number(objCachedTicker?.markPrice || objPosition.markPrice || objPosition.entryPrice || 0);
                const objMeta = (objPosition.metadata || {}) as Record<string, unknown>;
                const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                const vAction = String(objPosition.action || "").trim().toUpperCase();
                const vRuleSet = Math.floor(Number((objMeta as any).ruleSet ?? 1)) === 2 ? 2 : 1;
                const objRuleConfig = vRuleSet === 2 ? objConfig2 : objConfig;
                const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
                const vSlMove = vRuleColor === "R"
                    ? clamp01(Number(objRuleConfig.redStopLossPct ?? 85) / 100)
                    : clamp01(Number(objRuleConfig.greenStopLossPct ?? 85) / 100);
                const vGreenTpMove = clamp01(Number(objRuleConfig.greenTakeProfitPct ?? 15) / 100);
                const vRedTpMove = clamp01(Number(objRuleConfig.redTakeProfitPct ?? 15) / 100);
                const vExistingSl = Number(objMeta.deltaStopLoss ?? objMeta.stopLossDelta ?? 0);
                const objNextMeta = { ...objMeta } as Record<string, unknown>;
                let bMetaChanged = false;

                if ((vRuleColor === "G" || vRuleColor === "R") && (vAction === "BUY" || vAction === "SELL")) {
                    const bTrailSlEnabled = vRuleSet === 2
                        ? (vRuleColor === "G" ? bTrailGreenSl2Enabled : (vRuleColor === "R" ? bTrailRedSl2Enabled : false))
                        : (vRuleColor === "G" ? bTrailGreenSl1Enabled : (vRuleColor === "R" ? bTrailRedSl1Enabled : false));
                    const bTrailTpEnabled = vRuleSet === 2
                        ? (vRuleColor === "G" ? bTrailGreenTp2Enabled : (vRuleColor === "R" ? bTrailRedTp2Enabled : false))
                        : (vRuleColor === "G" ? bTrailGreenTp1Enabled : (vRuleColor === "R" ? bTrailRedTp1Enabled : false));

                    const vEntryDelta = Math.abs(Number(objPosition.entryDelta || 0.53));

                    if (bTrailSlEnabled) {
                        const vPrevBest = Number(objNextMeta.trailBestDelta);
                        const vBestDelta = Number.isFinite(vPrevBest)
                            ? (vAction === "BUY" ? Math.max(vPrevBest, vCurrentDelta) : Math.min(vPrevBest, vCurrentDelta))
                            : (vAction === "BUY" ? Math.max(vEntryDelta, vCurrentDelta) : Math.min(vEntryDelta, vCurrentDelta));

                        if (Number.isFinite(vSlMove) && vSlMove > 0) {
                            const vCandidateRaw = vAction === "BUY" ? (vBestDelta - vSlMove) : (vBestDelta + vSlMove);
                            const vCandidate = (vAction === "SELL" && vCandidateRaw > 1) ? vSlMove : clamp01(vCandidateRaw);
                            const vNextSl = vAction === "BUY"
                                ? (Number.isFinite(vExistingSl) && vExistingSl > 0 ? Math.max(vExistingSl, vCandidate) : vCandidate)
                                : (Number.isFinite(vExistingSl) && vExistingSl > 0 ? Math.min(vExistingSl, vCandidate) : vCandidate);
                            const vExistingStopLoss = Number(objNextMeta.deltaStopLoss ?? objNextMeta.stopLossDelta ?? 0);
                            if (!Number.isFinite(vExistingStopLoss) || Math.abs(vExistingStopLoss - vNextSl) > 1e-9) {
                                objNextMeta.deltaStopLoss = Number(vNextSl.toFixed(6));
                                objNextMeta.stopLossDelta = Number(vNextSl.toFixed(6));
                                bMetaChanged = true;
                            }
                        }

                        const vExistingTrailBest = Number(objNextMeta.trailBestDelta);
                        if (!Number.isFinite(vExistingTrailBest) || Math.abs(vExistingTrailBest - vBestDelta) > 1e-9) {
                            objNextMeta.trailBestDelta = Number(vBestDelta.toFixed(6));
                            bMetaChanged = true;
                        }
                    }

                    const vTpMove = vRuleColor === "G" ? vGreenTpMove : vRedTpMove;
                    if (bTrailTpEnabled && Number.isFinite(vTpMove) && vTpMove > 0) {
                        const vPrevTpBest = Number(objNextMeta.trailTpPeakDelta);
                        const vTpBestDelta = Number.isFinite(vPrevTpBest)
                            ? (vAction === "BUY" ? Math.max(vPrevTpBest, vCurrentDelta) : Math.min(vPrevTpBest, vCurrentDelta))
                            : (vAction === "BUY" ? Math.max(vEntryDelta, vCurrentDelta) : Math.min(vEntryDelta, vCurrentDelta));
                        const vExistingTp = Number(objMeta.deltaTakeProfit ?? objMeta.takeProfitDelta ?? 0);
                        const vCandidate = vAction === "BUY"
                            ? clamp01(vTpBestDelta + vTpMove)
                            : clamp01(vTpBestDelta - vTpMove);
                        const vNextTp = Number.isFinite(vExistingTp) && vExistingTp > 0
                            ? (vAction === "BUY" ? Math.max(vExistingTp, vCandidate) : Math.min(vExistingTp, vCandidate))
                            : vCandidate;

                        const vExistingTpBest = Number(objNextMeta.trailTpPeakDelta);
                        if (!Number.isFinite(vExistingTpBest) || Math.abs(vExistingTpBest - vTpBestDelta) > 1e-9) {
                            objNextMeta.trailTpPeakDelta = Number(vTpBestDelta.toFixed(6));
                            bMetaChanged = true;
                        }
                        const vExistingTakeProfit = Number(objNextMeta.deltaTakeProfit ?? objNextMeta.takeProfitDelta ?? 0);
                        if (!Number.isFinite(vExistingTakeProfit) || Math.abs(vExistingTakeProfit - vNextTp) > 1e-9) {
                            objNextMeta.deltaTakeProfit = Number(vNextTp.toFixed(6));
                            objNextMeta.takeProfitDelta = Number(vNextTp.toFixed(6));
                            bMetaChanged = true;
                        }
                    }
                }

                const vNextPnl = getPositionPnl(objPosition, vMarkPrice);
                const bShouldSave = bMetaChanged
                    || Number(objPosition.markPrice ?? NaN) !== vMarkPrice
                    || Number(objPosition.exitDelta ?? NaN) !== vCurrentDelta
                    || Number(objPosition.pnl ?? NaN) !== vNextPnl;
                if (bShouldSave) {
                    await saveRollingOptionsPtDePosition({
                        ...objPosition,
                        markPrice: vMarkPrice,
                        exitDelta: vCurrentDelta,
                        pnl: vNextPnl,
                        metadata: objNextMeta,
                        updatedAt: ""
                    });
                }

                if (!objState.running) {
                    continue;
                }

                const objDecision = shouldTriggerOption({ ...objPosition, metadata: objNextMeta }, vCurrentDelta);
                if (objDecision.shouldAct && objDecision.reason) {
                    await this.handleOptionTrigger(pUserId, objConfig, objPosition, objDecision.reason);
                    break;
                }
            }

            objState.cycleCount += 1;
            objState.consecutiveFailures = 0;
            objState.lastError = "";
            objState.lastCycleAt = new Date().toISOString();
            const vLastRenkoSignal = objRenkoSignals.at(-1);
            await this.syncRuntime(pUserId, objConfig, objState, {
                status: objState.running ? "running" : "stopped",
                autoTraderEnabled: objState.running,
                lastSpotPrice: objSnapshot.spotPrice,
                lastFuturesPrice: objSnapshot.futuresPrice,
                lastSignal: vLastRenkoSignal
                    ? (vLastRenkoSignal === "R" ? "RED" : "GREEN")
                    : (objState.renko.lastColor === "R" ? "RED" : (objState.renko.lastColor === "G" ? "GREEN" : "IDLE")),
                lastCycleAt: objState.lastCycleAt
            });
            return { status: "success", message: "Cycle completed." };
        }
        catch (objError) {
            const objConfig = await this.loadConfig(pUserId);
            objState.consecutiveFailures += 1;
            objState.lastError = objError instanceof Error ? objError.message : String(objError);
            objState.lastCycleAt = new Date().toISOString();
            await this.syncRuntime(pUserId, objConfig, objState, {
                status: objState.running ? "running" : "error",
                autoTraderEnabled: objState.running,
                lastError: objState.lastError,
                lastSignal: "ENGINE_ERROR",
                lastCycleAt: objState.lastCycleAt
            });
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "engine_error",
                severity: "error",
                title: "Engine Error",
                message: objState.lastError,
                payload: {
                    reason: "engine_error"
                }
            });
            return { status: "danger", message: objState.lastError };
        }
        finally {
            objState.isBusy = false;
        }
    }

    public async emergencyStop(pUserId: string): Promise<{ status: string; message: string; }> {
        const objConfig = await this.loadConfig(pUserId);
        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        if (objOpenPositions.length > 0) {
            await this.closePositions(objOpenPositions, objConfig, "Emergency stop");
        }
        await this.stop(pUserId, "Emergency stop");
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "kill_switch",
            severity: "warning",
            title: "Kill Switch",
            message: "Emergency stop closed open paper positions and stopped the engine.",
            payload: {
                symbol: objConfig.symbol,
                qty: objOpenPositions.length,
                reason: "kill_switch"
            }
        });
        return { status: "success", message: "Emergency stop completed." };
    }

    public async reset(pUserId: string): Promise<{ status: string; message: string; }> {
        await this.stop(pUserId, "Reset");
        const objConfig = await this.loadConfig(pUserId);
        const objState = this.getOrCreateState(pUserId);
        objState.cycleCount = 0;
        objState.consecutiveFailures = 0;
        objState.lastError = "";
        objState.lastCycleAt = null;
        objState.renko.anchor = null;
        objState.renko.lastDir = 0;
        objState.renko.lastColor = "";
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "stopped",
            autoTraderEnabled: false,
            lastSignal: "RESET"
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Strategy Reset",
            message: "Rolling Options server state was reset.",
            payload: {
                symbol: objConfig.symbol,
                reason: "reset"
            }
        });
        return { status: "success", message: "Strategy state reset." };
    }

    public async setManualRenkoSignal(
        pUserId: string,
        pColorCode: "R" | "G"
    ): Promise<{ status: string; message: string; color: "R" | "G"; }> {
        const objState = this.getOrCreateState(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        const vColorCode = pColorCode === "R" ? "R" : "G";

        objState.renko.lastColor = vColorCode;
        objState.renko.lastDir = vColorCode === "R" ? -1 : 1;
        objState.lastError = "";
        objState.lastCycleAt = new Date().toISOString();

        await this.syncRuntime(pUserId, objConfig, objState, {
            status: objState.running ? "running" : "stopped",
            autoTraderEnabled: objState.running,
            lastSignal: vColorCode === "R" ? "MANUAL_RED" : "MANUAL_GREEN",
            lastCycleAt: objState.lastCycleAt,
            lastError: ""
        });

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Manual Renko Signal",
            message: `Manual Renko signal changed to ${vColorCode === "R" ? "RED" : "GREEN"}.`,
            payload: {
                symbol: objConfig.symbol,
                reason: vColorCode === "R" ? "manual_renko_red" : "manual_renko_green"
            }
        });

        if (objState.running) {
            if (vColorCode === "R") {
                await this.handleRenkoRedFlow(pUserId, objConfig);
            }
            else {
                await this.handleRenkoGreenFlow(pUserId, objConfig);
            }
        }

        return {
            status: "success",
            message: `Manual Renko signal set to ${vColorCode === "R" ? "RED" : "GREEN"}.`,
            color: vColorCode
        };
    }

    public async getCounts(pUserId: string): Promise<{ open: number; closed: number; }> {
        const objOpen = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objClosed = await listRollingOptionsPtDeClosedPositions(pUserId);
        return { open: objOpen.length, closed: objClosed.length };
    }
}
