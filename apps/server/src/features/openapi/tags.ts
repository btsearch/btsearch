export type DocumentedTag = { name: string; "x-displayName": string; description: string };
export type TagGroup = { name: string; tags: string[] };

export const TAGS: readonly DocumentedTag[] = [
  {
    name: "stations",
    "x-displayName": "Stations",
    description:
      "Stations are the heart of the API. A station is one operator's installation at a location, together with its cells and sectors. " +
      "Use these endpoints to browse and filter stations, fetch a single one with everything attached, " +
      "and read its photos, comments and change history. " +
      "Editors can create, edit and deactivate stations directly. Everyone else suggests changes through submissions.",
  },
  {
    name: "locations",
    "x-displayName": "Locations",
    description:
      "A location is a physical site: its coordinates, region, city and address, plus the structure the antennas are mounted on. " +
      "Stations of different operators can share one location. " +
      "The map is built on this endpoint: ask for a bounding box and include the stations.",
  },
  {
    name: "cells",
    "x-displayName": "Cells",
    description:
      "A cell is a single carrier of a station, with its technology, band and the identifiers a phone reports for it. " +
      "Besides listing cells, you can export them in the CLF formats that network monitoring apps read, " +
      "and match the cells from a phone log against the database. Editors can also write a matched result back.",
  },
  {
    name: "search",
    "x-displayName": "Search",
    description:
      "One search endpoint for stations. Type a site id, a cell or base station identifier, a city or an address, " +
      "and add keywords like `rat:lte` or `band:1800` to narrow things down. Every result tells you which field matched.",
  },
  {
    name: "photos",
    "x-displayName": "Photos",
    description: "The photo gallery: location photos from across the whole database, newest first.",
  },
  {
    name: "statistics",
    "x-displayName": "Statistics",
    description:
      "Numbers per country: station and cell counts by operator, technology, band and region, " +
      "how the totals changed over time, and how complete the data is. One endpoint also reports how much the log analyzer is used.",
  },
  {
    name: "submissions",
    "x-displayName": "Submissions",
    description:
      "A submission is a change suggested by a signed-in user: a new station, an edit or a removal, " +
      "along with its cells, sectors and photos. Nothing changes right away. An editor reviews every submission first.",
  },
  {
    name: "comments",
    "x-displayName": "Comments",
    description: "Comments that users leave on stations, optionally with photos, and the tools staff use to moderate them.",
  },
  {
    name: "lists",
    "x-displayName": "Lists",
    description:
      "Personal lists of stations, either private or public. " +
      "A list can also be used as a filter when you list stations, load the map or search.",
  },
  {
    name: "countries",
    "x-displayName": "Countries",
    description:
      "The countries the database covers. Each one says whether it is visible to the public and whether it accepts contributions, " +
      "and has a band plan that defines which bands its cells can use.",
  },
  {
    name: "regions",
    "x-displayName": "Regions",
    description:
      "The administrative regions of a country, such as states or provinces. " +
      "Every location belongs to one, and an editor's access can be limited to specific regions.",
  },
  {
    name: "operators",
    "x-displayName": "Operators",
    description:
      "Mobile network operators. These are the physical networks, each with its network codes (PLMNs), " +
      "the brand it trades under and, for shared networks, its member operators.",
  },
  {
    name: "brands",
    "x-displayName": "Brands",
    description: "The brands that operators and structure owners trade under, each with a name, a color and a logo.",
  },
  {
    name: "bands",
    "x-displayName": "Bands",
    description: "Frequency bands, grouped by technology. New bands always come from the 3GPP catalogue.",
  },
  {
    name: "structure-owners",
    "x-displayName": "Structure owners",
    description:
      "The companies that own the towers, masts and rooftops the antennas are mounted on: " +
      "tower companies, broadcasters, utilities, or the operators themselves.",
  },
  {
    name: "emf",
    "x-displayName": "EMF reports",
    description:
      "Electromagnetic field measurements from an official public register: lab reports for a site, the antennas listed in a report, " +
      "the measurements planned and carried out in an area, filings, and sites that went inactive. " +
      "SI2PEM is the only register connected so far, so the data currently covers Poland. " +
      "These endpoints return 503 while SI2PEM is unreachable.",
  },
  {
    name: "terrain-profiles",
    "x-displayName": "Terrain profiles",
    description:
      "A line-of-sight check between one of a station's antennas and a point on the map, taking the terrain in between into account. " +
      "Profiles are computed in the background: create one, then poll it until it is ready. " +
      "The antenna data comes from SI2PEM, so this currently works for stations in Poland.",
  },
  {
    name: "geocoding",
    "x-displayName": "Geocoding",
    description: "Address search and reverse geocoding for the site's own forms. These endpoints only accept requests from the site itself.",
  },
  {
    name: "me",
    "x-displayName": "Current user",
    description: "The signed-in user: account details, role, and the countries and regions they can edit.",
  },
  {
    name: "users",
    "x-displayName": "Users",
    description: "Public user profiles with their contributions, and a user search for staff.",
  },
  {
    name: "notifications",
    "x-displayName": "Notifications",
    description: "Your notifications about the stations you watch and about your own submissions.",
  },
  {
    name: "push-subscriptions",
    "x-displayName": "Push subscriptions",
    description: "Web push subscriptions for your browsers, including what each one wants to be notified about.",
  },
  {
    name: "settings",
    "x-displayName": "Settings",
    description:
      "Site-wide settings: which features are enabled, whether signing in is required, and the announcement banner. " +
      "Administrators can also manage the rules that disable endpoints or open them up to guests.",
  },
  {
    name: "role-grants",
    "x-displayName": "Role grants",
    description: "Who can edit what: which editors have access to which countries or regions, and who maintains a country.",
  },
  {
    name: "audit-operations",
    "x-displayName": "Audit log",
    description:
      "The audit log. Every change to the data is recorded as an operation with the details of what changed, " + "and an operation can be reverted.",
  },
];

export const TAG_GROUPS: readonly TagGroup[] = [
  { name: "Network data", tags: ["stations", "locations", "cells", "search", "photos", "statistics"] },
  { name: "Contributions", tags: ["submissions", "comments", "lists"] },
  { name: "Reference data", tags: ["countries", "regions", "operators", "brands", "bands", "structure-owners"] },
  { name: "Official sources and tools", tags: ["emf", "terrain-profiles", "geocoding"] },
  { name: "Account", tags: ["me", "users", "notifications", "push-subscriptions"] },
  { name: "Administration", tags: ["settings", "role-grants", "audit-operations"] },
];
