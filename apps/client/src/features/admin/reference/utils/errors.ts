import i18next, { type TFunction } from "i18next";
import { toast } from "sonner";

import {
  ApiResponseError,
  BackendUnavailableError,
  TwoFactorRequiredError,
  isGloballyHandledError,
  readValidationMessages,
  showApiError,
} from "@/lib/api";

type ErrorText = { key: string; value?: string };
type ServerError = ApiResponseError["errors"][number];
type MessageKey = readonly [message: string, key: string];
type MessagePattern = { pattern: RegExp; key: string };

const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";
const UNRECOGNIZED_VALIDATION_KEY = "admin:reference.errors.general.invalid";
const UNRECOGNIZED_ERROR_KEY = "common:error.tryLater";

const COUNTRY_MESSAGES: readonly MessageKey[] = [
  ["This country already exists", "admin:reference.errors.country.exists"],
  ["Cannot delete a country that still has regions, operators, structure owners or editor grants", "admin:reference.errors.country.inUse"],
  ["Country not found", "admin:reference.errors.country.notFound"],
  ["Must be a two-letter country code in upper case", "admin:reference.errors.country.codeFormat"],
  ["Must be greater than south", "admin:reference.errors.country.viewNorthBelowSouth"],
  ["Cannot remove a band that cells or permits in this country still use", "admin:reference.errors.bandPlan.bandInUse"],
];

const REGION_MESSAGES: readonly MessageKey[] = [
  ["This country already has a region with this code or name", "admin:reference.errors.region.taken"],
  ["Another region already has this isoCode", "admin:reference.errors.region.isoCodeTaken"],
  ["Must be an ISO 3166-2 code, for example US-CA", "admin:reference.errors.region.isoCodeFormat"],
  ["Cannot delete a region that still has locations", "admin:reference.errors.region.hasLocations"],
  ["Cannot delete a region that an editor grant is limited to", "admin:reference.errors.region.hasGrants"],
];

const BAND_MESSAGES: readonly MessageKey[] = [
  ["Unknown band code", "admin:reference.errors.band.codeUnknown"],
  ["An uplink-only band cannot hold cells", "admin:reference.errors.band.uplinkOnly"],
  ["A band cannot move to another technology", "admin:reference.errors.band.otherTechnology"],
  ["This band name is already in use", "admin:reference.errors.band.nameTaken"],
  ["Cannot delete a band that cells, permits, submissions or statistics still use", "admin:reference.errors.band.inUse"],
];

const BRAND_MESSAGES: readonly MessageKey[] = [
  ["A brand with this slug already exists", "admin:reference.errors.brand.slugTaken"],
  ["Cannot delete a brand that operators or structure owners still use", "admin:reference.errors.brand.inUse"],
  ["Brand not found", "admin:reference.errors.brand.notFound"],
  ["Must be lower-case letters and digits, with single hyphens between words", "admin:reference.errors.brand.slugFormat"],
  ["Must be a color written as #RRGGBB", "admin:reference.errors.brand.colorFormat"],
  ["The logo must be sent as multipart/form-data", "admin:reference.errors.logo.notSent"],
  ["No file provided", "admin:reference.errors.logo.notSent"],
  ["The multipart request body is malformed or incomplete.", "admin:reference.errors.logo.notSent"],
  ["The logo file is too large", "admin:reference.errors.logo.tooLarge"],
  ["The logo must be an SVG, PNG or WebP image", "admin:reference.errors.logo.type"],
  ["The SVG logo needs a viewBox, or a width and a height in pixels", "admin:reference.errors.logo.svgSize"],
];

const OPERATOR_MESSAGES: readonly MessageKey[] = [
  ["This country already has an operator with this name", "admin:reference.errors.operator.nameTaken"],
  ["Operator not found", "admin:reference.errors.operator.notFound"],
  ["Cannot delete an operator that still has stations", "admin:reference.errors.operator.hasStations"],
  ["Cannot delete an operator that still has official sites and permits", "admin:reference.errors.operator.hasOfficialSites"],
  ["Cannot delete a shared network that still has member operators", "admin:reference.errors.operator.hasMembers"],
  ["Cannot delete an operator that a pending submission still names", "admin:reference.errors.operator.inPendingSubmission"],
  ["One of these PLMNs already belongs to another operator", "admin:reference.errors.plmn.taken"],
  ["Must be a three-digit MCC followed by a two- or three-digit MNC", "admin:reference.errors.plmn.format"],
  ["Each PLMN can appear once", "admin:reference.errors.plmn.repeated"],
  ["Only one PLMN can be primary", "admin:reference.errors.plmn.severalPrimary"],
  ["A linked operator was not found", "admin:reference.errors.link.notFound"],
  ["A linked operator belongs to another country", "admin:reference.errors.link.otherCountry"],
  ["An operator cannot be linked to itself", "admin:reference.errors.link.self"],
  ["A linked operator is already a member of this operator", "admin:reference.errors.link.isMember"],
  ["Each link can appear once", "admin:reference.errors.link.repeated"],
];

