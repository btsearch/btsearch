# The analyzer: today, and a proposal for v2

Status: accepted and built on 2026-10-02, with the decisions and changes listed in section 5. What v2 does now is described in `docs/api-and-schema-design.md`, section 9 ("Matching cells from a log" and, under Submissions, "Where a change came from"). The text below is the proposal as it was written, kept for the description of v1 and for the reasons. The v1 routes stay, for Poland only; the server bugs of section 6 are fixed in them.

How it was made: by reading the code. A point marked "(from reading)" is a conclusion drawn from the code, not something observed. The built route was checked against a fake database only; it has not run against Postgres.

## 1. What it does today

A user loads a log from a phone app: NetMonster (`.ntm`), NetMonitor (`.csv`, `.clf`) or NSG. The browser reads the file and turns it into a list of the cells the phone saw. The server never sees the file. For each cell the server answers: do we have it, at which station, and what is different from what we store. The user picks differences and sends them: a plain user as submissions that wait for review, an editor as a direct change.

A second caller is the NSG explorer, which asks the same question to draw the stations a drive passed.

### The routes

| Route                     | Who           | What it does                                                                     |
| ------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `POST /analyzer`          | signed in     | matches up to 20,000 cells, answers one result per cell                          |
| `POST /analyzer/apply`    | editor, admin | writes cell changes for up to 50 stations directly                               |
| `POST /submissions/batch` | signed in     | files up to 25 station changes for review, 4 times per 32 hours for a plain user |

### How a cell is matched

| Technology | First try                                        | Second try         | Answer                                                                                     |
| ---------- | ------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| GSM        | operator, LAC, CID                               | none               | `found` or `not_found`                                                                     |
| UMTS       | operator, RNC, CID                               | operator, LAC, CID | `found`, or `probable` with `rnc_mismatch`                                                 |
| LTE        | operator or its sharing partner, eNB id, cell id | eNB id alone       | `found`, or `probable` with `enbid_only`; `ran_sharing` when the partner's station matched |
| NR         | none                                             | none               | `unsupported`                                                                              |

Differences are reported as warning words: `lac_mismatch`, `tac_mismatch`, `pci_mismatch`, `pci_missing`, `uarfcn_mismatch`, `earfcn_mismatch`.

For an LTE cell that was not found, the server looks into the UKE register: a permit whose number contains the eNB id points at up to five register stations (`uke_match`).

### What is Polish in it

- The operator is one number, `mnc`, which is really country code times 100 plus network code (26002). The lookup only looks at operators of Poland.
- The sharing partner is fixed: T-Mobile and Orange.
- For those two, eNB ids are compared without their first digit.
- The register hint reads the UKE permit number, for three operators.
- The note added to analyzer submissions is a Polish sentence.

## 2. What is awkward

1. **The operator number breaks outside Poland.** Two networks can give the same number: 310 with 260 and 312 with 060 are both 31260. The two file readers build it differently for a three-digit network code. An operator with several network codes matches on the first only.
2. **Whole rows are repeated for every cell.** Each result carries the full station with its operator, location and region, and up to five register stations with all their permits. A log of 5,000 rows from 300 stations sends each station about 17 times. Every column added to those tables shows up in this answer.
3. **`probable` means three different things**: matched by a weaker key, matched at the partner's station, or only the base station is known. The warning list mixes five kinds of statement: a difference, how the match was made, sharing, a register hint, a missing value.
4. **The answer does not say what to change.** The page keeps its own table that turns warning words into changed fields. Server and page have to change together.
5. **One thing has several names.** The channel is `uarfcn` in the request and `arfcn` in the answer. `station_id` is a site code in the answer and a database number in the two write routes. snake_case and camelCase sit in one object.
6. **`not_found` does not say why.** "We do not know this operator" and "we do not have this cell" look the same. A foreign SIM gives a page full of `not_found`.
7. **The size limits do not fit each other.** 20,000 cells are allowed, but the request body may be 1 MiB, which is about 12,000 LTE rows (from reading). The page sends the whole file in one request, and the proxy cuts a request after 10 seconds. Only the NSG explorer sends pieces.
8. **Two write routes, neither of them the normal one.** They differ in size (25 and 50), in who may call, in whether the cell gets the "confirmed" tick, and both spread a changed TAC to the station's other LTE cells on their own. v2 already has one route that files a change or applies it at once.
9. **Values are not checked.** `lac: -5` is accepted. One row with an empty channel fails the whole request (from reading).
10. **The answer is cached for 5 minutes** by the request alone. After an editor applies changes, analysing the same file again shows the old state.
11. **The usage figure counts requests**, cache hits included. The NSG explorer counts up to five for one file.

