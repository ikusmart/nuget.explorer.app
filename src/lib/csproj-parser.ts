/** Parsed package reference from .csproj */
export interface ParsedPackageReference {
  packageId: string;
  version?: string;
}

/** Parse .csproj file content and extract PackageReference elements */
export function parseCsproj(xmlContent: string): ParsedPackageReference[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, "text/xml");

  // Check for parsing errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    console.error("XML parsing error:", parseError.textContent);
    return [];
  }

  const packages: ParsedPackageReference[] = [];
  const packageRefs = doc.querySelectorAll("PackageReference");

  packageRefs.forEach((ref) => {
    const packageId = ref.getAttribute("Include");
    if (!packageId) return;

    // Version can be either an attribute or a child element
    let version: string | undefined = ref.getAttribute("Version") || undefined;

    if (!version) {
      const versionElement = ref.querySelector("Version");
      version = versionElement?.textContent || undefined;
    }

    packages.push({
      packageId,
      version,
    });
  });

  return packages;
}

/** Read .csproj file and parse it */
export async function readCsprojFile(
  file: File,
): Promise<ParsedPackageReference[]> {
  try {
    const content = await file.text();
    return parseCsproj(content);
  } catch (error) {
    console.error("Failed to read .csproj file:", error);
    return [];
  }
}

/** Validate if file is a .csproj file */
export function isCsprojFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csproj");
}
