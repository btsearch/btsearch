export type AttestationRootKey = { name: string; spkiSha256: string };

export type BootKeyList = { os: string; listUrl: string; signatureUrl: string; signerKey: string; namespace: string };

export const ATTESTATION_ROOT_KEYS: readonly AttestationRootKey[] = [
  { name: "googleRsa", spkiSha256: "feb2ea7551ee316ed4bb443c8293b884dbfdea40b603ee3e4f4a897e4580fbae" },
  { name: "googleEc", spkiSha256: "3ee44512a1af2beb39c889490c60ea3f82e43f5d5a5532f5ab9419f676cd07ec" },
];

export const BOOT_KEY_LISTS: readonly BootKeyList[] = [
  {
    os: "grapheneos",
    listUrl: "https://grapheneos.org/attestation.json",
    signatureUrl: "https://grapheneos.org/attestation.json.sig",
    signerKey: "AAAAC3NzaC1lZDI1NTE5AAAAIIUg/m5CoP83b0rfSCzYSVA4cw4ir49io5GPoxbgxdJE",
    namespace: "attestation keys",
  },
];
