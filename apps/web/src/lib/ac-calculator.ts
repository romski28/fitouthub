export type HeatProfile = 'cool' | 'warm' | 'hot';
export type CalculationMethod = 'area' | 'volume';

export type RoomInput = {
  id: string;
  name: string;
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  heatProfile: HeatProfile;
  occupants: number;
  floor?: number | null;
  westFacing?: boolean;
  largeWindows?: boolean;
};

export type RoomResult = RoomInput & {
  areaSqm: number;
  volumeCbm: number;
  calculatedBtu: number;
  recommendedAcType: string;
  suggestedUnitSize: number;
  notes: string[];
};

export type ShoppingListItem = {
  unitSize: number;
  count: number;
};

export type CalculatorSummary = {
  totalBtu: number;
  recommendedSystem: string;
  shoppingList: ShoppingListItem[];
  compressorSuggestion: string;
  summaryNotes: string[];
};

const STANDARD_UNIT_SIZES = [9000, 12000, 18000, 24000] as const;
const COMPRESSOR_SIZES = [18000, 24000, 30000, 36000, 42000, 48000, 60000] as const;

export const formatBtu = (value: number) => `${Math.round(value).toLocaleString()} BTU`;
export const formatUnitSize = (value: number) => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k BTU`;

const clampPositive = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
};

export const getSuggestedUnitSize = (btu: number) => {
  const exact = STANDARD_UNIT_SIZES.find((size) => btu <= size);
  return exact ?? 24000;
};

export const getRecommendedAcType = (btu: number, combineRooms: boolean) => {
  if (combineRooms || btu > 24000) return 'Ducted system';
  if (btu < 9000) return 'Window unit';
  if (btu <= 18000) return 'Split-type unit';
  return 'Large split / multi-split';
};

export const calculateRoom = (
  room: RoomInput,
  method: CalculationMethod,
  combineRooms: boolean,
): RoomResult => {
  const length = clampPositive(room.lengthMeters, 1);
  const width = clampPositive(room.widthMeters, 1);
  const height = clampPositive(room.heightMeters, 2.4);
  const occupants = Math.max(1, Math.round(room.occupants || 1));
  const areaSqm = Number((length * width).toFixed(2));
  const volumeCbm = Number((areaSqm * height).toFixed(2));

  const baseLoad = method === 'volume' ? volumeCbm * 250 : areaSqm * 700;
  const heatMultiplier = room.heatProfile === 'hot' ? 1.15 : room.heatProfile === 'warm' ? 1.1 : 1;
  const occupantLoad = Math.max(0, occupants - 1) * 600;
  const calculatedBtu = Math.round(baseLoad * heatMultiplier + occupantLoad);
  const suggestedUnitSize = getSuggestedUnitSize(calculatedBtu);
  const recommendedAcType = getRecommendedAcType(calculatedBtu, combineRooms);

  const notes: string[] = [];
  if (room.heatProfile === 'hot') notes.push('Hot room profile applied (+15% load).');
  if (room.heatProfile === 'warm') notes.push('Warm room profile applied (+10% load).');
  if (occupants > 1) notes.push(`${occupants - 1} extra occupant${occupants - 1 === 1 ? '' : 's'} added ${occupantLoad.toLocaleString()} BTU.`);
  if (room.westFacing) notes.push('West-facing room can pick up stronger afternoon sun and may need extra headroom.');
  if (room.largeWindows) notes.push('Large windows can increase solar heat gain beyond this quick estimate.');
  if ((room.floor ?? 0) >= 20) notes.push('Higher floor exposure may raise heat load slightly in summer.');
  if (calculatedBtu > 24000) notes.push('Single-room load exceeds a typical 24k unit; consider ducted or zoned design.');

  return {
    ...room,
    occupants,
    areaSqm,
    volumeCbm,
    calculatedBtu,
    recommendedAcType,
    suggestedUnitSize,
    notes,
  };
};

export const calculateSummary = (rooms: RoomResult[], combineRooms: boolean): CalculatorSummary => {
  const totalBtu = rooms.reduce((sum, room) => sum + room.calculatedBtu, 0);
  const shoppingListMap = new Map<number, number>();
  rooms.forEach((room) => {
    shoppingListMap.set(room.suggestedUnitSize, (shoppingListMap.get(room.suggestedUnitSize) || 0) + 1);
  });

  const shoppingList = Array.from(shoppingListMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([unitSize, count]) => ({ unitSize, count }));

  const recommendedSystem = combineRooms || totalBtu > 36000
    ? 'Multi-split or VRF/VRV system is worth considering.'
    : totalBtu > 24000
      ? 'A multi-split outdoor unit may suit this home better than separate window units.'
      : 'Individual room units should be practical for this home.';

  const compressorTarget = Math.round(totalBtu * (combineRooms || totalBtu > 24000 ? 0.95 : 1));
  const compressorSize = COMPRESSOR_SIZES.find((size) => compressorTarget <= size) || COMPRESSOR_SIZES[COMPRESSOR_SIZES.length - 1];
  const compressorSuggestion = combineRooms || totalBtu > 24000
    ? `Heuristic outdoor compressor allowance: around ${formatBtu(compressorTarget)} connected load; start by reviewing a ${formatUnitSize(compressorSize)} outdoor unit with a licensed AC professional.`
    : `If using individual room units, you can usually size each indoor/outdoor pairing close to the room recommendation. For grouped systems, review about ${formatUnitSize(compressorSize)} total outdoor capacity.`;

  const summaryNotes: string[] = [
    'This is a quick Hong Kong apartment rule-of-thumb estimate, not a final engineering design.',
    'Ceiling insulation, glazing, direct sun, appliances, and facade exposure can all change the result.',
    'A licensed professional should verify final unit sizing, refrigerant routing, drainage, and electrical load.',
  ];

  if (combineRooms) {
    summaryNotes.unshift('Rooms are being considered together, so ducted or zoned systems become more relevant.');
  }

  return {
    totalBtu,
    recommendedSystem,
    shoppingList,
    compressorSuggestion,
    summaryNotes,
  };
};
