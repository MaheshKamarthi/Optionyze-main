import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "./json-store";
import { getPostgresPool, isPostgresConfigured } from "./postgres";

export interface RollingOptionsStrangleLiveConnectionStatus {
    state: "not_selected" | "checking" | "connected" | "warning" | "disconnected" | "auth_failed" | "rate_limited";
    message: string;
    outboundIp: string;
    lastCheckedAt: string;
    lastSuccessAt: string;
    consecutiveFailures: number;
    alertState: string;
    alertMessage: string;
    alertSentAt: string;
}

export interface RollingOptionsStrangleLiveProfileRecord {
    userId: string;
    selectedApiProfileId: string;
    uiState: Record<string, unknown>;
    connectionStatus: RollingOptionsStrangleLiveConnectionStatus;
    updatedAt: string;
}

interface RollingOptionsStrangleLiveProfileRow {
    user_id: string;
    selected_api_profile_id: string;
    ui_state_json: Record<string, unknown> | null;
    connection_status_json: RollingOptionsStrangleLiveConnectionStatus | null;
    updated_at: string | Date;
}

const gProfilesFile = path.resolve(process.cwd(), "data", "rolling-options-strangle-live", "profiles.json");

function getDefaultConnectionStatus(): RollingOptionsStrangleLiveConnectionStatus {
    return {
        state: "not_selected",
        message: "Select an API profile to start live connection checks.",
        outboundIp: "",
        lastCheckedAt: "",
        lastSuccessAt: "",
        consecutiveFailures: 0,
        alertState: "",
        alertMessage: "",
        alertSentAt: ""
    };
}

function mapRow(pRow?: RollingOptionsStrangleLiveProfileRow | null): RollingOptionsStrangleLiveProfileRecord | null {
    if (!pRow) {
        return null;
    }

    return {
        userId: String(pRow.user_id),
        selectedApiProfileId: String(pRow.selected_api_profile_id || ""),
        uiState: (pRow.ui_state_json ?? {}) as Record<string, unknown>,
        connectionStatus: {
            ...getDefaultConnectionStatus(),
            ...((pRow.connection_status_json ?? {}) as RollingOptionsStrangleLiveConnectionStatus)
        },
        updatedAt: new Date(pRow.updated_at).toISOString()
    };
}

async function loadAllJson(): Promise<RollingOptionsStrangleLiveProfileRecord[]> {
    return readJsonFile<RollingOptionsStrangleLiveProfileRecord[]>(gProfilesFile, []);
}

export function getDefaultRollingOptionsStrangleLiveProfile(pUserId: string): RollingOptionsStrangleLiveProfileRecord {
    return {
        userId: String(pUserId || "").trim(),
        selectedApiProfileId: "",
        uiState: {},
        connectionStatus: getDefaultConnectionStatus(),
        updatedAt: ""
    };
}

export async function loadRollingOptionsStrangleLiveProfile(pUserId: string): Promise<RollingOptionsStrangleLiveProfileRecord | null> {
    const vUserId = String(pUserId || "").trim();
    if (isPostgresConfigured()) {
        const objPool = getPostgresPool();
        const objResult = await objPool.query<RollingOptionsStrangleLiveProfileRow>(`
            SELECT user_id, selected_api_profile_id, ui_state_json, connection_status_json, updated_at
            FROM optionyze_rolling_options_lt_de_profiles
            WHERE user_id = $1
        `, [vUserId]);
        return mapRow(objResult.rows[0]);
    }

    const arrRows = await loadAllJson();
    return arrRows.find((objRow) => objRow.userId === vUserId) || null;
}

export async function listRollingOptionsStrangleLiveProfiles(): Promise<RollingOptionsStrangleLiveProfileRecord[]> {
    if (isPostgresConfigured()) {
        const objPool = getPostgresPool();
        const objResult = await objPool.query<RollingOptionsStrangleLiveProfileRow>(`
            SELECT user_id, selected_api_profile_id, ui_state_json, connection_status_json, updated_at
            FROM optionyze_rolling_options_lt_de_profiles
            ORDER BY updated_at DESC
        `);
        return objResult.rows
            .map(mapRow)
            .filter((objRow): objRow is RollingOptionsStrangleLiveProfileRecord => Boolean(objRow));
    }

    return loadAllJson();
}

export async function saveRollingOptionsStrangleLiveProfile(
    pProfile: RollingOptionsStrangleLiveProfileRecord
): Promise<RollingOptionsStrangleLiveProfileRecord> {
    const objProfile: RollingOptionsStrangleLiveProfileRecord = {
        ...getDefaultRollingOptionsStrangleLiveProfile(pProfile.userId),
        ...pProfile,
        uiState: (pProfile.uiState ?? {}) as Record<string, unknown>,
        connectionStatus: {
            ...getDefaultConnectionStatus(),
            ...(pProfile.connectionStatus || {})
        },
        updatedAt: new Date().toISOString()
    };

    if (isPostgresConfigured()) {
        const objPool = getPostgresPool();
        await objPool.query(`
            INSERT INTO optionyze_rolling_options_lt_de_profiles (
                user_id,
                selected_api_profile_id,
                ui_state_json,
                connection_status_json,
                updated_at
            ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
            ON CONFLICT (user_id)
            DO UPDATE SET
                selected_api_profile_id = EXCLUDED.selected_api_profile_id,
                ui_state_json = EXCLUDED.ui_state_json,
                connection_status_json = EXCLUDED.connection_status_json,
                updated_at = EXCLUDED.updated_at
        `, [
            objProfile.userId,
            objProfile.selectedApiProfileId,
            JSON.stringify(objProfile.uiState || {}),
            JSON.stringify(objProfile.connectionStatus || getDefaultConnectionStatus()),
            objProfile.updatedAt
        ]);
        return objProfile;
    }

    const arrRows = await loadAllJson();
    const arrOther = arrRows.filter((objRow) => objRow.userId !== objProfile.userId);
    arrOther.push(objProfile);
    await writeJsonFileAtomic(gProfilesFile, arrOther);
    return objProfile;
}
