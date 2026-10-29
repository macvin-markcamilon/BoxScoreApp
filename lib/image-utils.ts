"use client";

import { generateUUID } from "@/lib/uuid";
import {
  AssistantCoachMember,
  LeagueReferee,
  PlayerPosition,
  RefereeRole,
  RosterPlayer,
} from "@/types/boxscore";

/**
 * Compresses and resizes an uploaded image file using an offscreen HTML5 Canvas
 * so it can be reliably saved in Supabase JSONB/text columns, localStorage, and IndexedDB
 * without hitting payload or quota limits.
 */
export async function compressImageFile(
  file: File,
  maxDimension = 500,
  quality = 0.85,
  forceSquare = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      // If SVG, return directly if small
      if (file.type === "image/svg+xml" && rawDataUrl.length < 60_000) {
        resolve(rawDataUrl);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        if (forceSquare) {
          // Crop center horizontally, top-aligned vertically to preserve face
          const side = Math.min(origWidth, origHeight);
          const srcX = Math.round((origWidth - side) / 2);
          const srcY = 0;
          const targetDim = Math.min(maxDimension, side);

          canvas.width = targetDim;
          canvas.height = targetDim;
          ctx.drawImage(img, srcX, srcY, side, side, 0, 0, targetDim, targetDim);
        } else {
          let width = origWidth || maxDimension;
          let height = origHeight || maxDimension;

          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        // Try WebP first for smallest size + alpha transparency support, fallback to PNG/JPEG
        let compressed = canvas.toDataURL("image/webp", quality);
        if (
          !compressed ||
          compressed === "data:," ||
          compressed.length > rawDataUrl.length
        ) {
          compressed = canvas.toDataURL("image/png");
        }
        resolve(compressed);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Generates a broadcast-grade SVG portrait badge DataURL for Coaching Staff & Roster Players
 * when using the Auto-Populate generator.
 */
export function generatePortraitAvatarDataUrl(options: {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  badgeText?: string;
  roleLabel?: string;
}): string {
  const {
    name,
    primaryColor = "#8B0D0E",
    secondaryColor = "#0B2F5C",
    badgeText = "",
    roleLabel = "",
  } = options;

  const initials =
    name
      .replace(/^Coach\s+/i, "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "BS";

  const safePrimary = primaryColor.startsWith("#") ? primaryColor : "#8B0D0E";
  const safeSecondary = secondaryColor.startsWith("#")
    ? secondaryColor
    : "#0B2F5C";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${safePrimary}" />
        <stop offset="100%" stop-color="${safeSecondary}" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="22" fill="url(#bg)" />
    <circle cx="60" cy="44" r="21" fill="rgba(255,255,255,0.22)" />
    <path d="M22 112 C22 84, 98 84, 98 112" fill="rgba(255,255,255,0.22)" />
    <text x="60" y="52" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-weight="900" font-size="22">${initials}</text>
    ${
      badgeText
        ? `<rect x="8" y="8" width="40" height="22" rx="6" fill="rgba(2,6,23,0.78)" />
           <text x="28" y="23" text-anchor="middle" fill="#FACC15" font-family="sans-serif" font-weight="900" font-size="12">${badgeText}</text>`
        : ""
    }
    ${
      roleLabel
        ? `<rect x="14" y="92" width="92" height="20" rx="6" fill="rgba(2,6,23,0.75)" />
           <text x="60" y="106" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-weight="800" font-size="10" letter-spacing="0.5">${roleLabel}</text>`
        : ""
    }
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const RANDOM_FIRST_NAMES = [
  "Marcus",
  "Xavier",
  "Lorenzo",
  "Mateo",
  "Dante",
  "Gabriel",
  "Rafael",
  "Julian",
  "Dominic",
  "Enzo",
  "Lucas",
  "Sebastian",
  "Adrian",
  "Caleb",
  "Elijah",
  "Isaiah",
  "Kendrick",
  "Donovan",
  "Jalen",
  "Devin",
  "Tyrese",
  "Malik",
  "Desmond",
  "Trey",
  "Kobe",
  "Damian",
  "Kyrie",
  "Anthony",
  "Brandon",
  "Zachary",
  "Christian",
  "Miguel",
  "Joaquin",
  "Andres",
  "Diego",
  "Carlos",
  "Marco",
  "Paolo",
  "Nico",
  "Vince",
  "Tristan",
  "lance",
  "Cedric",
  "Jericho",
  "Kenji",
  "Rocco",
  "Maverick",
  "Zayden",
  "Kian",
  "Anton",
  "Harvey",
  "Royce",
].map((n) => n.charAt(0).toUpperCase() + n.slice(1));

const RANDOM_LAST_NAMES = [
  "Villanueva",
  "Dela Cruz",
  "Mendoza",
  "Tolentino",
  "Navarro",
  "Salazar",
  "Soriano",
  "Mercado",
  "Bautista",
  "Aguilar",
  "Velasco",
  "Castillo",
  "Reyes",
  "Morales",
  "Santiago",
  "Pascual",
  "Evangelista",
  "Ocampo",
  "De Guzman",
  "Hernandez",
  "Valdez",
  "Rivera",
  "Ramos",
  "Aquino",
  "Gonzales",
  "Dizon",
  "Manalo",
  "Alonzo",
  "Vergara",
  "Gatchalian",
  "Montemayor",
  "Sandoval",
  "Zamora",
  "Ilagan",
  "Dimaculangan",
  "Concepcion",
  "Policarpio",
  "Macapagal",
  "Fajardo",
  "Quiambao",
  "Malonzo",
  "Cagulangan",
  "Abarrientos",
  "Belangel",
  "Cortez",
  "Heading",
  "Newsome",
  "Baltazar",
  "Padrigao",
  "Abadiano",
  "Alarcon",
  "Tamayo",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUniqueRandomFullName(usedNames: Set<string>): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  for (let attempt = 0; attempt < 100; attempt++) {
    const firstName = pickRandom(RANDOM_FIRST_NAMES);
    const lastName = pickRandom(RANDOM_LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    if (!usedNames.has(fullName)) {
      usedNames.add(fullName);
      return { firstName, lastName, fullName };
    }
  }
  const fallbackFirst = pickRandom(RANDOM_FIRST_NAMES);
  const fallbackLast = `${pickRandom(RANDOM_LAST_NAMES)}-${Math.floor(10 + Math.random() * 89)}`;
  const fullName = `${fallbackFirst} ${fallbackLast}`;
  usedNames.add(fullName);
  return { firstName: fallbackFirst, lastName: fallbackLast, fullName };
}

/**
 * Generates a completely random Coaching Staff (Head Coach, Team Manager, and 2-3 Assistant Coaches)
 * with custom portrait avatars every time it is called.
 */
export function generateRandomCoachingStaff(options: {
  primaryColor: string;
  secondaryColor: string;
}): {
  headCoach: string;
  headCoachImageUrl: string;
  teamManager: string;
  managerImageUrl: string;
  assistantCoachStaff: AssistantCoachMember[];
} {
  const { primaryColor, secondaryColor } = options;
  const usedNames = new Set<string>();

  const hc = generateUniqueRandomFullName(usedNames);
  const headCoach = `Coach ${hc.fullName}`;
  const headCoachImageUrl = generatePortraitAvatarDataUrl({
    name: headCoach,
    primaryColor,
    secondaryColor,
    roleLabel: "HEAD COACH",
  });

  const mgr = generateUniqueRandomFullName(usedNames);
  const teamManager = mgr.fullName;
  const managerImageUrl = generatePortraitAvatarDataUrl({
    name: teamManager,
    primaryColor: secondaryColor,
    secondaryColor: primaryColor,
    roleLabel: "MANAGER",
  });

  const assistantCount = Math.random() > 0.45 ? 2 : 3;
  const assistantCoachStaff: AssistantCoachMember[] = [];
  for (let i = 0; i < assistantCount; i++) {
    const ac = generateUniqueRandomFullName(usedNames);
    const acName = `Coach ${ac.fullName}`;
    assistantCoachStaff.push({
      id: generateUUID(),
      name: acName,
      imageUrl: generatePortraitAvatarDataUrl({
        name: acName,
        primaryColor: i % 2 === 0 ? primaryColor : secondaryColor,
        secondaryColor: i % 2 === 0 ? secondaryColor : primaryColor,
        roleLabel: "ASST COACH",
      }),
    });
  }

  return {
    headCoach,
    headCoachImageUrl,
    teamManager,
    managerImageUrl,
    assistantCoachStaff,
  };
}

/**
 * Generates a completely random 12-man basketball roster with unique random names,
 * unique jersey numbers, balanced positions (PG, SG, SF, PF, C), Captain Ball, and portrait avatars.
 */
export function generateRandomTeamRoster(options: {
  primaryColor: string;
  secondaryColor: string;
  playerCount?: number;
}): {
  roster: RosterPlayer[];
  captainId: string | null;
} {
  const { primaryColor, secondaryColor, playerCount = 12 } = options;
  const usedNames = new Set<string>();
  const usedJerseys = new Set<number>();

  const commonJerseys = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 20, 21, 22,
    23, 24, 25, 27, 30, 31, 32, 33, 34, 35, 42, 44, 55, 77, 88, 99,
  ];

  const pickUniqueJersey = (): number => {
    const availableCommon = commonJerseys.filter((n) => !usedJerseys.has(n));
    if (availableCommon.length > 0) {
      const chosen = pickRandom(availableCommon);
      usedJerseys.add(chosen);
      return chosen;
    }
    for (let n = 0; n <= 99; n++) {
      if (!usedJerseys.has(n)) {
        usedJerseys.add(n);
        return n;
      }
    }
    return Math.floor(Math.random() * 100);
  };

  // Balanced 12-man positional distribution: 2x PG, 3x SG, 3x SF, 2x PF, 2x C
  const positionDistribution: PlayerPosition[] = [
    "PG",
    "SG",
    "SF",
    "PF",
    "C",
    "PG",
    "SG",
    "SF",
    "PF",
    "C",
    "SG",
    "SF",
  ];

  const captainIdx = Math.floor(Math.random() * Math.min(5, playerCount));
  const roster: RosterPlayer[] = [];

  for (let i = 0; i < playerCount; i++) {
    const { firstName, lastName, fullName } =
      generateUniqueRandomFullName(usedNames);
    const jerseyNumber = pickUniqueJersey();
    const position = positionDistribution[i % positionDistribution.length];
    const isCaptain = i === captainIdx;

    roster.push({
      id: generateUUID(),
      firstName,
      lastName,
      jerseyNumber,
      position,
      isCaptain,
      imageUrl: generatePortraitAvatarDataUrl({
        name: fullName,
        primaryColor: i % 2 === 0 ? primaryColor : secondaryColor,
        secondaryColor: i % 2 === 0 ? secondaryColor : primaryColor,
        badgeText: `#${jerseyNumber}`,
        roleLabel: position,
      }),
    });
  }

  const captainId = roster[captainIdx]?.id ?? roster[0]?.id ?? null;
  return { roster, captainId };
}

/**
 * Generates a random officiating referee crew (Crew Chief, Umpire 1, Umpire 2, Table Commissioner)
 * with unique random names, official jersey numbers, accreditation badges, and portrait avatars.
 */
export function generateRandomRefereeCrew(leagueId: string): LeagueReferee[] {
  const usedNames = new Set<string>();
  const roles: {
    role: RefereeRole;
    accreditation: string;
    primary: string;
    secondary: string;
  }[] = [
    {
      role: "Crew Chief",
      accreditation: "FIBA Black License • Crew Chief",
      primary: "#0f172a",
      secondary: "#8B0D0E",
    },
    {
      role: "Umpire 1",
      accreditation: "National Class A Official",
      primary: "#0B2F5C",
      secondary: "#1e293b",
    },
    {
      role: "Umpire 2",
      accreditation: "National Class A Official",
      primary: "#1e293b",
      secondary: "#0B2F5C",
    },
    {
      role: "Table Commissioner",
      accreditation: "Official Scorebook & Shot Clock Commissioner",
      primary: "#8B0D0E",
      secondary: "#0B2F5C",
    },
  ];

  const refNumbers = [14, 27, 45, 58, 62, 71, 84, 91];
  const usedNums = new Set<number>();

  return roles.map((item, idx) => {
    const { fullName } = generateUniqueRandomFullName(usedNames);
    const available = refNumbers.filter((n) => !usedNums.has(n));
    const chosenNum =
      available.length > 0 ? pickRandom(available) : 10 + idx * 12;
    usedNums.add(chosenNum);
    const refName = `Ref. ${fullName}`;

    return {
      id: generateUUID(),
      leagueId,
      name: refName,
      role: item.role,
      accreditation: item.accreditation,
      jerseyNumber: chosenNum,
      imageUrl: generatePortraitAvatarDataUrl({
        name: fullName,
        primaryColor: item.primary,
        secondaryColor: item.secondary,
        badgeText: `#${chosenNum}`,
        roleLabel: item.role.toUpperCase().slice(0, 10),
      }),
    };
  });
}

/**
 * Parses CSV or JSON text for bulk team uploading.
 * Supports flexible column formats:
 * - CSV: "Team Name, Primary Color, Secondary Color, Head Coach, Manager, Category"
 *   or with players: "Team Name, Head Coach, Manager, Players"
 * - JSON: array of team objects: [{ name, primaryColor, secondaryColor, headCoach, manager, categoryName, roster }]
 */
export function parseBulkTeamsInput(
  rawText: string,
  leagueId: string
): Array<{
  leagueId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  headCoach: string;
  headCoachImageUrl?: string;
  assistantCoaches: string[];
  manager: string;
  managerImageUrl?: string;
  captainPlayerId: string | null;
  categoryName?: string;
  imageUrl: string;
  roster: RosterPlayer[];
}> {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Try parsing JSON first
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => {
          const name = String(item.name || item.teamName || `Team ${idx + 1}`).trim();
          const primaryColor = item.primaryColor || "#8B0D0E";
          const secondaryColor = item.secondaryColor || "#0B2F5C";
          const headCoach = String(item.headCoach || item.coach || `Coach ${name.split(" ")[0]}`).trim();
          const headCoachImageUrl = typeof item.headCoachImageUrl === "string" ? item.headCoachImageUrl : "";
          const manager = String(item.manager || `Mgr. ${name.split(" ")[0]}`).trim();
          const managerImageUrl = typeof item.managerImageUrl === "string" ? item.managerImageUrl : "";
          const categoryName = item.category || item.categoryName || undefined;
          const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl : "";

          let roster: RosterPlayer[] = [];
          if (Array.isArray(item.roster) && item.roster.length > 0) {
            roster = item.roster.map((p: Record<string, unknown>, pIdx: number) => ({
              id: generateUUID(),
              firstName: String(p.firstName || `Player`).trim(),
              lastName: String(p.lastName || `${pIdx + 1}`).trim(),
              jerseyNumber: Number(p.jerseyNumber) || (pIdx + 1),
              position: (p.position as PlayerPosition) || "SG",
              isCaptain: Boolean(p.isCaptain || pIdx === 0),
              imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : "",
            }));
          } else {
            // Auto-generate standard 12-man roster if none provided
            roster = generateRandomTeamRoster({
              primaryColor,
              secondaryColor,
              playerCount: 10,
            }).roster;
          }

          return {
            leagueId,
            name,
            primaryColor,
            secondaryColor,
            headCoach,
            headCoachImageUrl,
            assistantCoaches: Array.isArray(item.assistantCoaches) ? item.assistantCoaches : [],
            manager,
            managerImageUrl,
            categoryName,
            captainPlayerId: roster[0]?.id ?? null,
            imageUrl,
            roster,
          };
        });
      }
    } catch {
      // Fall through to CSV
    }
  }

  // 2. Parse CSV lines
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: ReturnType<typeof parseBulkTeamsInput> = [];

  // Common preset sports color palettes for auto-coloring teams if omitted
  const colorPalettes = [
    { pri: "#8B0D0E", sec: "#0B2F5C" },
    { pri: "#0B2F5C", sec: "#D97706" },
    { pri: "#059669", sec: "#0F172A" },
    { pri: "#7C3AED", sec: "#F59E0B" },
    { pri: "#EA580C", sec: "#1E293B" },
    { pri: "#0284C7", sec: "#BE123C" },
    { pri: "#16A34A", sec: "#FACC15" },
    { pri: "#4F46E5", sec: "#FB7185" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip CSV header if first row contains "team" or "name"
    if (i === 0 && (line.toLowerCase().includes("team name") || line.toLowerCase().includes("team,") || line.toLowerCase().startsWith("name,"))) {
      continue;
    }

    // Split CSV columns (supporting simple commas or semicolon)
    const cols = (line.includes(";") ? line.split(";") : line.split(",")).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    if (cols.length === 0 || !cols[0]) continue;

    const teamName = cols[0];
    const palette = colorPalettes[result.length % colorPalettes.length];
    const primaryColor = cols[1] && cols[1].startsWith("#") ? cols[1] : palette.pri;
    const secondaryColor = cols[2] && cols[2].startsWith("#") ? cols[2] : palette.sec;

    // Remaining columns: Head Coach, Manager, Category
    const headCoach = (cols[1] && !cols[1].startsWith("#") ? cols[1] : cols[3]) || `Coach ${teamName.split(" ")[0]}`;
    const manager = (cols[2] && !cols[2].startsWith("#") ? cols[2] : cols[4]) || `Mgr. ${teamName.split(" ")[0]}`;
    const categoryName = cols[5] || (cols[3] && !cols[3].startsWith("#") && cols.length === 4 ? cols[3] : undefined);

    // Standard format: Team Name, Primary Color, Secondary Color, Head Coach, Manager, Category, Team Logo URL, Coach Photo URL, Manager Photo URL
    // If cols has image URLs:
    const teamLogoUrl = cols[6] || "";
    const coachPhotoUrl = cols[7] || "";
    const managerPhotoUrl = cols[8] || "";

    const { roster } = generateRandomTeamRoster({
      primaryColor,
      secondaryColor,
      playerCount: 10,
    });

    result.push({
      leagueId,
      name: teamName,
      primaryColor,
      secondaryColor,
      headCoach,
      headCoachImageUrl: coachPhotoUrl,
      assistantCoaches: [],
      manager,
      managerImageUrl: managerPhotoUrl,
      categoryName,
      captainPlayerId: roster[0]?.id ?? null,
      imageUrl: teamLogoUrl,
      roster,
    });
  }

  return result;
}

/**
 * Parses CSV or JSON text for bulk player uploading to an existing team.
 * Supported formats:
 * - CSV: "First Name, Last Name, Jersey Number, Position, Is Captain (true/false), Image URL"
 * - JSON: [{ firstName, lastName, jerseyNumber, position, isCaptain, imageUrl }]
 */
export function parseBulkPlayersInput(
  rawText: string,
  primaryColor = "#8B0D0E",
  secondaryColor = "#0B2F5C"
): RosterPlayer[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const validPositions = new Set<PlayerPosition>(["PG", "SG", "SF", "PF", "C"]);

  // 1. Try JSON
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => {
          const firstName = String(item.firstName || item.first_name || "Player").trim();
          const lastName = String(item.lastName || item.last_name || `${idx + 1}`).trim();
          const jerseyNumber = Number(item.jerseyNumber ?? item.jersey_number ?? item.jersey ?? idx + 1);
          const rawPos = String(item.position || "SG").toUpperCase().trim() as PlayerPosition;
          const position: PlayerPosition = validPositions.has(rawPos) ? rawPos : "SG";
          const isCaptain = Boolean(item.isCaptain ?? item.is_captain ?? item.captain);
          const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl : typeof item.image_url === "string" ? item.image_url : "";

          return {
            id: generateUUID(),
            firstName,
            lastName,
            jerseyNumber: isNaN(jerseyNumber) ? idx + 1 : jerseyNumber,
            position,
            isCaptain,
            imageUrl: imageUrl || generatePortraitAvatarDataUrl({
              name: `${firstName} ${lastName}`,
              primaryColor,
              secondaryColor,
              badgeText: `#${jerseyNumber}`,
              roleLabel: position,
            }),
          };
        });
      }
    } catch {
      // Fall through to CSV
    }
  }

  // 2. CSV parsing
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: RosterPlayer[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header row
    if (i === 0 && (line.toLowerCase().includes("first name") || line.toLowerCase().includes("player") || line.toLowerCase().startsWith("name,"))) {
      continue;
    }

    const cols = (line.includes(";") ? line.split(";") : line.split(",")).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    if (cols.length === 0 || !cols[0]) continue;

    // Supports:
    // Format A: First Name, Last Name, Jersey, Position, Is Captain, Image URL
    // Format B: Full Name, Jersey, Position, Is Captain, Image URL
    let firstName = "Player";
    let lastName = `${i + 1}`;
    let jerseyNum = i + 1;
    let posStr = "SG";
    let isCap = false;
    let imgUrl = "";

    if (cols.length >= 4 && isNaN(Number(cols[1])) && !validPositions.has(cols[1].toUpperCase() as PlayerPosition)) {
      // Format A: First Name, Last Name, Jersey, Position, ...
      firstName = cols[0];
      lastName = cols[1];
      jerseyNum = Number(cols[2]) || (i + 1);
      posStr = cols[3]?.toUpperCase() || "SG";
      isCap = cols[4] ? ["true", "yes", "1", "captain"].includes(cols[4].toLowerCase()) : false;
      imgUrl = cols[5] || "";
    } else {
      // Format B: Full Name (cols[0]), Jersey (cols[1]), Position (cols[2]), ...
      const nameParts = cols[0].split(" ");
      firstName = nameParts[0] || "Player";
      lastName = nameParts.slice(1).join(" ") || `${i + 1}`;
      jerseyNum = Number(cols[1]) || (i + 1);
      posStr = cols[2]?.toUpperCase() || "SG";
      isCap = cols[3] ? ["true", "yes", "1", "captain"].includes(cols[3].toLowerCase()) : false;
      imgUrl = cols[4] || "";
    }

    const position: PlayerPosition = validPositions.has(posStr as PlayerPosition) ? (posStr as PlayerPosition) : "SG";

    result.push({
      id: generateUUID(),
      firstName,
      lastName,
      jerseyNumber: jerseyNum,
      position,
      isCaptain: isCap,
      imageUrl: imgUrl || generatePortraitAvatarDataUrl({
        name: `${firstName} ${lastName}`,
        primaryColor,
        secondaryColor,
        badgeText: `#${jerseyNum}`,
        roleLabel: position,
      }),
    });
  }

  return result;
}