const STRUCTURE_OWNER_MESSAGES: readonly MessageKey[] = [
  ["The operator belongs to another country than the structure owner", "admin:reference.errors.owner.operatorOtherCountry"],
  ["This country already has a structure owner with this name", "admin:reference.errors.owner.nameTaken"],
  ["A structure owner with this name and no country already exists", "admin:reference.errors.owner.nameTakenWithoutCountry"],
  ["This operator already has a structure owner entry", "admin:reference.errors.owner.operatorTaken"],
  ["Cannot set a country on a structure owner that locations in other countries still use", "admin:reference.errors.owner.usedInOtherCountries"],
  ["Cannot delete a structure owner that locations still use", "admin:reference.errors.owner.hasLocations"],
  ["Cannot delete a structure owner that a pending submission still names", "admin:reference.errors.owner.inPendingSubmission"],
];

const TEAM_MESSAGES: readonly MessageKey[] = [
  ["Only an administrator can appoint or remove a maintainer", "admin:reference.errors.team.maintainerAdminOnly"],
  ["Only a maintainer of this country or an administrator can manage its editors", "admin:reference.errors.team.otherCountry"],
  ["This user already has this grant for this country", "admin:reference.errors.team.grantExists"],
  ["Administrators already have access everywhere", "admin:reference.errors.team.grantForAdministrator"],
  ["Every region must belong to the grant's country", "admin:reference.errors.team.regionsOtherCountry"],
  ["A maintainer grant covers the whole country", "admin:users.detail.grants.dialog.maintainerScopeHint"],
  ["User not found", "common:error.userNotFoundDescription"],
];

const GENERAL_MESSAGES: readonly MessageKey[] = [
  ["Cannot delete a record that other records still use.", "admin:reference.errors.general.recordInUse"],
  ["A duplicate entry already exists.", "admin:reference.errors.general.duplicate"],
  ["The requested resource was not found.", "admin:reference.errors.general.notFound"],
  ["You do not have permissions to perform this action.", "admin:reference.errors.general.forbidden"],
  ["You do not have access to this resource.", "admin:reference.errors.general.forbidden"],
  ["At least one field is required", "common:actions.noChanges"],
];

const MESSAGE_KEYS: ReadonlyMap<string, string> = new Map<string, string>([
  ...COUNTRY_MESSAGES,
  ...REGION_MESSAGES,
  ...BAND_MESSAGES,
  ...BRAND_MESSAGES,
  ...OPERATOR_MESSAGES,
  ...STRUCTURE_OWNER_MESSAGES,
  ...TEAM_MESSAGES,
  ...GENERAL_MESSAGES,
]);

const MESSAGE_PATTERNS: readonly MessagePattern[] = [
  { pattern: /^This band already exists as "(.+)"$/, key: "admin:reference.errors.band.exists" },
  { pattern: /^isoCode must start with (.+)$/, key: "admin:reference.errors.region.isoCodePrefix" },
  { pattern: /^The logo must be at least (\d+) pixels high$/, key: "admin:reference.errors.logo.tooLow" },
];

function findMessageText(message: string): ErrorText | null {
  const exactKey = MESSAGE_KEYS.get(message);
  if (exactKey !== undefined) return { key: exactKey };

  for (const { pattern, key } of MESSAGE_PATTERNS) {
    const match = pattern.exec(message);
    if (match !== null) return { key, value: match[1] };
  }
  return null;
}

function findServerErrorText(serverError: ServerError): ErrorText | null {
  const messageText = findMessageText(serverError.message);
  if (messageText !== null) return messageText;
  if (serverError.code !== VALIDATION_ERROR_CODE) return null;

  for (const validationMessage of readValidationMessages(serverError.details)) {
    const validationText = findMessageText(validationMessage);
    if (validationText !== null) return validationText;
  }
  return { key: UNRECOGNIZED_VALIDATION_KEY };
}

function findErrorText(error: unknown): ErrorText | null {
  if (!(error instanceof ApiResponseError)) return null;

  for (const serverError of error.errors) {
    const text = findServerErrorText(serverError);
    if (text !== null) return text;
  }
  return null;
}

export function getReferenceErrorMessage(t: TFunction, error: unknown, fallbackKey: string): string {
  const text = findErrorText(error);
  if (text === null) return t(fallbackKey);
  return text.value === undefined ? t(text.key) : t(text.key, { value: text.value });
}

export function showReferenceError(error: unknown, fallbackKey: string): void {
  if (isGloballyHandledError(error)) return;
  if (error instanceof BackendUnavailableError || error instanceof TwoFactorRequiredError) {
    showApiError(error);
    return;
  }

  const text: ErrorText = findErrorText(error) ?? { key: UNRECOGNIZED_ERROR_KEY };
  const description = text.value === undefined ? i18next.t(text.key) : i18next.t(text.key, { value: text.value });
  toast.error(i18next.t(fallbackKey), { description });
}
