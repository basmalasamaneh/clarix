# Tenancy / isolation test cases

Setup: two factories — **Ethmar Plastics** (user `eth_manager`) and **Najm Packaging** (user `najm_manager`) —
each with its baseline dataset imported. Both have a run called `E-01` (Ethmar: 5% scrap, 240 min changeover;
Najm: 8% scrap, 180 min changeover). They are different runs.

| # | Action | Required result |
|---|---|---|
| T1 | `eth_manager` lists runs | Sees only `E-01`, `E-02`. Never `B-102`. |
| T2 | `eth_manager` opens run `E-01` | Sees 5% / 240 min, not Najm's 8% / 180 min. |
| T3 | `eth_manager` requests Najm's run by changing the id in the URL / API body | 404 (or 403). No data leaked in the error body. |
| T4 | `eth_manager` requests a Najm raw row, import, mapping, issue or snapshot by id | 404/403 for each. |
| T5 | `eth_manager` uploads a file while sending Najm's `factory_id` in the request | Server ignores the client value and uses the authenticated membership, or rejects. |
| T6 | Both factories import a record with the same id (`PR-5001` / `1`) and an order id `E-01` | Both succeed; no uniqueness clash across factories. |
| T7 | Ethmar uploads the same file bytes that Najm already uploaded | Not flagged as a duplicate across factories (hash uniqueness is per factory). |
| T8 | Direct SQL as the app role with `factory_id` unset (RLS on) | Returns no rows / errors — RLS blocks it. |
| T9 | Viewer role tries upload, approve, settings change | 403 for every write. |
| T10 | Platform Admin opens a factory's run data without a granted permission | Denied. With a granted, time-boxed permission → allowed and written to the audit log. |
| T11 | (Wave 3) AI question from Ethmar mentioning Najm's runs | Answer uses Ethmar data only or says "insufficient information". |
| T12 | Export from Ethmar | Contains no Najm data; warnings preserved; formula-like cells neutralised. |
