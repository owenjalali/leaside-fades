import { put } from "@vercel/blob";

export interface TeamProfileImageStorage {
    uploadProfileImage(input: {
        filename: string;
        contentType: string;
        sizeBytes: number;
        body: Buffer;
    }): Promise<{ url: string; pathname: string }>;
}

export class TeamProfileImageUploadError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "TeamProfileImageUploadError";
        this.status = status;
    }
}

export const TEAM_PROFILE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const TEAM_PROFILE_IMAGE_CONTENT_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

export function createTeamProfileImageStorage(): TeamProfileImageStorage {
    if (process.env.TEAM_PROFILE_IMAGE_UPLOAD_MODE === "mock" && process.env.NODE_ENV !== "production") {
        return createMockTeamProfileImageStorage();
    }

    return createVercelBlobTeamProfileImageStorage();
}

export function createVercelBlobTeamProfileImageStorage(): TeamProfileImageStorage {
    return {
        async uploadProfileImage(input) {
            if (process.env.NODE_ENV === "production" && !process.env.BLOB_READ_WRITE_TOKEN) {
                throw new TeamProfileImageUploadError(500, "BLOB_READ_WRITE_TOKEN is required for profile image uploads.");
            }

            const safeFilename = sanitizeProfileImageFilename(input.filename, input.contentType);
            const blob = await put(`barber-profiles/${safeFilename}`, input.body, {
                access: "public",
                addRandomSuffix: true,
                contentType: input.contentType,
            });

            return {
                url: blob.url,
                pathname: blob.pathname,
            };
        },
    };
}

function createMockTeamProfileImageStorage(): TeamProfileImageStorage {
    return {
        async uploadProfileImage(input) {
            const safeFilename = sanitizeProfileImageFilename(input.filename, input.contentType);

            return {
                url: `https://blob.example/barbers/${safeFilename}`,
                pathname: `barbers/${safeFilename}`,
            };
        },
    };
}

export function sanitizeProfileImageFilename(filename: string, contentType: string) {
    const extension = CONTENT_TYPE_EXTENSIONS[contentType] ?? "jpg";
    const baseName = filename
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);

    return `${baseName || "profile-image"}.${extension}`;
}
