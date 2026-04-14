'use client';

export type HkZoneCode = 'HKI' | 'KLN' | 'NTE' | 'NTW' | 'ISL';

export type HkDistrictDefinition = {
  svgId: string;
  areaCode: string;
  name: string;
  zoneCode: HkZoneCode;
  zoneLabel: string;
  primaryLabel: string;
  path: string;
};

export const HK_DISTRICTS: HkDistrictDefinition[] = [
  {
    svgId: 'HK5153',
    areaCode: 'CENTRAL_WESTERN',
    name: 'Central and Western',
    zoneCode: 'HKI',
    zoneLabel: 'Hong Kong Island',
    primaryLabel: 'Hong Kong Island',
    path: 'M569.6 558.6l-20.5 1.5-21.4-16.3-15.1-8.2-23.5-0.1 1.3-11 3.7-2.7 7.7-4 13.9-6.9 16.2-5.4 17.4 5.4 11.6 6.9 13.9 4-5.2 36.8z',
  },
  {
    svgId: 'HK5154',
    areaCode: 'WAN_CHAI',
    name: 'Wan Chai',
    zoneCode: 'HKI',
    zoneLabel: 'Hong Kong Island',
    primaryLabel: 'Hong Kong Island',
    path: 'M612 556.6l-25.2 0.8-17.2 1.2 5.2-36.8 21.2 0 12.2 7 13.8 2.8-3.8 10.8-6.2 14.2z',
  },
  {
    svgId: 'HK5155',
    areaCode: 'EASTERN',
    name: 'Eastern',
    zoneCode: 'HKI',
    zoneLabel: 'Hong Kong Island',
    primaryLabel: 'Hong Kong Island',
    path: 'M713 574.9l-33.1-14.8-47.8-4.1-20.1 0.6 6.2-14.2 3.8-10.8-13.8-2.8-12.2-7 15-13.6 13.9-8.1 15.5 6.3 14.8 4.5 10 10.9 10.2-2.7 12.5 5.4 12.5 23 12.6 9.7 0 17.7z',
  },
  {
    svgId: 'HK5156',
    areaCode: 'SOUTHERN',
    name: 'Southern',
    zoneCode: 'HKI',
    zoneLabel: 'Hong Kong Island',
    primaryLabel: 'Hong Kong Island',
    path: 'M713 574.9l-9.9 12.2 6 16.3 7.6 14.9-7.6 2.7 11.4 32.8-20.1 4-5.1-6.9-12.4-10.9-0.2-18.3-5.1-20.2-11-9.1-9.4 7.9 9.4 3.1 0 13.5-6.4 1.4-11.2 13.6 11.2 17.7-5 12.2 6.3 12.4-19 4-2.7-27.3 5.3-4-4.5-8.4-16.9 8.4-7.5-4.2 7.5-9.3-11.3-6.8 7.5-11-3.7-9.5-14-2.7 1.8-14.8-20.4 13.4-6.3 9.5-3.8 0-3.7-9.5-2.6-12.3-14.2-8.1-26.1-1.2-11.2-5.5-6.5-13.7-2.4-8.1-7.6-13.6-10.1-4 23.5 0.1 15.1 8.2 21.4 16.3 20.5-1.5 17.2-1.2 25.2-0.8 20.1-0.6 47.8 4.1 33.1 14.8z',
  },
  {
    svgId: 'HK5157',
    areaCode: 'YAU_TSIM_MONG',
    name: 'Yau Tsim Mong',
    zoneCode: 'KLN',
    zoneLabel: 'Kowloon',
    primaryLabel: 'Kowloon',
    path: 'M590.3 445.7l-1 15.2 3.8 17.6-0.9 22.9-7.5 4.1-7.4-9.5 1.5-19.7-4-8.9-1.3-8 0-12.3 25.5-1.4z',
  },
  {
    svgId: 'HK5158',
    areaCode: 'KOWLOON_CITY',
    name: 'Kowloon City',
    zoneCode: 'KLN',
    zoneLabel: 'Kowloon',
    primaryLabel: 'Kowloon',
    path: 'M581.8 407.8l25.1-5.6 12.6 26 18.9-2.5 5 18.9 5.6 22.8 5 16.4-3.8 0-27.4-29.8-14.4 16.6 7.8 11.9 0 5.3-12.4-5.3-3.3 13.1-8.3 5.8 0.9-22.9-3.8-17.6 1-15.2 1.5-22.9-10-15z',
  },
  {
    svgId: 'HK5159',
    areaCode: 'SHAM_SHUI_PO',
    name: 'Sham Shui Po',
    zoneCode: 'KLN',
    zoneLabel: 'Kowloon',
    primaryLabel: 'Kowloon',
    path: 'M564.7 412.9l17.1-5.1 10 15-1.5 22.9-25.5 1.4-11.8-10.9-10.5-6.1 4.3-11.8 17.9-5.4z',
  },
  {
    svgId: 'HK5160',
    areaCode: 'WONG_TAI_SIN',
    name: 'Wong Tai Sin',
    zoneCode: 'KLN',
    zoneLabel: 'Kowloon',
    primaryLabel: 'Kowloon',
    path: 'M606.9 402.2l60.4-13.4 17.6 39.4-46.5-2.5-18.9 2.5-12.6-26z',
  },
  {
    svgId: 'HK5161',
    areaCode: 'KWUN_TONG',
    name: 'Kwun Tong',
    zoneCode: 'KLN',
    zoneLabel: 'Kowloon',
    primaryLabel: 'Kowloon',
    path: 'M684.9 428.2l12.6 23.1-8.8 32.7 11.4 25.9-7.3 7.9-17.4-17.7-26.4-32.7-5.6-22.8-5-18.9 46.5 2.5z',
  },
  {
    svgId: 'HK5162',
    areaCode: 'SAI_KUNG',
    name: 'Sai Kung',
    zoneCode: 'NTE',
    zoneLabel: 'New Territories East',
    primaryLabel: 'New Territories',
    path: 'M712.6 319.4l49-8.1 29-17.7 30.1-15 23.9 13.6 27.7 13.6 22.7-15-2.6-36.7 7.4-23.2 4.6 10.9 25.1 1.4 22.6 5.4-3.9 13.4 6.3 27.4-19.2-9.1-12.2-1.9-18.7 36.7 7.8-4.5 16 23 7.7 37.3-5.1 1.3-1.3-8.6-15.1-0.8 5 14.9-6.3 15-8.7 8.1-15.1 5.3-5.2 23.3-8.5-12.3 0-21.7-16.7 10.7-4.7-12-10.1-12.4 2.5-27.1-22.4-9.5-2.9-15-13.8 9.8-16.1 3.8-22.7-16.4-12.9 0-14.9 21.9 7.4 25.8 10.4 15-5.4 12.1-14.9-13.4-1.4-17.8-12.8 6.8-4.6 10.7 16.5 16.7 10.9 44.7 7.5 2.6 22.7 4.6 1.3 19.9 6.3 0 12.7-2.7 12.5 16.4-9.6 11.4-12.8 8.9-11.6-4-2.5 1.3 1.2 9.6-0.3 13.5 17-5.4 4.9 13.6 0 12.3-10.3 6.7-12.5-11-17.2-10.2 2.4-15.5-10.4-28.6-13.7-10.7 1.3-13.7 1.1-10.8-17.4-11-6.6 29.9 2.5 16.3-15.4 16.7-11.4-25.9 8.8-32.7-12.6-23.1-17.6-39.4 23.9-38.1 21.4-31.3z',
  },
  {
    svgId: 'HK5163',
    areaCode: 'SHA_TIN',
    name: 'Sha Tin',
    zoneCode: 'NTE',
    zoneLabel: 'New Territories East',
    primaryLabel: 'New Territories',
    path: 'M550.3 369.8l36.5-51.7-3.8-37.6 17.6-0.5 37.9-11.8 10.5 7.5-2.9 13.7 7.9 6.7-8.9 17.8 10.1-2.9 12.6-25.6 17.4-17 6.5-18.5 9-0.3 12.3 8.4 0.8 31.5-1.2 29.9-21.4 31.3-23.9 38.1-60.4 13.4-25.1 5.6-17.1 5.1-8.1-21.4-6.3-21.7z',
  },
  {
    svgId: 'HK5164',
    areaCode: 'KWAI_TSING',
    name: 'Kwai Tsing',
    zoneCode: 'NTW',
    zoneLabel: 'New Territories West',
    primaryLabel: 'New Territories',
    path: 'M489 385.4l28.6-4.8 13.2-5.8-6.9-22.7 12.6-5.5 13.8 23.2 6.3 21.7 8.1 21.4-17.9 5.4-4.3 11.8-12.1-7-22.3-10.8-1.3 8.8-16.4-27-1.4-8.7z',
  },
  {
    svgId: 'HK5165',
    areaCode: 'TSUEN_WAN',
    name: 'Tsuen Wan',
    zoneCode: 'NTW',
    zoneLabel: 'New Territories West',
    primaryLabel: 'New Territories',
    path: 'M356.8 457.7l-56.2 0.6 6.3-11.2 28.7-23.1 5.1 12.2 37.6-30.1 8.9 6.2 8.9 10.3-5 13.6-2.5 14.9-6.5-5.6-12.6-2.4-11.2 0-1.5 14.6z m132.2-72.3l-2.4-14.5-10-6.8-11.8 11.9-29.6-5.1-1.3 5.4-12.7 0-5.2 6.8-14.9-4.1-12.5 4.1-16.6 6.9-31.3 8.1 15.9-22.9-13.8-15 22.6-17.7 59.1-21.7 67.9-20.4 36.5-9.6 26.4-9.5 27.7-0.8 3.8 37.6-36.5 51.7-13.8-23.2-12.6 5.5 6.9 22.7-13.2 5.8-28.6 4.8z',
  },
  {
    svgId: 'HK5166',
    areaCode: 'TUEN_MUN',
    name: 'Tuen Mun',
    zoneCode: 'NTW',
    zoneLabel: 'New Territories West',
    primaryLabel: 'New Territories',
    path: 'M365.4 342.5l-22.6 17.7 13.8 15-15.9 22.9-8.9-5.4 0-9.6-26.3 0-10.9-8.9-14.9-4.7-9.5-21.7-6.2-1.3-3.7-12.4-10.1 11.2 16.6 15-31.8 3.8-16.3 13.6-22.8-12.2-7.6 0-18.6-12.3 6.3-20.4-12.5-18.9-21.9-17.6 20.1-17.2 34.2-2.1 16.7-12.1 32.1 17.8 44 21.8 75.4 0 1.3 38z',
  },
  {
    svgId: 'HK5167',
    areaCode: 'YUEN_LONG',
    name: 'Yuen Long',
    zoneCode: 'NTW',
    zoneLabel: 'New Territories West',
    primaryLabel: 'New Territories',
    path: 'M455.1 105.1l8.4 41.5 8.8 42.2 46.6-5.5 13.8 9.6-22.6 28.5 18.8 69.4-36.5 9.6-67.9 20.4-59.1 21.7-1.3-38-75.4 0-44-21.8-32.1-17.8 21.1-39.6 37.8-16.4 34-51.8 10.1 0 12.6 4.3-1.6 10.6-0.9 12.5 6.1-4.1 19-5.3 5 0 2.5-7-1.3-9.4 0-13.7 18.8-9.6 25.3-6.7 5.5-6.1 24-6.8 24.5-10.7z',
  },
  {
    svgId: 'HK5168',
    areaCode: 'NORTH',
    name: 'North',
    zoneCode: 'NTE',
    zoneLabel: 'New Territories East',
    primaryLabel: 'New Territories',
    path: 'M455.1 105.1l30-13 8.4-4.3 8.9-4.5 18.1-9.2 8.9-5.5 23.7-14.4 22.3-13.5 20.6-7.4 6.7 5.8 27.2 0 33.6 1.9 14.6-1.2 7.9-0.7-12.1 15.9-8.1 9.8-11.8 12.2-7.9 0-1 18.8 13.9-4.1 1.2-6.6 18.9-5.4 6.3-7 12.4-23.1 6.3-1.4 5 5.5 8.9-5.5 5 5.5-7.1 14.6 9.6-2.3 10.4 9.6-0.8 11.9 7.8 5 12.9-7.4 2.9 6.6 0 11-3.4 14.1 12 0.9 6.6 10.4 15 7.3 45.2-13.6 10-5.5-29.6 23.5-27.7 13.6-23.9-5.5-37.7 4.1-35.3 1.4-15.1-15-21.3-1.3-23.9 12.2-27.7 15-8.8-4.1-18.9 4.1-2.5 13.6-39 15-13.8-9.6-46.6 5.5-8.8-42.2-8.4-41.5z',
  },
  {
    svgId: 'HK5169',
    areaCode: 'TAI_PO',
    name: 'Tai Po',
    zoneCode: 'NTE',
    zoneLabel: 'New Territories East',
    primaryLabel: 'New Territories',
    path: 'M532.7 192.9l39-15 2.5-13.6 18.9-4.1 8.8 4.1 27.7-15 23.9-12.2 21.3 1.3 15.1 15 35.3-1.4 37.7-4.1 23.9 5.5 27.7-13.6 29.6-23.5 3.8 9.7-30.3 24.5-17.6 16.3-19 8.3-21.3 9.4-18.8 13.7-7.5 12.1-16.7 11-12.6 0-23.7-31.4-22.7 4.2-8.7-5.6-3.9 8.3 2.6 14.8 7.5 4.1 2.5 12.3-11.6-2.7-1-8-11.4-7-18.8 2.7-6.3 8.3-30.9 6.5 14.5 8.4 17.7 12.4 20.5 13.9 8.1 5.7-37.9 11.8-17.6 0.5-27.7 0.8-26.4 9.5-18.8-69.4 22.6-28.5z m180.3 65.1l25.4 0 3.5 9.1-3.5 16.6 8.6 11 6.3-17.7 20.2-10.8-20.2-31.3 20.2-16.3 20.3-5.6-1.3-14.8 37-26.2 2.1 8.4 9.2 1.9-9.2 17.2 17.2 4.4 3.8 26.8-8.5 11.1 7.5 14.7 8.6-10.6 7.8 25.7 7.6-1.3-1.2-30.2 13.4-35.2 12.8 10.8-0.8 15.2-7.4 23.2 2.6 36.7-22.7 15-27.7-13.6-23.9-13.6-30.1 15-29 17.7-49 8.1 1.2-29.9-0.8-31.5z',
  },
  {
    svgId: 'HK5170',
    areaCode: 'ISLANDS',
    name: 'Islands District',
    zoneCode: 'ISL',
    zoneLabel: 'Islands',
    primaryLabel: 'Islands District',
    path: 'M529.1 697l-42.7 2.9 5.2-15 0-53-15.9 0.3 3.4-11.2 0.6-23.3 10.6 4.3 6.7 20 13.4 14.6 11.4-4.7 0 10.8-11.4 8.2 20-1.4 18.5 0 8 4.3-18.6 13-6.4 8.7 10.1 21.6-12.9-0.1z m-228.5-238.7l56.2-0.6-1.4 12.5-27.2-4.1 0 23.1 15.2-6.7-7.4 22.4 2.1 42.6-23.7 0-14.2-5.5 19.2 27.3-23.9 19 36.3 24.6-23.9 19-29.3 13.8-2.1-12.3 0-38.2-18.7 0-15.3 0-22.4 0-27.9 23.1-11.1 0-5.1 8.3 16.2 4 0 10.7-14.9 10-20.7 1.8-19.7-19.7-2.5-12.4-13.8 4.2-16.5 12.1-23.5 20.3-20.5 7.5-11.6-13.6-2.1-22.7-0.9-18.6 3-9.7 16.1 0 0-17.3 12.2-3.3 0-10.9-10-7.8 0.8-0.6 14.2-11.1 11.4-9.6 1.1-3.1 14.8-2.7 11.5-12.3 13.8-23.2 30.3 0 16.4 1.5 11.1 12.1 16.6-6.7 37.5-21.7 23.9 5.4 11.3-19.1 14-2.7 5.1-9.1z',
  },
];

