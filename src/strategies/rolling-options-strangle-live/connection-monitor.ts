import { performRollingOptionsStrangleLiveConnectionCheck } from "../../api/controllers/rolling-options-strangle-live-controller";
import { listRollingOptionsStrangleLiveRuntime } from "../../storage/rolling-options-strangle-live-runtime-store";

let gMonitorTimer: NodeJS.Timeout | null = null;
let gMonitorBusy = false;

export async function runRollingOptionsStrangleLiveConnectionMonitorCycle(): Promise<void> {
    if (gMonitorBusy) {
        return;
    }

    gMonitorBusy = true;
    try {
        const arrRuntimeRows = await listRollingOptionsStrangleLiveRuntime();
        for (const objRuntime of arrRuntimeRows) {
            const vUserId = String(objRuntime.userId || "").trim();
            const vProfileId = String(objRuntime.selectedApiProfileId || "").trim();
            const vStatus = String(objRuntime.status || "").trim().toLowerCase();
            const bActive = vStatus === "running" || vStatus === "paused";
            if (!vUserId || !vProfileId) {
                continue;
            }
            if (!objRuntime.autoTraderEnabled || !bActive) {
                continue;
            }

            try {
                await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vProfileId);
            }
            catch (_objError) {
                // Keep the monitor moving even if one profile fails unexpectedly.
            }
        }
    }
    finally {
        gMonitorBusy = false;
    }
}

export function startRollingOptionsStrangleLiveConnectionMonitor(pIntervalMs = 5 * 60 * 1000): void {
    if (gMonitorTimer) {
        clearInterval(gMonitorTimer);
    }

    gMonitorTimer = setInterval(() => {
        void runRollingOptionsStrangleLiveConnectionMonitorCycle();
    }, Math.max(60 * 1000, Number(pIntervalMs || 0)));
}
