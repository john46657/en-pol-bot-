export declare function preMigrationBackup(migrationsDir: string, storageDir: string, log?: (m: string) => void): Promise<{
    file: string | null;
    reason: string;
}>;