export const HK_DISTRICT_VIEWBOX = '0 0 1000 733';

export const DISTRICT_NAME_ZH_BY_AREA_CODE: Record<string, string> = {
  CENTRAL_WESTERN: '中西區',
  WAN_CHAI: '灣仔區',
  EASTERN: '東區',
  SOUTHERN: '南區',
  YAU_TSIM_MONG: '油尖旺區',
  KOWLOON_CITY: '九龍城區',
  SHAM_SHUI_PO: '深水埗區',
  WONG_TAI_SIN: '黃大仙區',
  KWUN_TONG: '觀塘區',
  SAI_KUNG: '西貢區',
  SHA_TIN: '沙田區',
  KWAI_TSING: '葵青區',
  TSUEN_WAN: '荃灣區',
  TUEN_MUN: '屯門區',
  YUEN_LONG: '元朗區',
  NORTH: '北區',
  TAI_PO: '大埔區',
  ISLANDS: '離島區',
};

export const ZONE_LABEL_ZH_BY_ZONE_CODE: Record<HkZoneCode, string> = {
  HKI: '香港島',
  KLN: '九龍',
  NTE: '新界東',
  NTW: '新界西',
  ISL: '離島',
};

export const ZONE_LABEL_EN_BY_ZONE_CODE: Record<HkZoneCode, string> = {
  HKI: 'Hong Kong Island',
  KLN: 'Kowloon',
  NTE: 'New Territories East',
  NTW: 'New Territories West',
  ISL: 'Islands',
};

