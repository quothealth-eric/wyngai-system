export type MoneyCents = number;

export interface PolicyCitation {
  title: string;
  authority: "Federal" | "CMS" | "StateDOI" | "PayerPolicy";
  citation: string;
}