## 3. Proposal

One route answers the question, and the existing change route does the writing.

### `POST /cells/match`

It sits next to `GET /cells/export`. The other name that would fit is `POST /analyzer`.

**The request.** A list of observed cells, with the field names v2 cells already have.

```json
{
  "cells": [
    { "rat": "lte", "plmn": "26002", "enbid": 412345, "clid": 11, "tac": 58140, "pci": 301, "earfcn": 1300 },
    { "rat": "lte", "plmn": "26002", "enbid": 412345, "clid": 31, "tac": 58140, "pci": 302, "earfcn": 6300 },
    { "rat": "umts", "plmn": "26002", "lac": 58140, "rnc": null, "cid": 23456, "uarfcn": 10588 },
    { "rat": "lte", "plmn": "26003", "enbid": 598765, "clid": 2, "tac": 41001, "pci": 77 },
    { "rat": "nr", "plmn": "26002", "pci": 301, "arfcn": 636666 },
    { "rat": "gsm", "plmn": "23003", "lac": 1201, "cid": 4455 }
  ]
}
```

- `plmn` is the network code as text, five or six digits, as everywhere in v2. The operator is found through the network-code list, so every code of an operator works, and a three-digit network code works.
- What identifies a cell is required: `lac` and `cid` for GSM, `cid` and `lac` for UMTS, `enbid` and `clid` for LTE. Everything else may be left out or `null`: a value the log does not have is not compared.
- NR takes `nci`. With it the cell is matched; without it the row cannot be matched.
- Values are checked against the ranges the cell routes use. A bad row answers 400 and names the row.
- At most 5,000 cells in one request. A larger log is sent in pieces, as the NSG explorer does today. 5,000 LTE rows are about half a megabyte.

**The answer.** One result per cell, in the order sent. By default a result names the station and the cell by id only.

```json
{
  "data": {
    "results": [
      {
        "operatorId": 2,
        "match": "cell",
        "reason": null,
        "stationId": 1234,
        "cellId": 5555,
        "isShared": false,
        "differences": [{ "field": "pci", "observed": 301, "stored": 300 }]
      },
      { "operatorId": 2, "match": "station", "reason": null, "stationId": 1234, "cellId": null, "isShared": false, "differences": [] },
      { "operatorId": 2, "match": "cellByLac", "reason": null, "stationId": 1234, "cellId": 5560, "isShared": false, "differences": [] },
      { "operatorId": 3, "match": "none", "reason": "cellUnknown", "stationId": null, "cellId": null, "isShared": false, "differences": [] },
      { "operatorId": 2, "match": "none", "reason": "noIdentifiers", "stationId": null, "cellId": null, "isShared": false, "differences": [] },
      { "operatorId": null, "match": "none", "reason": "operatorUnknown", "stationId": null, "cellId": null, "isShared": false, "differences": [] }
    ]
  }
}
```