export const HK_ZONE_CODES: HkZoneCode[] = ['HKI', 'KLN', 'NTE', 'NTW', 'ISL'];

const AREA_CODE_SET = new Set(HK_DISTRICTS.map((district) => district.areaCode));
const DISTRICT_BY_CODE = new Map(HK_DISTRICTS.map((district) => [district.areaCode, district]));
const DISTRICT_BY_NAME = new Map(HK_DISTRICTS.map((district) => [district.name.toLowerCase(), district]));
const AREA_CODES_BY_ZONE: Record<HkZoneCode, string[]> = {
  HKI: HK_DISTRICTS.filter((d) => d.zoneCode === 'HKI').map((d) => d.areaCode),
  KLN: HK_DISTRICTS.filter((d) => d.zoneCode === 'KLN').map((d) => d.areaCode),
  NTE: HK_DISTRICTS.filter((d) => d.zoneCode === 'NTE').map((d) => d.areaCode),
  NTW: HK_DISTRICTS.filter((d) => d.zoneCode === 'NTW').map((d) => d.areaCode),
  ISL: HK_DISTRICTS.filter((d) => d.zoneCode === 'ISL').map((d) => d.areaCode),
};

const MACRO_TO_AREA_CODES: Record<string, string[]> = {
  'hong kong island': HK_DISTRICTS.filter((d) => d.zoneCode === 'HKI').map((d) => d.areaCode),
  kowloon: HK_DISTRICTS.filter((d) => d.zoneCode === 'KLN').map((d) => d.areaCode),
  'new territories': HK_DISTRICTS.filter((d) => d.zoneCode === 'NTE' || d.zoneCode === 'NTW').map((d) => d.areaCode),
  'new territories east': HK_DISTRICTS.filter((d) => d.zoneCode === 'NTE').map((d) => d.areaCode),
  'new territories west': HK_DISTRICTS.filter((d) => d.zoneCode === 'NTW').map((d) => d.areaCode),
  'islands district': HK_DISTRICTS.filter((d) => d.zoneCode === 'ISL').map((d) => d.areaCode),
  islands: HK_DISTRICTS.filter((d) => d.zoneCode === 'ISL').map((d) => d.areaCode),
  'all hong kong': HK_DISTRICTS.map((d) => d.areaCode),
  'all hk': HK_DISTRICTS.map((d) => d.areaCode),
};

