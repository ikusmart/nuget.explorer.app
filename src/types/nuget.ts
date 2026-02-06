/** NuGet V3 API Types */

/** Service index resource */
export interface ServiceResource {
  '@id': string
  '@type': string
  comment?: string
}

/** Service index response */
export interface ServiceIndex {
  version: string
  resources: ServiceResource[]
}

/** Search result item */
export interface SearchResult {
  id: string
  version: string
  description?: string
  summary?: string
  title?: string
  iconUrl?: string
  authors?: string[]
  totalDownloads?: number
  verified?: boolean
  versions?: { version: string; downloads: number }[]
}

/** Search response */
export interface SearchResponse {
  totalHits: number
  data: SearchResult[]
}

/** Package versions response */
export interface VersionsResponse {
  versions: string[]
}

/** Dependency */
export interface Dependency {
  id: string
  range?: string
}

/** Dependency group */
export interface DependencyGroup {
  targetFramework?: string
  dependencies?: Dependency[]
}

/** Package details from registration */
export interface PackageDetails {
  id: string
  version: string
  description?: string
  summary?: string
  title?: string
  iconUrl?: string
  projectUrl?: string
  licenseUrl?: string
  authors?: string[]
  dependencyGroups?: DependencyGroup[]
}

/** Registration catalog entry */
export interface CatalogEntry {
  id: string
  version: string
  description?: string
  summary?: string
  title?: string
  iconUrl?: string
  projectUrl?: string
  licenseUrl?: string
  authors?: string
  dependencyGroups?: DependencyGroup[]
}

/** Registration leaf response */
export interface RegistrationLeaf {
  catalogEntry: CatalogEntry
  packageContent: string
}

/** Flattened dependency (for display) */
export interface FlatDependency {
  id: string
  versionRange?: string
  targetFramework?: string
}