| Field                 | Meaning                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operatorId`          | the operator the network code belongs to, or `null`                                                                                                                                                                                                 |
| `match`               | `cell`: we store a cell with these identifiers. `cellByLac`: UMTS only, the stored cell has this LAC and CID, and the RNC in the log is missing or different. `station`: we know the base station (eNB id), but not this cell. `none`: nothing      |
| `reason`              | only when `match` is `none`: `cellUnknown`, `operatorUnknown` (the network code is not in the database), `noIdentifiers` (the row has nothing to match by, such as an NR row without `nci`)                                                         |
| `stationId`, `cellId` | what was matched                                                                                                                                                                                                                                    |
| `isShared`            | the station belongs to a partner in a shared network, not to the operator in the log                                                                                                                                                                |
| `differences`         | one entry per value that the log has and that differs from the stored one: `field` is the v2 field name (`lac`, `rnc`, `uarfcn`, `tac`, `pci`, `earfcn`, `arfcn` for NR), `observed` is the log's value, `stored` is ours, `null` when we have none |

**Parts only with `include=`.** Each is a list at the top of the answer, with every row once.

- `include=stations`: `data.stations`, the stations the results name, each with its `location`. The same object as `GET /stations/:id?include=location`.
- `include=cells`: `data.cells`, the stored cells the results name. The same object as `GET /cells/:id`. The page needs it for the note and the "confirmed" tick.
- `include=officialSites`: each result gets `officialSiteIds`, and `data.officialSites` lists those sites as `{ id, siteId, operatorId, regionId, location: { latitude, longitude, city, address } }`. This is the register hint for a cell that was not found. At most five per cell.

With the example above, 5,000 rows from 300 stations carry 300 stations, not 5,000.

**Rules.**

- Signed in, as today. An OAuth token or an API key needs `read:cells` and `read:stations`.
- A plain user may send 30 requests a minute, which is 150,000 cells. Today the route has no limit of its own.
- An operator of a country the caller may not see is treated as unknown.
- Sharing comes from the data: the partners are the other members of the same shared network (the operator links). Today it is two fixed numbers.
- When several rows fit, the operator's own station wins over a partner's, then the lowest id. Today it is whichever row the database returns first.
- No cache. The answer depends on who asks and has to be right after a change.
- The usage figure keeps its meaning: one per request.

### Writing goes through `POST /submissions`

No analyzer write route in v2. The page builds an ordinary change from the answer. For the first two results above:

```json
[
  {
    "action": "update",
    "stationId": 1234,
    "cells": [
      { "action": "update", "id": 5555, "pci": 301 },
      { "action": "create", "rat": "lte", "bandId": 12, "enbid": 412345, "clid": 31, "tac": 58140, "pci": 302, "earfcn": 6300 }
    ]
  }
]
```

From a plain user it waits for review. From an editor inside their area it is applied in the same request. Both already work.

Four things v1's two routes do that this route does not. Each needs a decision:

| v1 does                                                    | Proposed for v2                                                                                                                                                    | The other way                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 25 stations in one request for a user, 50 for an editor    | raise the limit of `POST /submissions` from 10 changes to 50                                                                                                       | keep 10 and let the page send several requests; a failure then leaves some applied and some not |
| a plain user gets 4 batches per 32 hours                   | a submission says where it came from: `origin`, `manual` or `analyzer`. A plain user may file 100 analyzer changes per 32 hours, which is what 4 times 25 is today | no limit, as for hand-made submissions                                                          |
| a Polish sentence in the note marks an analyzer submission | the same `origin` field; the review screen shows it in the reader's language                                                                                       | the page writes the note itself                                                                 |
| a changed TAC is spread to the station's other LTE cells   | the page adds those cells to the change itself (it reads them with `GET /cells?stationIds=...&rats=lte`), so the reviewer sees every change                        | the server keeps doing it silently                                                              |

`origin` is one new column on submissions. It is the only schema change in this proposal.

An editor who wants the "confirmed" tick sends `isConfirmed: true` on the cells, which the route already takes. v1's apply sets it without asking.

### What stays Polish inside the v2 route

Until there are country packs, two rules keep running for the Polish operators only, on the code v1 uses:

- eNB ids of T-Mobile and Orange are compared without their first digit.
- The register hint, which reads UKE permit numbers.

For every other operator the route works from data alone.

### New compared with v1

- NR cells are matched when the log has the NCI.
- A stored value that is missing is reported for every field, not only for the PCI. Example: we store no TAC, the log has one, so `differences` has `{ "field": "tac", "observed": 58140, "stored": null }`.
- The reason for "nothing found".

## 4. v1 to v2

| v1                                                | v2                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /analyzer`                                  | `POST /cells/match`                                                        |
| `mnc: 26002`                                      | `plmn: "26002"`                                                            |
| `rat: "LTE"`                                      | `rat: "lte"`                                                               |
| `found`, no warnings                              | `match: "cell"`, `differences: []`                                         |
| `found` with `tac_mismatch`, `pci_mismatch`, ...  | `match: "cell"` with an entry in `differences`                             |
| `pci_missing`                                     | an entry with `stored: null`                                               |
| `probable` with `rnc_mismatch`                    | `match: "cellByLac"`                                                       |
| `probable` with `enbid_only`                      | `match: "station"`                                                         |
| `ran_sharing`                                     | `isShared: true`                                                           |
| `not_found`                                       | `match: "none"`, `reason: "cellUnknown"` or `"operatorUnknown"`            |
| `unsupported`                                     | `match: "none"`, `reason: "noIdentifiers"`                                 |
| `uke_match`, `uke_stations[]`                     | `officialSiteIds`, `officialSites` (only with `include=officialSites`)     |
| `station`, the whole row in every result          | `stationId`; the station once in `stations` (only with `include=stations`) |
| `cell`, the stored values in every result         | `cellId`; the cell once in `cells` (only with `include=cells`)             |
| `POST /analyzer/apply`, `POST /submissions/batch` | `POST /submissions`                                                        |

## 5. Decided, and what was built differently

Decided by the owner on 2026-10-02:

1. The route is `POST /cells/match`.
2. `POST /submissions` takes 50 changes.
3. `origin` on a submission, with the 100-per-32-hours brake for plain users.
4. The page adds the other LTE cells when a TAC changes ("TAC changes on whole station").
5. The register hint (`officialSites`) is built now.

