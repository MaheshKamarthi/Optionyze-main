import { loadLocalEnv } from "./load-env";
loadLocalEnv();

import express from "express";
import dns from "node:dns";
import path from "node:path";
import { createApiRouter } from "../api/routes";
import { RunnerManager } from "../runners/runner-manager";
import { ensurePostgresSchema, isPostgresConfigured } from "../storage/postgres";
import { StrategyFoGreeksPaperService } from "../strategies/strategy-fo-greeks-paper/service";
import { startRollingOptionsLtDeConnectionMonitor, runRollingOptionsLtDeConnectionMonitorCycle } from "../strategies/rolling-options-lt-de/connection-monitor";
import { RollingOptionsLtDeService } from "../strategies/rolling-options-lt-de/service";
import { startRollingOptionsStrangleLiveConnectionMonitor, runRollingOptionsStrangleLiveConnectionMonitorCycle } from "../strategies/rolling-options-strangle-live/connection-monitor";
import { RollingOptionsStrangleLiveService } from "../strategies/rolling-options-strangle-live/service";
import { RollingOptionsPtDeService } from "../strategies/rolling-options-pt-de/service";
import { RollingOptionsStrangleService } from "../strategies/rolling-options-strangle/service";
import {
    renderRollingFuturesLiveDualPage,
    renderRollingFuturesLiveLongPage,
    renderRollingFuturesLiveShortPage,
    renderRollingFuturesPaperDemoPage,
    renderStrategyFoPaperPage
} from "../api/controllers/strategyfo-paper-controller";
import { recoverRollingFuturesLtAutoTraderCycles } from "../api/controllers/rolling-futures-lt-controller";
import { renderRollingOptionsPaperDemoPage, renderRollingOptionsStranglePage } from "../api/controllers/rolling-options-pt-de-controller";
import { renderRollingOptionsLivePage } from "../api/controllers/rolling-options-lt-de-controller";
import { renderRollingOptionsLivePage as renderRollingOptionsStrangleLivePage } from "../api/controllers/rolling-options-strangle-live-controller";
import {
    changePassword,
    renderChangePasswordPage,
    renderDashboardPage,
    renderSignInPage,
    sendTelegramSignUpTest,
    renderSignUpPage,
    signInAccount,
    signOutAccount,
    signUpAccount
} from "../api/controllers/auth-controller";
import { renderMngUsersPage } from "../api/controllers/users-controller";
import { renderDeltaExchangeApiPage, renderMyProfilePage, sendTelegramProfileTest, updateMyProfile } from "../api/controllers/account-controller";
import {
    attachAuthContext,
    requireAdminPage,
    requireAuthPage,
    requireFreshPasswordPage,
    requireGuestPage
} from "../api/middleware/auth-middleware";
import { ensureBootstrapAdminAccount } from "../storage/accounts-store";
import { cleanupExpiredSessions } from "../storage/sessions-store";

dns.setDefaultResultOrder("ipv4first");

async function listenOnAvailablePort(app: express.Express, preferredPort: number, allowFallback: boolean): Promise<number> {
    let vPort = preferredPort;
    for (let vAttempt = 0; vAttempt < 20; vAttempt++) {
        try {
            const objServer = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
                const objListeningServer = app.listen(vPort, () => resolve(objListeningServer));
                objListeningServer.on("error", reject);
            });

            const objAddress = objServer.address();
            if (objAddress && typeof objAddress === "object") {
                return objAddress.port;
            }
            return vPort;
        }
        catch (objError) {
            const vCode = typeof objError === "object" && objError ? (objError as { code?: string }).code : undefined;
            if (vCode === "EADDRINUSE" && allowFallback) {
                vPort++;
                continue;
            }
            throw objError;
        }
    }

    throw new Error(`No available port found starting from ${preferredPort}`);
}

