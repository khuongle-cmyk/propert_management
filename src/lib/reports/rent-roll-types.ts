/** Request / response model for rent roll + revenue forecast reports. */

export type ReportSections = {
  officeRents: boolean;
  meetingRoomRevenue: boolean;
  hotDeskRevenue: boolean;
  venueRevenue: boolean;
  additionalServices: boolean;
  virtualOfficeRevenue: boolean;
  furnitureRevenue: boolean;
  vacancyForecast: boolean;
  revenueVsTarget: boolean;
  roomByRoom: boolean;
  tenantByTenant: boolean;
  monthlySummary: boolean;
  /** When true, report includes historical_costs breakdown and net income under monthly summary. */
  showCosts: boolean;
};

export const defaultReportSections = (): ReportSections => ({
  officeRents: true,
  meetingRoomRevenue: true,
  hotDeskRevenue: true,
  venueRevenue: true,
  additionalServices: true,
  virtualOfficeRevenue: true,
  furnitureRevenue: true,
  vacancyForecast: true,
  revenueVsTarget: false,
  roomByRoom: true,
  tenantByTenant: true,
  monthlySummary: true,
  showCosts: false,
});

/** Shared by API routes that parse `sections` from JSON bodies. */
export function coerceReportSections(raw: unknown): ReportSections {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    officeRents: !!d.officeRents,
    meetingRoomRevenue: !!d.meetingRoomRevenue,
    hotDeskRevenue: !!d.hotDeskRevenue,
    venueRevenue: !!d.venueRevenue,
    additionalServices: !!d.additionalServices,
    virtualOfficeRevenue: !!d.virtualOfficeRevenue,
    furnitureRevenue: !!d.furnitureRevenue,
    vacancyForecast: !!d.vacancyForecast,
    revenueVsTarget: !!d.revenueVsTarget,
    roomByRoom: !!d.roomByRoom,
    tenantByTenant: !!d.tenantByTenant,
    monthlySummary: !!d.monthlySummary,
    showCosts: !!d.showCosts,
  };
}

export type RentRollRequestBody = {
  propertyIds: string[] | null;
  startDate: string;
  endDate: string;
  sections: ReportSections;
  /** When revenueVsTarget is true, compares monthly totals to this amount (same currency as data). */
  revenueTargetMonthly?: number | null;
};

export type OfficeRentRow = {
  monthKey: string;
  propertyId: string;
  propertyName: string;
  spaceId: string;
  roomNumber: string | null;
  spaceName: string;
  spaceType: string;
  lessee: string;
  contractStart: string | null;
  contractEnd: string | null;
  contractStatus: string;
  contractMonthlyRent: number;
  invoicedBaseRent: number | null;
  invoicedAdditionalServices: number | null;
  invoicedTotal: number | null;
};

export type VacancyRow = {
  monthKey: string;
  propertyId: string;
  propertyName: string;
  spaceId: string;
  roomNumber: string | null;
  spaceName: string;
  spaceType: string;
  listMonthlyRent: number | null;
  listHourly: number | null;
  note: string;
};

export type MonthlyRevenueBreakdown = {
  monthKey: string;
  officeContractRent: number;
  meetingRoomBookings: number;
  hotDeskBookings: number;
  venueBookings: number;
  additionalServices: number;
  virtualOfficeRevenue: number;
  furnitureRevenue: number;
  total: number;
};

/** Monthly cost roll-up from `historical_costs` (Procountor / import), aligned to rent-roll month keys. */
export type MonthlyCostBreakdownRow = {
  monthKey: string;
  materialsServices: number;
  personnel: number;
  otherOperating: number;
  totalCosts: number;
  revenueTotal: number;
  netIncome: number;
  netMarginPct: number | null;
};

export type RevenueVsTargetRow = {
  monthKey: string;
  total: number;
  target: number;
  variance: number;
  variancePct: number | null;
};

export type RoomMonthCell = {
  monthKey: string;
  amount: number;
  basis: string;
};

export type RoomByRoomRow = {
  propertyId: string;
  propertyName: string;
  spaceId: string;
  roomNumber: string | null;
  spaceName: string;
  spaceType: string;
  months: RoomMonthCell[];
};

export type TenantBreakdownRow = {
  bucketKey: string;
  displayName: string;
  officeContractRent: number;
  bookingRevenue: number;
  additionalServices: number;
  total: number;
};

export type RentRollReportModel = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  monthKeys: string[];
  sections: ReportSections;
  revenueTargetMonthly: number | null;
  properties: { id: string; name: string; city: string | null }[];
  officeRentRoll: OfficeRentRow[];
  revenueByMonth: {
    meeting: Record<string, number>;
    hotDesk: Record<string, number>;
    venue: Record<string, number>;
    additionalServices: Record<string, number>;
    virtualOffice: Record<string, number>;
    furniture: Record<string, number>;
  };
  monthlySummary: MonthlyRevenueBreakdown[];
  /** Populated when `sections.showCosts` is true. */
  monthlyCostBreakdown: MonthlyCostBreakdownRow[];
  vacancyForecast: VacancyRow[];
  revenueVsTarget: RevenueVsTargetRow[];
  roomByRoom: RoomByRoomRow[];
  tenantByTenant: TenantBreakdownRow[];
};