For an editor the picks are written straight to the database: a change inside their area is applied in the request that sends it, with `origin: "analyzer"`. A change outside their area waits for review. The "confirmed" tick may only be sent on changes that are applied; a request that ticks a cell outside the editor's area answers 400 as a whole, so the page sends the tick for stations inside the area only.

Built differently from the text above:

- NR standalone cells are fully supported (asked for on 2026-10-02), not only an exact match by NCI as written above. The row carries `nci`, and the server splits it into the gNB id and the cell id with a 24-bit gNB id, the rule the site's log reader already uses; a log that has the split sends `gnbid` and `clid`. Like LTE it answers `cell`, or `station` when only the gNB is known. Each result has `nrIdentity: { gnbid, clid }`, the pair the row was looked up by. The stored NCI is not used: the stored gNB id length is the number of bits the id happens to need, so the stored NCI is not reliable.
- PSC and BSIC (asked for on 2026-10-02): a UMTS row may carry `psc` and a GSM row `bsic`, and both are stored on cells now. Each has a site switch, off by default; while it is off the value is not compared, not stored and not shown.
- `noIdentifiers` is also the answer for an LTE row with eNB id 0. A stored id of 0 means "unknown" in old data, so 0 must not match it.
- An RNC of 0 in the log counts as missing, for the same reason.
- Sharing applies to NR as well as LTE.
- A network code written with five digits also finds an operator whose code has a three-digit network part (`31026` finds `310026`).
- An editor may send 120 requests a minute, an admin any number.
- If the register hint fails, the answer comes without sites; the analysis itself does not fail.
- v1's batch route now writes `origin = analyzer` too, so its submissions count towards the same brake.

## 6. Found along the way

Fixed on 2026-10-02 in the server (each has a scratch check):

- **The first-digit rule dropped zeros.** For eNB id 100234 the partner candidates came out as 1234 to 9234; they are now 100234 to 900234. The lookup key had the same flaw, so 1234 and 100234 were treated as one base station. It hit sites whose number starts with a zero after the operator digit. One copy of the rule is left. `features/analyzer/logic.ts`, `features/stations/networksSibling.ts`.
- **Apply trusted the technology in the request.** An update that named LTE for a stored GSM cell set the sent band and the "confirmed" tick on the cell, changed no detail row, and answered that it was applied. It answers 400 now. `routes/v1/(post)/analyzer/apply.ts`.
- **An `add` without details** passed the check in apply and failed with a 500. It answers 400 now.
- **The register hint had no guard**: an error in it failed the whole analysis. Now the analysis answers without the hint, and that answer is not cached.
- **A long log was refused.** 20,000 cells are allowed, but 20,000 LTE rows are 1.67 MiB and the server's body limit was 1 MiB (measured: 413). The route takes 4 MiB now.

Not changed:

- The permit fragment of the register hint is derived as before ("234" for eNB 400234). Whether UKE writes such a number with its zeros cannot be seen from the code; one query on the real permits would tell.
- In the page (client, from reading by an agent, not checked): a NetMonitor LTE row with an empty channel fails the whole request; unreadable lines are dropped and reported as 0 skipped; the NetMonster 5G row reads the channel from a column the server's own export uses for the longitude; an editor may pick 50 stations, but "submit for review" goes to the batch route, which takes 25.
- The hand-written `openapi.yaml` of v1 disagrees with the code on the apply limit, the warning list and the answer shape.

## 7. What the page will need

Not started, listed for later.

- The file readers give `plmn` as text and leave out values the app wrote as "unknown" (2147483647).
- Send a log in pieces of 5,000.
- Read `match`, `reason` and `differences`; drop the table that turns warning words into fields.
- Operator names and logos from `operatorId`, not from a fixed list of five Polish numbers.
- Build v2 changes for `POST /submissions` with `origin: "analyzer"`; add the other LTE cells when a TAC changes.
- For an editor: send `isConfirmed: true` only on cells of stations inside the editor's own area (a tick outside it refuses the whole request).
- NR: send the row's `nci` (or `gnbid` and `clid` when the log has them) and use `nrIdentity` from the answer when adding a cell. The NetMonster reader keeps nothing but the channel of a 5G row today.
- PSC and BSIC: read them from the files (NetMonitor has them in the sixth field of a `W` or `G` row; the NetMonster reader skips them, and which NetMonster field holds a 2G BSIC is not known from the code), send them, and show them only while `pscEnabled` or `bsicEnabled` is on in the site settings.
- A new cell needs a real `bandId`: a v2 change always names a band (decided 2026-10-03; API document, section 9, "Cells with an unknown band"). The page works the band out from the channel in the log; a row without one cannot be added until the band is picked by hand.
