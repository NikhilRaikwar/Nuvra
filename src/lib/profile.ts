import { useEffect, useState } from "react";

export type TargetRole =
  | "AI Engineer"
  | "FDE"
  | "Full Stack"
  | "Frontend"
  | "Backend"
  | "Web3"
  | "DevRel"
  | "Product Engineer";

export const TARGET_ROLES: TargetRole[] = [
  "AI Engineer",
  "FDE",
  "Full Stack",
  "Frontend",
  "Backend",
  "Web3",
  "DevRel",
  "Product Engineer",
];

export interface Profile {
  identity: string;
  githubUrl: string;
  portfolioUrl: string;
  resumeText: string;
  targetRoles: TargetRole[];
}

export const EMPTY_PROFILE: Profile = {
  identity: "",
  githubUrl: "",
  portfolioUrl: "",
  resumeText: "",
  targetRoles: [],
};

const KEY = "nuvra.profile.v1";
const LEGACY_KEYS = ["proofrun.profile.v1"];

function parseProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  const current = parseProfile(window.localStorage.getItem(KEY));
  if (current) return current;

  for (const legacyKey of LEGACY_KEYS) {
    const legacy = parseProfile(window.localStorage.getItem(legacyKey));
    if (legacy) {
      window.localStorage.setItem(KEY, JSON.stringify(legacy));
      window.localStorage.removeItem(legacyKey);
      return legacy;
    }
  }

  return EMPTY_PROFILE;
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function profileIsReady(p: Profile): boolean {
  return (
    (p.resumeText.trim().length > 30 || p.githubUrl.trim().length > 5) && p.targetRoles.length > 0
  );
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHydrated(true);
  }, []);

  const update = (patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      saveProfile(next);
      return next;
    });
  };

  return { profile, update, hydrated, ready: profileIsReady(profile) };
}

export function profileHash(p: Profile): string {
  const s = JSON.stringify({
    g: p.githubUrl,
    p: p.portfolioUrl,
    r: p.resumeText.slice(0, 400),
    t: [...p.targetRoles].sort(),
  });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}
