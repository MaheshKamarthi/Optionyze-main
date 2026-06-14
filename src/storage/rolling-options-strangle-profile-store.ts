import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "./json-store";
import { getPostgresPool, isPostgresConfigured } from "./postgres";

export interface RollingOptionsStrangleProfileRecord {
    userId: string;
    uiState: Record<string, unknown>;
    updatedAt: string;
}

interface RollingOptionsStrangleProfileRow {
    user_id: string;
    ui_state: Record<string, unknown> | null;
    updated_at: string | Date;
}

const gProfilesFile = path.resolve(process.cwd(), "data", "rolling-options-strangle", "profiles.json");
let gJsonProfileWriteChain: Promise<void> = Promise.resolve();

async function runSerializedJsonProfileWrite<T>(pOperation: () => Promise<T>): Promise<T> {
    const objPreviousWrite = gJsonProfileWriteChain.catch(() => undefined);
    let fnRelease: () => void = () => undefined;
    gJsonProfileWriteChain = new Promise<void>((resolve) => {
        fnRelease = resolve;
    });
    await objPreviousWrite;
    try {
        return await pOperation();
    }
    finally {
        fnRelease();
    }
}

async function loadAllProfilesJson(): Promise<RollingOptionsStrangleProfileRecord[]> {
    return readJsonFile<RollingOptionsStrangleProfileRecord[]>(gProfilesFile, []);
}

export async function loadRollingOptionsStrangleProfile(
    pUserId: string
): Promise<RollingOptionsStrangleProfileRecord | null> {
    if (isPostgresConfigured()) {
        const objPool = getPostgresPool();
        const objResult = await objPool.query<RollingOptionsStrangleProfileRow>(`
            SELECT
                user_id,
                ui_state,
                updated_at
            FROM optionyze_rolling_options_strangle_profiles
            WHERE user_id = $1
        `, [pUserId]);

        const objRow = objResult.rows[0];
        if (!objRow) {
            return null;
        }

        return {
            userId: String(objRow.user_id),
            uiState: (objRow.ui_state ?? {}) as Record<string, unknown>,
            updatedAt: new Date(objRow.updated_at).toISOString()
        };
    }

    const objProfiles = await loadAllProfilesJson();
    return objProfiles.find((objProfile) => objProfile.userId === pUserId) || null;
}

export async function saveRollingOptionsStrangleProfile(
    pProfile: RollingOptionsStrangleProfileRecord
): Promise<RollingOptionsStrangleProfileRecord> {
    const objProfile: RollingOptionsStrangleProfileRecord = {
        ...pProfile,
        updatedAt: new Date().toISOString()
    };

    if (isPostgresConfigured()) {
        const objPool = getPostgresPool();
        await objPool.query(`
            INSERT INTO optionyze_rolling_options_strangle_profiles (
                user_id,
                ui_state,
                updated_at
            ) VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (user_id)
            DO UPDATE SET
                ui_state = EXCLUDED.ui_state,
                updated_at = EXCLUDED.updated_at
        `, [
            objProfile.userId,
            JSON.stringify(objProfile.uiState || {}),
            objProfile.updatedAt
        ]);

        return objProfile;
    }

    return runSerializedJsonProfileWrite(async () => {
        const objProfiles = await loadAllProfilesJson();
        const objOtherProfiles = objProfiles.filter((objRow) => objRow.userId !== objProfile.userId);
        objOtherProfiles.push(objProfile);
        await writeJsonFileAtomic(gProfilesFile, objOtherProfiles);
        return objProfile;
    });
}

export async function patchRollingOptionsStrangleProfileUiState(
    pUserId: string,
    pUiStatePatch: Record<string, unknown>
): Promise<RollingOptionsStrangleProfileRecord> {
    const vUpdatedAt = new Date().toISOString();

    if (isPostgresConfigured()) {
        const objPool = getPostgresPool();
        const objResult = await objPool.query<RollingOptionsStrangleProfileRow>(`
            INSERT INTO optionyze_rolling_options_strangle_profiles (
                user_id,
                ui_state,
                updated_at
            ) VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (user_id)
            DO UPDATE SET
                ui_state = COALESCE(optionyze_rolling_options_strangle_profiles.ui_state, '{}'::jsonb)
                    || EXCLUDED.ui_state,
                updated_at = EXCLUDED.updated_at
            RETURNING user_id, ui_state, updated_at
        `, [pUserId, JSON.stringify(pUiStatePatch || {}), vUpdatedAt]);
        const objRow = objResult.rows[0];
        return {
            userId: String(objRow.user_id),
            uiState: (objRow.ui_state ?? {}) as Record<string, unknown>,
            updatedAt: new Date(objRow.updated_at).toISOString()
        };
    }

    return runSerializedJsonProfileWrite(async () => {
        const objProfiles = await loadAllProfilesJson();
        const objExisting = objProfiles.find((objProfile) => objProfile.userId === pUserId);
        const objProfile: RollingOptionsStrangleProfileRecord = {
            userId: pUserId,
            uiState: {
                ...(objExisting?.uiState || {}),
                ...(pUiStatePatch || {})
            },
            updatedAt: vUpdatedAt
        };
        const objOtherProfiles = objProfiles.filter((objRow) => objRow.userId !== pUserId);
        objOtherProfiles.push(objProfile);
        await writeJsonFileAtomic(gProfilesFile, objOtherProfiles);
        return objProfile;
    });
}

export type RollingOptionsPtDeProfileRecord = RollingOptionsStrangleProfileRecord;

export async function loadRollingOptionsPtDeProfile(pUserId: string): Promise<RollingOptionsPtDeProfileRecord | null> {
    return loadRollingOptionsStrangleProfile(pUserId);
}

export async function saveRollingOptionsPtDeProfile(pProfile: RollingOptionsPtDeProfileRecord): Promise<RollingOptionsPtDeProfileRecord> {
    return saveRollingOptionsStrangleProfile(pProfile);
}

export async function patchRollingOptionsPtDeProfileUiState(
    pUserId: string,
    pUiStatePatch: Record<string, unknown>
): Promise<RollingOptionsPtDeProfileRecord> {
    return patchRollingOptionsStrangleProfileUiState(pUserId, pUiStatePatch);
}