const cleanToken = (value: string) => value.trim().toLowerCase();

export const sortAreaCodes = (codes: string[]) => {
  const wanted = new Set(codes);
  return HK_DISTRICTS.map((district) => district.areaCode).filter((code) => wanted.has(code));
};

export const uniqAreaCodes = (codes: string[]) => sortAreaCodes(Array.from(new Set(codes.filter((code) => AREA_CODE_SET.has(code)))));

export const getDistrictByAreaCode = (areaCode?: string | null) => (areaCode ? DISTRICT_BY_CODE.get(areaCode) || null : null);

export const getDistrictByName = (name?: string | null) => {
  if (!name) return null;
  return DISTRICT_BY_NAME.get(name.trim().toLowerCase()) || null;
};

export const areaCodesToNames = (codes: string[]) => uniqAreaCodes(codes)
  .map((code) => DISTRICT_BY_CODE.get(code)?.name)
  .filter(Boolean) as string[];

export const getDistrictNameZh = (areaCode?: string | null) => {
  if (!areaCode) return '';
  return DISTRICT_NAME_ZH_BY_AREA_CODE[areaCode] || '';
};

export const getZoneLabelZh = (zoneCode?: HkZoneCode | null) => {
  if (!zoneCode) return '';
  return ZONE_LABEL_ZH_BY_ZONE_CODE[zoneCode] || '';
};

