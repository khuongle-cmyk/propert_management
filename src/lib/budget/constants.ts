export const BUDGET_REVENUE_CATEGORIES = [
  "office_rent",
  "meeting_room",
  "hot_desk",
  "venue",
  "virtual_office",
  "furniture",
  "additional_services",
] as const;
export type BudgetRevenueCategory = (typeof BUDGET_REVENUE_CATEGORIES)[number];

export const BUDGET_REVENUE_LABELS: Record<BudgetRevenueCategory, string> = {
  office_rent: "Office rent",
  meeting_room: "Meeting rooms",
  hot_desk: "Hot desks",
  venue: "Venues",
  virtual_office: "Virtual office",
  furniture: "Furniture",
  additional_services: "Additional services",
};

export const BUDGET_COST_TYPES = [
  "cleaning",
  "utilities",
  "property_management",
  "insurance",
  "security",
  "it_infrastructure",
  "marketing",
  "staff",
  "capex",
  "other",
] as const;
export type BudgetCostType = (typeof BUDGET_COST_TYPES)[number];

export const BUDGET_COST_LABELS: Record<BudgetCostType, string> = {
  cleaning: "Cleaning",
  utilities: "Utilities",
  property_management: "Property management fees",
  insurance: "Insurance",
  security: "Security",
  it_infrastructure: "IT & infrastructure",
  marketing: "Marketing",
  staff: "Staff (from headcount)",
  capex: "CapEx (operating line)",
  other: "Other one-off costs",
};

/** Editable cost rows in UI (staff is derived from headcount). */
export const BUDGET_COST_EDITABLE: BudgetCostType[] = [
  "cleaning",
  "utilities",
  "property_management",
  "insurance",
  "security",
  "it_infrastructure",
  "marketing",
  "capex",
  "other",
];

export const BUDGET_CAPEX_CATEGORIES = ["renovation", "equipment", "furniture", "it", "other"] as const;
export type BudgetCapexCategory = (typeof BUDGET_CAPEX_CATEGORIES)[number];

export const BUDGET_CAPEX_STATUS = ["planned", "approved", "in_progress", "completed"] as const;
export type BudgetCapexStatus = (typeof BUDGET_CAPEX_STATUS)[number];

export const BUDGET_OCCUPANCY_SPACE_TYPES = ["office", "hot_desk", "meeting_room", "venue"] as const;
export type BudgetOccupancySpaceType = (typeof BUDGET_OCCUPANCY_SPACE_TYPES)[number];

export const BUDGET_OCCUPANCY_LABELS: Record<BudgetOccupancySpaceType, string> = {
  office: "Offices",
  hot_desk: "Hot desks",
  meeting_room: "Meeting rooms",
  venue: "Venues",
};

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const BUDGET_STATUSES = ["draft", "approved", "active", "archived"] as const;
export const BUDGET_TYPES = ["annual", "reforecast"] as const;
