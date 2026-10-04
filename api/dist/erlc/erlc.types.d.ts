/** Rohformen exakt wie in der ER:LC-Doku (https://apidocs.erlc.gg) beschrieben. */
export interface RawServer {
    Name: string;
    OwnerId: number;
    CoOwnerIds: number[];
    CurrentPlayers: number;
    MaxPlayers: number;
    JoinKey: string;
    AccVerifiedReq: string;
    TeamBalance: boolean;
}
export interface RawPlayer {
    Player: string;
    Permission: string;
    Callsign: string | null;
    Team: string;
}
export interface RawVehicle {
    Name: string;
    Owner: string;
    Texture: string | null;
}
export type Capability = 'SERVER' | 'PLAYERS' | 'VEHICLES' | 'PLAYER_POSITIONS' | 'EMERGENCY_CALLS';
export declare const CAPABILITY_MESSAGE = "ER:LC capability unavailable. The configured integration does not currently provide this functionality.";
export interface NormalizedPlayer {
    name: string;
    robloxUserId: string | null;
    permission: string;
    team: string;
    callsign: string | null;
}
/** "Name:Id" → getrennt. Ungültige Formate ergeben robloxUserId=null (keine Identität wird geraten). */
export declare function normalizePlayer(p: RawPlayer): NormalizedPlayer;
export interface NormalizedVehicle {
    model: string;
    owner: string;
    texture: string | null;
}
export declare const normalizeVehicle: (v: RawVehicle) => NormalizedVehicle;