async function bootstrap(): Promise<void> {
    const app = express();
    const vEnvPort = process.env.PORT;
    const vPreferredPort = Number(vEnvPort || 3001);
    const runnerManager = new RunnerManager();
    const strategyFoPaperService = new StrategyFoGreeksPaperService(runnerManager);
    const rollingOptionsPtDeService = new RollingOptionsPtDeService(runnerManager);
    const rollingOptionsStrangleService = new RollingOptionsStrangleService(runnerManager);
    const rollingOptionsLtDeService = new RollingOptionsLtDeService(runnerManager);
    const rollingOptionsStrangleLiveService = new RollingOptionsStrangleLiveService(runnerManager);

    await ensurePostgresSchema();
    await ensureBootstrapAdminAccount();
    await cleanupExpiredSessions();
    await runnerManager.hydrate();
    await rollingOptionsPtDeService.hydrate();
    await rollingOptionsStrangleService.hydrate();
    await rollingOptionsLtDeService.hydrate();
    await rollingOptionsStrangleLiveService.hydrate();
    await recoverRollingFuturesLtAutoTraderCycles();
    startRollingOptionsLtDeConnectionMonitor(5 * 60 * 1000);
    void runRollingOptionsLtDeConnectionMonitorCycle();
    startRollingOptionsStrangleLiveConnectionMonitor(5 * 60 * 1000);
    void runRollingOptionsStrangleLiveConnectionMonitorCycle();

    app.set("view engine", "ejs");
    app.set("views", path.resolve(process.cwd(), "src", "views"));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.resolve(process.cwd(), "public"), {
        etag: false,
        lastModified: false,
        maxAge: 0,
        setHeaders: (res) => {
            res.setHeader("Cache-Control", "no-store");
        }
    }));
    app.use(attachAuthContext);

    app.get("/", (_req, res) => {
        res.render("home", {
            storageMode: isPostgresConfigured() ? "PostgreSQL" : "JSON MVP"
        });
    });
    app.get("/signin", requireGuestPage, renderSignInPage);
    app.get("/signup", requireGuestPage, renderSignUpPage);
    app.post("/auth/signin", signInAccount);
    app.post("/auth/signup/test-telegram", sendTelegramSignUpTest);
    app.post("/auth/signup", signUpAccount);
    app.post("/auth/signout", requireAuthPage, async (req, res) => {
        await signOutAccount(req, res);
    });
    app.get("/dashboard", requireAuthPage, requireFreshPasswordPage, renderDashboardPage);
    app.get("/rollingoptions-pt-de", requireAuthPage, requireFreshPasswordPage, renderRollingOptionsPaperDemoPage);
    app.get("/rollingoptions-strangle", requireAuthPage, requireFreshPasswordPage, renderRollingOptionsStranglePage);
    app.get("/rollingfutures-pt-de", requireAuthPage, requireFreshPasswordPage, renderRollingFuturesPaperDemoPage);
    app.get("/rollingoptions-lt-de", requireAuthPage, requireFreshPasswordPage, renderRollingOptionsLivePage);
    app.get("/rollingoptions-strangle-live", requireAuthPage, requireFreshPasswordPage, renderRollingOptionsStrangleLivePage);
    app.get("/rollingfutures-lt-long", requireAuthPage, requireFreshPasswordPage, renderRollingFuturesLiveLongPage);
    app.get("/rollingfutures-lt-short", requireAuthPage, requireFreshPasswordPage, renderRollingFuturesLiveShortPage);
    app.get("/rollingfutures-lt-dual", requireAuthPage, requireFreshPasswordPage, renderRollingFuturesLiveDualPage);
    app.get("/mngusers", requireAuthPage, requireFreshPasswordPage, requireAdminPage, renderMngUsersPage);
    app.get("/account/profile", requireAuthPage, renderMyProfilePage);
    app.post("/account/profile", requireAuthPage, async (req, res) => {
        await updateMyProfile(req, res);
    });
    app.post("/account/profile/test-telegram", requireAuthPage, async (req, res) => {
        await sendTelegramProfileTest(req, res);
    });
    app.get("/account/delta-exchange-api", requireAuthPage, requireFreshPasswordPage, renderDeltaExchangeApiPage);
    app.get("/account/change-password", requireAuthPage, renderChangePasswordPage);
    app.post("/auth/change-password", requireAuthPage, async (req, res) => {
        await changePassword(req, res);
    });
    app.get("/strategyfogreeks", requireAuthPage, requireFreshPasswordPage, renderStrategyFoPaperPage);
    app.use("/api", createApiRouter(runnerManager, strategyFoPaperService, rollingOptionsPtDeService, rollingOptionsStrangleService, rollingOptionsLtDeService, rollingOptionsStrangleLiveService));

    const vPort = await listenOnAvailablePort(app, vPreferredPort, !vEnvPort);
    console.log(`Optionyze server listening on port ${vPort}`);
}

void bootstrap().catch((objError) => {
    console.error("Failed to bootstrap Optionyze", objError);
    process.exitCode = 1;
});



