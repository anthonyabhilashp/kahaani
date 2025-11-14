/**
 * Central Font Configuration
 *
 * This is the single source of truth for all caption fonts.
 * When adding a new font:
 * 1. Add it to this list with proper metadata
 * 2. Run: node scripts/generate-font-install.js
 * 3. Copy the output to nixpacks.toml [phases.install] section
 * 4. The validation script will check if all fonts are configured
 */

export interface FontConfig {
  name: string;           // Display name in UI (e.g., "Open Sans")
  category: string;       // Font category for grouping
  systemFont: boolean;    // True if it's a system font (no download needed)
  fileName?: string;      // Font file name without spaces (e.g., "OpenSans")
  fontPath?: string;      // Path in Google Fonts repo (e.g., "apache/opensans")
}

export const CAPTION_FONTS: FontConfig[] = [
  // Sans-Serif fonts
  { name: "Montserrat", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Montserrat", fontPath: "ofl/montserrat" },
  { name: "Poppins", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Poppins", fontPath: "ofl/poppins" },
  { name: "Inter", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Inter", fontPath: "ofl/inter" },
  { name: "Roboto", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Roboto", fontPath: "apache/roboto" },
  { name: "Open Sans", category: "Sans-Serif (Modern)", systemFont: false, fileName: "OpenSans", fontPath: "apache/opensans" },
  { name: "Lato", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Lato", fontPath: "ofl/lato" },
  { name: "Raleway", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Raleway", fontPath: "ofl/raleway" },
  { name: "Nunito", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Nunito", fontPath: "ofl/nunito" },
  { name: "Source Sans Pro", category: "Sans-Serif (Modern)", systemFont: false, fileName: "SourceSansPro", fontPath: "ofl/sourcesanspro" },
  { name: "Oswald", category: "Sans-Serif (Modern)", systemFont: false, fileName: "Oswald", fontPath: "ofl/oswald" },
  { name: "Bebas Neue", category: "Sans-Serif (Modern)", systemFont: false, fileName: "BebasNeue", fontPath: "ofl/bebasneue" },
  { name: "Arial", category: "Sans-Serif (Modern)", systemFont: true },
  { name: "Helvetica", category: "Sans-Serif (Modern)", systemFont: true },
  { name: "Verdana", category: "Sans-Serif (Modern)", systemFont: true },

  // Serif fonts
  { name: "Playfair Display", category: "Serif (Classic)", systemFont: false, fileName: "PlayfairDisplay", fontPath: "ofl/playfairdisplay" },
  { name: "Merriweather", category: "Serif (Classic)", systemFont: false, fileName: "Merriweather", fontPath: "ofl/merriweather" },
  { name: "Lora", category: "Serif (Classic)", systemFont: false, fileName: "Lora", fontPath: "ofl/lora" },
  { name: "PT Serif", category: "Serif (Classic)", systemFont: false, fileName: "PTSerif", fontPath: "ofl/ptserif" },
  { name: "Times New Roman", category: "Serif (Classic)", systemFont: true },
  { name: "Georgia", category: "Serif (Classic)", systemFont: true },

  // Display & Handwriting fonts
  { name: "Bangers", category: "Display & Handwriting", systemFont: false, fileName: "Bangers", fontPath: "ofl/bangers" },
  { name: "Pacifico", category: "Display & Handwriting", systemFont: false, fileName: "Pacifico", fontPath: "ofl/pacifico" },
  { name: "Righteous", category: "Display & Handwriting", systemFont: false, fileName: "Righteous", fontPath: "ofl/righteous" },
  { name: "Lobster", category: "Display & Handwriting", systemFont: false, fileName: "Lobster", fontPath: "ofl/lobster" },
  { name: "Permanent Marker", category: "Display & Handwriting", systemFont: false, fileName: "PermanentMarker", fontPath: "apache/permanentmarker" },
  { name: "Dancing Script", category: "Display & Handwriting", systemFont: false, fileName: "DancingScript", fontPath: "ofl/dancingscript" },

  // Monospace fonts
  { name: "Courier New", category: "Monospace", systemFont: true },
  { name: "Roboto Mono", category: "Monospace", systemFont: false, fileName: "RobotoMono", fontPath: "apache/robotomono" },
  { name: "Source Code Pro", category: "Monospace", systemFont: false, fileName: "SourceCodePro", fontPath: "ofl/sourcecodepro" },
];

/**
 * Get fonts grouped by category for UI display
 */
export function getFontsByCategory() {
  const categories = new Map<string, FontConfig[]>();

  CAPTION_FONTS.forEach(font => {
    if (!categories.has(font.category)) {
      categories.set(font.category, []);
    }
    categories.get(font.category)!.push(font);
  });

  return categories;
}

/**
 * Get only fonts that need to be downloaded (non-system fonts)
 */
export function getDownloadableFonts() {
  return CAPTION_FONTS.filter(font => !font.systemFont);
}