export const getZoneLabelEn = (zoneCode?: HkZoneCode | null) => {
  if (!zoneCode) return '';
  return ZONE_LABEL_EN_BY_ZONE_CODE[zoneCode] || '';
};

export const areaCodesToZoneCodes = (areaCodes: string[]) => {
  const selected = new Set(uniqAreaCodes(areaCodes));
  return HK_ZONE_CODES.filter((zoneCode) => AREA_CODES_BY_ZONE[zoneCode].some((code) => selected.has(code)));
};

export const zoneCodesToAreaCodes = (zoneCodes: HkZoneCode[]) => {
  const selectedZones = new Set(zoneCodes);
  const merged = HK_ZONE_CODES
    .filter((zoneCode) => selectedZones.has(zoneCode))
    .flatMap((zoneCode) => AREA_CODES_BY_ZONE[zoneCode]);
  return uniqAreaCodes(merged);
};

export const areaCodeToCanonicalLocation = (areaCode?: string | null) => {
  const district = getDistrictByAreaCode(areaCode);
  if (!district) return {};
  return {
    primary: district.primaryLabel,
    secondary: district.name,
    tertiary: undefined,
  };
};

export const deriveProjectAreaCodeFromLocation = (location?: {
  primary?: string;
  secondary?: string;
  tertiary?: string;
}) => {
  if (!location) return null;
  const direct = getDistrictByName(location.secondary || location.tertiary || '');
  return direct?.areaCode || null;
};

export const deriveCoverageDraftFromAreaCodes = (codes: string[]) => {
  const normalizedCodes = uniqAreaCodes(codes);
  const districts = normalizedCodes.map((code) => DISTRICT_BY_CODE.get(code)).filter(Boolean) as HkDistrictDefinition[];
  const serviceArea = districts.map((district) => district.name).join(', ');
  const primaryLabels = Array.from(new Set(districts.map((district) => district.primaryLabel)));
  const locationPrimary = primaryLabels.length === 0
    ? ''
    : primaryLabels.length === 2 && primaryLabels.includes('New Territories') && !primaryLabels.some((label) => label === 'Hong Kong Island' || label === 'Kowloon' || label === 'Islands District')
      ? 'New Territories'
      : primaryLabels.join(', ');

  return {
    serviceArea,
    locationPrimary,
    locationSecondary: districts.length === 1 ? districts[0].name : '',
    locationTertiary: '',
  };
};

export const deriveAreaCodesFromCoveragePayload = (input?: {
  regionCoverage?: Array<{ area?: { code?: string | null; name?: string | null } | null }>;
  serviceArea?: string | null;
  locationPrimary?: string | null;
  locationSecondary?: string | null;
  locationTertiary?: string | null;
}) => {
  const codes = new Set<string>();

  for (const item of input?.regionCoverage || []) {
    const code = item?.area?.code?.trim();
    if (code && AREA_CODE_SET.has(code)) codes.add(code);
  }
  if (codes.size > 0) return sortAreaCodes(Array.from(codes));

  const tokens = [
    ...(input?.serviceArea || '').split(/[,;\n|/]+/g),
    input?.locationPrimary || '',
    input?.locationSecondary || '',
    input?.locationTertiary || '',
  ]
    .map(cleanToken)
    .filter(Boolean);

  for (const token of tokens) {
    const district = DISTRICT_BY_NAME.get(token);
    if (district) {
      codes.add(district.areaCode);
      continue;
    }
    const macroCodes = MACRO_TO_AREA_CODES[token];
    if (macroCodes) {
      for (const areaCode of macroCodes) codes.add(areaCode);
    }
  }

  return sortAreaCodes(Array.from(codes));
};
